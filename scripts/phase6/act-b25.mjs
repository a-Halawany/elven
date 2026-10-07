#!/usr/bin/env node
/**
 * CP-6 batch B25 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE FORECASTING
 * PORTFOLIO (migration 0108; F-P4-01, F-P4-02, F-P4-03 complete; F-P5-03's environment advanced) — exercised by the personas through the REAL
 * HTTP path. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and says
 * "stands — an earlier run" instead of writing it twice. No clock is moved, no row is planted: every write is a persona's governed act, every
 * collection the real connector's.
 *
 *   B25-0 THE STATE: 0108 applied; the casting read from identity.role_bindings (N. Eriksen forecast_owner, H. Petrović method_steward,
 *         T. Richter domain_admin, J. Weber strategy_owner, K. Müller knowledge_owner, A. Hoffmann domain_analyst, M. Dvořák collection_manager
 *         + executive); the corridor series portwatch:chokepoint4:n_total, the corridor twin "NORDWERK — Ningbo → Regensburg chain" and what
 *         the demonstration's graph does and does not hold (it holds NO Bab el-Mandeb Strait entity: the chokepoint4 series names no subject).
 *   B25-R §MR THE REGISTRY: N. Eriksen PROPOSES event_rate@1, regime_judgement@1 (his declared structural judgement) and bayes_level@1 (a
 *         Normal–linear level of the 60-day mean, explicit weakly-informative priors, a no-drift alternative); H. Petrović (the named steward)
 *         APPROVES each. N. Eriksen DECLARES the target corridor.bab-el-mandeb.transit-delay — the B27/B28 indicator's event (transits < 41 a day
 *         on 5 consecutive published observations) on the REAL transit series, the regime categories at 3y/5y; T. Richter APPROVES it. N.
 *         Eriksen PUBLISHES the horizon policy (30d intervention windows → probability; 3y/5y regimes → scenario language; a 3y/5y QUANTITY
 *         requires a rolling-origin validation with ≥ 20 origins); H. Petrović CONCURS.
 *   B25-H THE EVIDENCE FOR THE HORIZONS: the corridor's real PortWatch history (what the 30d event rests on, counted from the ledger); the
 *         ECB EUR/USD reference rate as a SEPARATE BOUNDED HISTORY SOURCE ecb-eurusd-history (A. Hoffmann registers it, M. Dvořák approves,
 *         confirms its rights and activates it, the administrator provisions its agent; ONE collection through the real REST connector of the
 *         date-bounded query 1999-01-04 → 2026-09-30; then M. Dvořák RETIRES the contract, so nothing is scheduled for it); N. Eriksen
 *         registers its series and runs bayes_level@1's rolling-origin VALIDATION at 3y and 5y on it (100 origins each, spread over the whole
 *         history) — an EMPIRICAL validation (retrospective: one vintage), reported as it came out; then the 5y (and 3y) quantity forecast on
 *         that series: issued validated_retrospective if the validation passed, REFUSED naming the failed validation if not. The live
 *         ecb-eurusd and PortWatch contracts are not touched.
 *   B25-F1 (F-P4-01): N. Eriksen validates event_rate@1 at 30d on the target (the event backtest on the real history) and issues through
 *         portfolio/issue the 30d EVENT and the 5y REGIME — different methods per horizon in the packages; a 3y QUANTITY request on the corridor
 *         series is REFUSED naming the missing validation (forecast.horizon_refused).
 *   B25-F3 (F-P4-03): N. Eriksen issues a GROUNDED 30d forecast on portwatch:chokepoint1:n_total (the Suez Canal series — the corridor
 *         twin's boundary place, the only corridor series with a subject on this demonstration) pinning the twin snapshot and the graph
 *         revision; he REPLAYS it (REPRODUCED); K. Müller commits a change set through the B23 route touching that subject (MV Hanse Trader
 *         transits the Suez Canal, resting on the extracted claim); the replay is REPRODUCED again while a fresh grounding differs.
 *   B25-F2 (F-P4-02): M. Dvořák publishes the next attention-policy version with forecast.disagreement → the forecast owner (every existing
 *         class byte-identical); J. Weber declares the shared assumption and one tied to each method; N. Eriksen issues the ENSEMBLE on the
 *         corridor series at 30d cut at 2024-01-11 (the week the strait emptied — where the two methods genuinely disagree on the real data);
 *         both distributions, the ensemble, the disagreement and the SPLITTING assumption; the escalation routed to him; he adds a labelled
 *         JUDGEMENT overlay; A. Hoffmann's writes are refused.
 *   B25-9 THE STATE, the env lines for the three walks, the LIMITS said.
 *
 * Real public collections go through the governed routes and the real connector; everything else is SYNTHETIC and said so. Nothing prints a
 * credential: the personas' passwords are EYE_TEST_ADMIN_PASSWORD from the environment, as every other persona's.
 *
 * TIMING: every read of a PortWatch series is ~8,900 governed evidence retrievals (each audited) — ~15–20 minutes on this host. The routes
 * that read one are called without a client timeout and the act waits.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, digest, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

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
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive/attention`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 400)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const f4 = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(4).replace(/\.?0+$/, ''));
const tStart = Date.now();
const mins = (t0) => `${((Date.now() - t0) / 60000).toFixed(1)} min`;
console.log(`THE B25 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${status} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
/** The governed envelope of governed.mjs call(), sent WITHOUT a client timeout: a route that reads a PortWatch series runs for minutes. */
function callLong(path, over, payload = {}, token = null) {
  const envelope = { message_id: randomUUID(), scope: over.scope, tenant_id: over.tenantId ?? null, domain_id: over.domainId ?? null, principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'observation', action: over.action, side_effect_class: over.sideEffect ?? 'reversible', consequence_class: over.consequence ?? 'C1',
    object_type: over.objectType, object_id: over.objectId ?? null, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: randomUUID(), trace_id: over.trace ?? 'phase6-b25', payload_digest: digest(payload) };
  const body = JSON.stringify({ envelope, payload });
  const u = new URL(API + path);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let data = ''; res.setEncoding('utf8'); res.on('data', (c) => { data += c; });
      res.on('end', () => { let b = {}; try { b = JSON.parse(data); } catch { b = { raw: data.slice(0, 300) }; } resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: b }); });
    });
    // keep the idle socket alive while the server reads for minutes; a transport error is an answer (status 0), not a crash — the
    // act is rerun-safe: whatever the server completed is found and stands on the next run
    req.on('socket', (sock) => sock.setKeepAlive(true, 30_000));
    req.setTimeout(0); req.on('error', (e) => resolve({ ok: false, status: 0, body: { code: e.code ?? 'TRANSPORT', message: `the connection failed before an answer: ${e.message}` } })); req.end(body);
  });
}
const ENV_OUT = {};
const dom = (s, purpose, over) => as(s, scope, { purposeId: purpose, consequence: 'C2', ...over });
const READ = { sideEffect: 'none' };

/* ── the names the act uses ── */
const TARGET_KEY = 'corridor.bab-el-mandeb.transit-delay';
const CORRIDOR = 'portwatch:chokepoint4:n_total';
const GROUNDED = 'portwatch:chokepoint1:n_total';
const TWIN_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const ECB_KEY = 'ecb-eurusd-history';
const ECB_BASE = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A';
const ECB_ENDPOINT = `${ECB_BASE}?format=jsondata&startPeriod=1999-01-04&endPeriod=2026-09-30`;
const ENS_CUT = '2024-01-11';   // the ensemble's observed-through: the week the strait emptied (chosen on the rehearsal's real data — see B25-F2)
const ENS_HORIZON = '30d';

/* ── B25-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB25-0 THE STATE — 0108, the casting, the corridor series and twin, what the graph holds');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0108%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0108 is not applied'); process.exit(1); }
}
const CAST = { 'n.eriksen': ['forecast_owner'], 'h.petrovic': ['method_steward'], 't.richter': ['domain_admin'], 'j.weber': ['strategy_owner'], 'k.mueller': ['knowledge_owner'],
  'a.hoffmann': ['domain_analyst'], 'm.dvorak': ['collection_manager', 'executive'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')} — no persona or role is created`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l, at: Date.now() }; };
/** A session lives 15 minutes and a PortWatch read takes minutes: each persona's session is renewed (a fresh login) before a long call and at
 *  each scene — the persona object keeps its identity, its token is replaced. */
const renew = async (s) => { const n = await login(s.login, PW); if (n === null) { bad(`${s.login} could not authenticate again`); return s; } Object.assign(s, n, { at: Date.now() }); return s; };
const renewAll = async () => { for (const s of [eriksen, petrovic, richter, weber, mueller, hoffmann, dvorak]) await renew(s); };
/** A long route as a persona: the session renewed first, then the call without a client timeout. */
const longAs = async (s, path, over, payload) => { await renew(s); return callLong(path, over, payload, s.token); };
const eriksen = await who('n.eriksen'); const petrovic = await who('h.petrovic'); const richter = await who('t.richter'); const weber = await who('j.weber');
const mueller = await who('k.mueller'); const hoffmann = await who('a.hoffmann'); const dvorak = await who('m.dvorak');
const NAME = { [eriksen.principalId]: 'N. Eriksen', [petrovic.principalId]: 'H. Petrović', [richter.principalId]: 'T. Richter', [weber.principalId]: 'J. Weber',
  [mueller.principalId]: 'K. Müller', [hoffmann.principalId]: 'A. Hoffmann', [dvorak.principalId]: 'M. Dvořák', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const pe = (s, over) => dom(s, 'prediction', over);
const SERIES = Object.fromEntries((await q(`select series_key, source_key, subject_entity_id::text subject, unit from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = any($3::text[])`,
  [T, D, [CORRIDOR, GROUNDED]])).map((r) => [r.series_key, r]));
if (!SERIES[CORRIDOR] || !SERIES[GROUNDED]) { bad(`the corridor series are not both registered (${Object.keys(SERIES).join(', ') || 'neither'})`); process.exit(1); }
const TWIN = (await q(`select twin_id::text, boundary from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, TWIN_TITLE]))[0] ?? null;
if (TWIN === null) { bad(`the corridor twin "${TWIN_TITLE}" is absent`); process.exit(1); }
const SUEZ = SERIES[GROUNDED].subject === null ? null : (await q(`select entity_id::text, canonical_name, entity_type from graph.entities_current where entity_id = $1`, [SERIES[GROUNDED].subject]))[0] ?? null;
const strait = await q(`select entity_id::text, canonical_name from graph.entities_current where tenant_id = $1 and domain_id = $2 and lifecycle_state = 'active' and canonical_name ilike '%mandeb%'`, [T, D]);
note(`the corridor series ${CORRIDOR} (${SERIES[CORRIDOR].unit}, source ${SERIES[CORRIDOR].source_key}) names ${SERIES[CORRIDOR].subject === null ? 'NO subject entity' : `subject ${short(SERIES[CORRIDOR].subject)}`}; the graph holds ${strait.length === 0 ? 'NO Bab el-Mandeb Strait entity (its extracted ENT claim "Bab el-Mandeb" is still queued for review)' : strait.map((s) => s.canonical_name).join(', ')}`);
(SUEZ !== null && (TWIN.boundary ?? []).includes(SUEZ.entity_id) ? ok : bad)(`the corridor twin ${short(TWIN.twin_id)} "${TWIN_TITLE}" — its boundary holds ${SUEZ?.canonical_name ?? '—'} (${SUEZ?.entity_type ?? '—'} ${short(SUEZ?.entity_id)}), the subject of ${GROUNDED}: the corridor series a forecast can be GROUNDED on (graph context and the twin snapshot)`);
ENV_OUT.EYE_B25_FORECASTER = 'n.eriksen'; ENV_OUT.EYE_B25_READER = 'a.hoffmann'; ENV_OUT.EYE_B25_ANALYST = 'a.hoffmann';

/* ── B25-R §MR THE REGISTRY ──────────────────────────────────────────────────────────── */
console.log('\nB25-R §MR THE REGISTRY — N. Eriksen proposes the corridor\'s methods, H. Petrović approves; the target (T. Richter approves); the horizon policy (H. Petrović concurs)');
const H6 = ['30d', '90d', '180d', '1y', '3y', '5y'];
const NL = (i, s) => ({ model: 'normal_linear', window_days: 60, intercept: { mean: 0, sd: i }, slope_per_year: { mean: 0, sd: s } });
const METHODS = [
  { methodKey: 'event_rate', family: 'event', horizons: ['30d', '90d'], steward: petrovic.principalId,
    description: 'P(the target\'s declared event within the window) from counted non-overlapping windows of the series, under an explicit uniform Beta(1, 1) prior',
    declarations: { prior: { alpha: 1, beta: 1 } }, parameters: { min_windows: 12 } },
  { methodKey: 'regime_judgement', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['3y', '5y'], steward: petrovic.principalId,
    description: 'Regime probabilities of the corridor from N. Eriksen\'s declared structural judgement and counted 90-day classification windows — scenario language, never validated',
    declarations: { judgement: { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, judged_by: eriksen.principalId,
      rationale: 'N. Eriksen\'s structural judgement of the strait over five years: open is the long-run norm, a disrupted regime recurs, a full closure is rare (a SYNTHETIC judgement — his, declared and weighted)' } } },
  { methodKey: 'bayes_level', family: 'bayesian', horizons: H6, steward: petrovic.principalId,
    description: 'Normal–linear level of the 60-day mean with EXPLICIT weakly-informative priors (intercept N(0, 1000²), slope N(0, 100²) per year) — the data decide level and trend; a no-drift alternative tests the trend',
    declarations: { prior: NL(1000, 100), alternatives: [{ label: 'no drift (slope N(0, 0.001²) per year)', prior: NL(1000, 0.001) }] } },
];
const methodRow = async (key) => (await q(`select method_id::text, method_ref, version, state, family, proposed_by::text, decided_by::text from prediction.forecast_methods where tenant_id = $1 and domain_id = $2 and method_key = $3 order by version desc limit 1`, [T, D, key]))[0] ?? null;
for (const m of METHODS) {
  let row = await methodRow(m.methodKey);
  if (row === null) {
    const r = await call(`${P}/registry/methods/propose`, pe(eriksen, { action: 'prediction.registry.method.propose', objectType: 'FMR' }), m, eriksen.token);
    if (!r.ok) { fail(`N. Eriksen proposes ${m.methodKey}`, r); continue; }
    ok(`N. Eriksen PROPOSED ${r.body.method.method_ref} (${r.body.method.family}; ${(r.body.method.horizons ?? m.horizons).join(', ')}; implementation ${r.body.method.implementation_ref} ${String(r.body.method.implementation_digest).slice(0, 12)}…) — steward H. Petrović`);
    row = await methodRow(m.methodKey);
  }
  if (row.state === 'proposed') {
    const r = await call(`${P}/registry/methods/${row.method_id}/decide`, pe(petrovic, { action: 'prediction.registry.method.approve', objectType: 'FMR', objectId: row.method_id }),
      { decision: 'approve', note: `the declarations and the implementation reviewed against the corridor's needs (${m.family})` }, petrovic.token);
    if (!r.ok) fail(`H. Petrović approves ${row.method_ref}`, r); else ok(`H. Petrović (the named method steward) APPROVED ${r.body.method.method_ref} → ${r.body.method.state}`);
    row = await methodRow(m.methodKey);
  } else note(`${row.method_ref} stands ${row.state} (proposed by ${nm(row.proposed_by)}, decided by ${nm(row.decided_by)}) — an earlier run`);
  (row?.state === 'approved' && row.decided_by === petrovic.principalId ? ok : bad)(`${row?.method_ref} — ${row?.family}, ${row?.state}`);
}
ENV_OUT.EYE_B25_EVENT_METHOD = 'event_rate@1'; ENV_OUT.EYE_B25_REGIME_METHOD = 'regime_judgement@1';
// THE TARGET
const IND = (await q(`select indicator_id::text, description, comparator, threshold, consecutive_days from prediction.indicators_current where tenant_id = $1 and domain_id = $2 and series_key = $3 and state = 'active' and observes_from is null order by defined_at limit 1`, [T, D, CORRIDOR]))[0] ?? null;
if (IND) note(`the corridor indicator the event reads (B27/B28): "${IND.description}" — ${IND.comparator} ${IND.threshold} on ${IND.consecutive_days} consecutive observations`);
const EVT = { comparator: IND?.comparator ?? '<', threshold: Number(IND?.threshold ?? 41), consecutive: Number(IND?.consecutive_days ?? 5) };
const TARGET = { targetKey: TARGET_KEY, kind: 'event', unit: 'probability', title: 'Bab el-Mandeb transit delay — the corridor\'s transits collapse (the B27/B28 indicator\'s event)', subjectEntityId: null,
  definition: { series_key: CORRIDOR, event: EVT, horizon_kinds: { '3y': 'regime', '5y': 'regime' },
    regime: { classification_window_days: 90, categories: [{ key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 10 } },
      { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 50 } }, { key: 'open', label: 'open', rule: null }] } },
  sources: { series: [CORRIDOR], twin_elements: ['shock.corridor_delay_days'], indicator_id: IND?.indicator_id ?? null,
    note: '"transit delay" is read on the REAL transit COUNT series: the event is the indicator\'s collapse condition; the regime categories classify 90-day mean transits/day; the twin\'s corridor-delay element is a declared feature only. The series names no subject entity on this demonstration (no Bab el-Mandeb Strait entity).' } };
const targetRow = async () => (await q(`select target_id::text, version, state, declared_by::text, decided_by::text from prediction.forecast_targets where tenant_id = $1 and domain_id = $2 and target_key = $3 order by version desc limit 1`, [T, D, TARGET_KEY]))[0] ?? null;
{
  let t = await targetRow();
  if (t === null) {
    const r = await call(`${P}/registry/targets/declare`, pe(eriksen, { action: 'prediction.registry.target.declare', objectType: 'FTG' }), TARGET, eriksen.token);
    if (!r.ok) fail('N. Eriksen declares the target', r); else ok(`N. Eriksen DECLARED the target ${TARGET_KEY} v${r.body.target.version}: an EVENT (${CORRIDOR} ${EVT.comparator} ${EVT.threshold} on ${EVT.consecutive} consecutive published observations) at 30d, a REGIME (closed < 10 · disrupted < 50 · open; 90-day windows) at 3y and 5y`);
    t = await targetRow();
  }
  if (t?.state === 'proposed') {
    const r = await call(`${P}/registry/targets/${t.target_id}/decide`, pe(richter, { action: 'prediction.registry.target.approve', objectType: 'FTG', objectId: t.target_id }),
      { decision: 'approve', note: 'the event is the corridor indicator\'s own definition; the regime thresholds read the series\' published levels' }, richter.token);
    if (!r.ok) fail('T. Richter approves the target', r); else ok(`T. Richter (domain administrator) APPROVED the target → ${r.body.target.state}`);
    t = await targetRow();
  } else if (t) note(`the target ${TARGET_KEY} v${t.version} stands ${t.state} (declared by ${nm(t.declared_by)}, decided by ${nm(t.decided_by)}) — an earlier run`);
  (t?.state === 'approved' && t.declared_by === eriksen.principalId && t.decided_by === richter.principalId ? ok : bad)(`the target ${TARGET_KEY} v${t?.version} is APPROVED by a named human who did not declare it`);
  ENV_OUT.EYE_B25_TARGET_KEY = TARGET_KEY;
}
// THE HORIZON POLICY
const VREQ = { required: true, kind: 'quantity_rolling_origin', min_origins: 20, modes: ['historical', 'retrospective'] };
const RULES = {
  '30d': { treatment: 'intervention windows and freshness: what can still be acted on inside the month', allowed_families: ['event', 'statistical'],
           kinds: { event: { confidence_language: 'probability', validation: { required: false } }, quantity: { confidence_language: 'distribution', validation: { required: false } } } },
  '90d': { treatment: 'operational planning: distributions, the event probability beside them', allowed_families: ['event', 'statistical', 'bayesian'],
           kinds: { event: { confidence_language: 'probability', validation: { required: false } }, quantity: { confidence_language: 'distribution', validation: { required: false } } } },
  '180d': { treatment: 'budget and capacity: distributions read beside scenarios', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
  '1y': { treatment: 'annual planning: distributions read beside scenarios', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
  '3y': { treatment: 'regimes and path dependence: a quantity only where it is measured at 3y, else regime language', allowed_families: ['bayesian', 'structural_judgmental'],
          kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: VREQ }, regime: { confidence_language: 'scenario_language', validation: { required: false } } } },
  '5y': { treatment: 'regimes, path dependence, option value and resilience: scenario language', allowed_families: ['structural_judgmental', 'bayesian'],
          kinds: { regime: { confidence_language: 'scenario_language', validation: { required: false } }, quantity: { confidence_language: 'distribution_with_scenarios', validation: VREQ } } },
};
const policyRow = async () => (await q(`select policy_id::text, version, state, rules, published_by::text, concurred_by::text from prediction.horizon_policies where tenant_id = $1 and domain_id = $2 and risk_class = 'standard' order by version desc limit 1`, [T, D]))[0] ?? null;
{
  let p = await policyRow();
  const same = (x) => x !== null && digest(x.rules) === digest(RULES);
  if (!same(p) || p.state === 'rejected' || p.state === 'superseded') {
    const r = await call(`${P}/registry/policies/publish`, pe(eriksen, { action: 'prediction.registry.policy.publish', objectType: 'HZP' }),
      { riskClass: 'standard', steward: petrovic.principalId, rules: RULES, statement: 'the corridor domain\'s horizon treatment: 30d intervention windows in probabilities, 90d–1y distributions, 3y/5y regimes in scenario language — a 3y/5y QUANTITY only on a passed rolling-origin validation of ≥ 20 origins' }, eriksen.token);
    if (!r.ok) fail('N. Eriksen publishes the horizon policy', r); else ok(`N. Eriksen PUBLISHED horizon policy v${r.body.policy.version} (${r.body.policy.state}) — inert until the steward concurs`);
    p = await policyRow();
  }
  if (p?.state === 'proposed') {
    const r = await call(`${P}/registry/policies/${p.policy_id}/concur`, pe(petrovic, { action: 'prediction.registry.policy.concur', objectType: 'HZP', objectId: p.policy_id }),
      { decision: 'concur', note: 'the treatment per horizon and the validation bar at 3y/5y are right for the corridor' }, petrovic.token);
    if (!r.ok) fail('H. Petrović concurs', r); else ok(`H. Petrović CONCURRED → horizon policy v${r.body.policy.version} ${r.body.policy.state}`);
    p = await policyRow();
  } else if (p) note(`horizon policy v${p.version} stands ${p.state} (published by ${nm(p.published_by)}, concurred by ${nm(p.concurred_by)}) — an earlier run`);
  (p?.state === 'active' && same(p) && p.concurred_by === petrovic.principalId ? ok : bad)(`the ACTIVE horizon policy v${p?.version}: 30d ${RULES['30d'].allowed_families.join('/')} (event → probability) · 5y ${RULES['5y'].allowed_families.join('/')} (regime → scenario language) · 3y/5y quantity requires ${VREQ.kind} ≥ ${VREQ.min_origins} origins`);
}
const planOf = async (payload) => { const r = await call(`${P}/registry/plan`, pe(eriksen, { action: 'prediction.registry.plan.read', objectType: 'FMR', ...READ }), payload, eriksen.token); return r.ok ? r.body.plan : null; };
{
  const p30 = await planOf({ targetKey: TARGET_KEY, horizon: '30d' }); const p5 = await planOf({ targetKey: TARGET_KEY, horizon: '5y' });
  const avail = (p) => (p?.methods ?? []).filter((m) => m.available).map((m) => m.method_ref).join(', ');
  (p30?.forecast_kind === 'event' && p30?.confidence_language === 'probability' && p5?.forecast_kind === 'regime' && p5?.confidence_language === 'scenario_language' ? ok : bad)(`THE PLAN BY HORIZON (read only): ${TARGET_KEY} at 30d is a ${p30?.forecast_kind} in ${p30?.confidence_language} by [${avail(p30)}]; at 5y a ${p5?.forecast_kind} in ${p5?.confidence_language} by [${avail(p5)}]`);
}
const sharedAsuTitle = 'The PortWatch transit counts are read as published (the IMF / Oxford daily estimates)';
const asuRow = async (title) => (await q(`select strategy_object_id::text id, status from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and title = $3 order by 1 limit 1`, [T, D, title]))[0] ?? null;
const STRAIT_REL = (await q(`select c.object_id::text id from objects.canonical_objects c where c.tenant_id = $1 and c.domain_id = $2 and c.object_type = 'REL' and c.payload ->> 'predicate' = 'transits' and c.payload ->> 'object_value' = 'Bab el-Mandeb' and c.lifecycle_state = 'active' order by c.recorded_at limit 1`, [T, D]))[0] ?? null;
async function weberAsu(title, statement) {
  const row = await asuRow(title);
  if (row) { note(`J. Weber's assumption "${title}" stands (${row.status}) — an earlier run`); return row.id; }
  const restsOn = STRAIT_REL ? [{ kind: 'claim', id: STRAIT_REL.id, rationale: 'the assumption is about transits through Bab el-Mandeb (the extracted claim "MV Hanse Meridian transits Bab el-Mandeb")' }]
    : [{ kind: 'entity', id: SUEZ.entity_id, rationale: 'the corridor place the demonstration\'s graph holds' }];
  const r = await call(`${G}/strategy/declare`, dom(weber, 'graph', { action: 'graph.strategy.declare', objectType: 'ASU' }), { objectType: 'ASU', title, statement, restsOn }, weber.token);
  if (!r.ok) { fail(`J. Weber declares "${title}"`, r); return null; }
  ok(`J. Weber (strategy owner) DECLARED the assumption "${title}" (${short(r.body.strategy.objectId)}) — resting on ${restsOn[0].kind} ${short(restsOn[0].id)}`);
  return r.body.strategy.objectId;
}

/* ── B25-H THE EVIDENCE FOR THE HORIZONS ─────────────────────────────────────────────── */
await renewAll();
console.log('\nB25-H THE EVIDENCE FOR THE HORIZONS — the corridor\'s real PortWatch history; the ECB reference rate as a bounded history source, collected once; the 3y/5y validation on it');
let PW_DAYS = null;
{
  // the ledger's count (read-only): the chokepoint4 rows the live PortWatch contract has framed, by their stated day
  const pw = (await q(`with src as (select distinct source_id from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3)
     select count(distinct (e.event_time at time zone 'UTC')::date)::int days, min((e.event_time at time zone 'UTC')::date)::text first, max((e.event_time at time zone 'UTC')::date)::text last, count(*)::int frags
       from objects.canonical_objects e join objects.canonical_objects o on o.object_id = (e.payload ->> 'obs_object_id')::uuid and o.object_type = 'OBS' and o.object_version = 1
      where e.object_type = 'EVD' and exists (select 1 from src where e.provenance_ref like 'SRC:' || src.source_id::text || '@%') and jsonb_typeof(e.payload -> 'fragment') = 'object'
        and o.payload ->> 'item_key' like '%chokepoint4%'`, [T, D, SERIES[CORRIDOR].source_key]))[0];
  PW_DAYS = pw;
  const windows = pw.first && pw.last ? Math.floor((Date.parse(pw.last) - Date.parse(pw.first)) / 86_400_000 / 30) : 0;
  (pw.days >= 12 * 30 ? ok : bad)(`THE CORRIDOR'S REAL HISTORY (the ledger, read-only): ${pw.days} distinct daily observations of chokepoint4 framed from the IMF PortWatch chokepoints source, ${pw.first} → ${pw.last} (${pw.frags} framed rows) — about ${windows} non-overlapping 30-day windows for the 30d event (event_rate@1 needs 12): NO extension was needed, no history source was added for PortWatch`);
  const del = await q(`select count(distinct t.manifest_id)::int n from observation.blob_tombstones t join objects.canonical_objects e on e.object_type = 'EVD' and e.payload ->> 'manifest_id' = t.manifest_id::text
                        where t.tenant_id = $1 and t.domain_id = $2 and exists (select 1 from observation.source_contracts_current c where c.source_key = $3 and e.provenance_ref like 'SRC:' || c.source_id::text || '@%')`, [T, D, SERIES[CORRIDOR].source_key]);
  note(`the PortWatch source carries ${del[0].n} governed-deleted evidence manifest(s) (a 2024 replay-set fragment tombstoned by a retention action as superseded evidence; its two object versions share it): without the act-found correction (series.service.ts — a fragment a later version serves on its day is disclosed, not counted) every forecast on a PortWatch series is refused as an incomplete history; the routed issues below prove it complete`);
}
// THE ECB BOUNDED HISTORY SOURCE
const ecbContract = () => ({
  source_key: ECB_KEY, name: 'ECB EUR/USD reference rate — bounded history 1999-01-04 → 2026-09-30', publisher: 'European Central Bank', authority_class: 'authoritative',
  connector_kind: 'rest', acquisition_mode: 'live', data_origin: 'real',
  identity: { source_identity: ECB_KEY, publisher_identity: 'European Central Bank — ECB Data Portal', endpoints: [ECB_ENDPOINT], scheme_allowlist: ['https'], cadence_seconds: 86_400, jitter_seconds: 300, collection_window: null },
  authority_and_rights: { owner: 'observation.operations', steward: 'a.hoffmann', attribution: 'Source: ECB statistics.', authority: 'Official ECB daily euro foreign exchange reference rate',
    legal_basis: 'Public statistical publication under the ESCB reuse policy', rights_state: 'confirmed',
    licence: 'ESCB reuse policy: publicly available ESCB statistics may be reused free of charge, on condition that the source is quoted (e.g. "Source: ECB statistics.") and that the statistics, including metadata, are not modified.',
    permitted_use: ['internal analysis', 'display with attribution'], robots_policy: 'public API endpoint', purposes: ['observation', 'forecasting'], classification_ceiling: 'internal',
    residency: 'EU', retention: '24 months', deletion_obligation: 'none declared by the publisher' },
  security_and_operations: { credential_ref: null, authentication_method: 'anonymous (no credential required)',
    authenticity_method: { transport_endpoint: 'TLS certificate verification of the connected endpoint', byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
      source_origin: 'publisher host allowlisted from the contract and pinned at connect time', content_authenticity: 'unknown — this publisher offers no signature mechanism. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.' },
    budgets: { max_requests_per_run: 64, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 300_000, max_retries: 2 },   // the run's wall budget: 56 cold windows exceeded 60 s on the rehearsal
    expected_schema: { media_types: ['application/json'], required_fields: ['dataSets'], drift_tolerance: 0, max_bytes: 16_777_216 },
    freshness_expectation: { threshold_seconds: 31_536_000, expected_interval: 'none — a bounded history collected once (1999-01-04 → 2026-09-30)' },
    coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one observation per TARGET business day in [1999-01-04, 2026-09-30]', expected_items_per_window: 1, not_applicable_dimensions: [], not_applicable_reason: null },
    correction_channel: 'none: a bounded history; a restatement is a new source version',
    // THE BOUNDED QUERY, WALKED: the platform's egress timeout (eye.connector.request_timeout_ms, 20 s by default, 120 s at most) is shorter
    // than the ECB portal's answer to the whole range on a cold cache (~250 s, a gateway 504 after ~10 s) — so the same bounded range
    // 1999-01-04 → 2026-09-30 is collected by the closed-range backfill in half-year windows (each a date-bounded query of the same endpoint)
    backfill: { strategy: 'period-range', endpoint: `${ECB_BASE}?format=jsondata`, from: '1999-01-04', to: '2026-10-01', window_days: 183, start_param: 'startPeriod', end_param: 'endPeriod' } },
  lifecycle: { contract_version: 1, effective_from: '2026-10-06T00:00:00Z', effective_to: null, supersedes_version: null },
});
const ecbSrc = async () => (await q(`select source_id::text, contract_version, lifecycle_state, rights_state, acquisition_mode, data_origin, endpoints from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by contract_version desc limit 1`, [T, D, ECB_KEY]))[0] ?? null;
const ecbRuns = async (id) => q(`select run_id::text, state, items_admitted, items_noop, started_at, failure_reason from observation.collection_runs_current where source_id = $1 order by started_at`, [id]);
let ECB = await ecbSrc();
{
  const ob = (s, over) => dom(s, 'observation', over);
  if (ECB === null) {
    const r = await call(`${O}/sources/register`, ob(hoffmann, { action: 'observation.source.register', objectType: 'SRC' }), { contract: ecbContract() }, hoffmann.token);
    if (!r.ok) fail('A. Hoffmann registers ecb-eurusd-history', r); else ok(`A. Hoffmann REGISTERED "${ecbContract().name}" (source ${short(r.body.source.sourceId)}, contract v${r.body.source.contractVersion}, ${r.body.source.lifecycleState}): live, REAL, the date-bounded query ${ECB_ENDPOINT.replace(ECB_BASE, '…/EXR/D.USD.EUR.SP00.A')} walked as a closed-range backfill in 183-day windows (1999-01-04 → 2026-09-30)`);
    ECB = await ecbSrc();
  } else note(`the bounded history source ${ECB_KEY} stands (${short(ECB.source_id)} v${ECB.contract_version}, ${ECB.lifecycle_state}) — an earlier run`);
  if (ECB?.lifecycle_state === 'draft') {
    const a = await call(`${O}/sources/${ECB.source_id}/approve`, ob(dvorak, { action: 'observation.source.approve', objectType: 'SRC', objectId: ECB.source_id }),
      { contractVersion: ECB.contract_version, decision: 'approve', reason: 'the bounded ECB history reviewed: ESCB reuse terms as for ecb-eurusd, one date-bounded request, collected once for the 3y/5y validation' }, dvorak.token);
    if (a.ok) ok('M. Dvořák APPROVED it (a different operator from the registrar)'); else fail('M. Dvořák approves', a);
    const rr = await call(`${O}/sources/${ECB.source_id}/rights`, ob(dvorak, { action: 'observation.source.rights', objectType: 'SRC', objectId: ECB.source_id }),
      { contractVersion: ECB.contract_version, rightsState: 'confirmed', evidence: 'ESCB reuse policy (ecb.europa.eu): publicly available ESCB statistics may be reused free of charge on condition that the source is quoted ("Source: ECB statistics.") and that the statistics are not modified — the same terms the live ecb-eurusd contract records.' }, dvorak.token);
    if (rr.ok) ok('M. Dvořák RECORDED the rights evidence: confirmed (the ESCB reuse policy quoted)'); else fail('M. Dvořák records the rights', rr);
    ECB = await ecbSrc();
  }
  if (ECB?.lifecycle_state === 'approved') {
    const t = await call(`${O}/sources/${ECB.source_id}/transition`, ob(dvorak, { action: 'observation.source.transition', objectType: 'SRC', objectId: ECB.source_id }),
      { contractVersion: ECB.contract_version, target: 'active', reason: 'activated for its ONE collection (no agent yet: nothing is scheduled at activation)' }, dvorak.token);
    if (t.ok) ok('M. Dvořák ACTIVATED it — no collection agent exists yet, so no schedule is created at activation'); else fail('M. Dvořák activates', t);
    ECB = await ecbSrc();
  }
  if (ECB?.lifecycle_state === 'active') {
    // the agent: provisioned by the administrator (owner A. Hoffmann). The platform schedules an active collected source the moment it has an
    // agent (a source is never active without a schedule); its first iteration collects at once. That ONE collection is the act's; when it
    // has not run within a minute, M. Dvořák runs the same collection in its command form. Then the contract is RETIRED: the schedule removed.
    const agent = (await q(`select agent_id::text from observation.agents where source_id = $1 and status = 'active' limit 1`, [ECB.source_id]))[0] ?? null;
    const t0 = new Date(Date.now() - 5000);
    if (agent === null) {
      const r = await call(`${O}/agents/register`, { scope: 'DOMAIN', tenantId: T, domainId: D, action: 'observation.agent.register', objectType: 'AGT', objectId: null, principalId: `principal:${admin.principalId}`, purposeId: 'observation' },
        { sourceId: ECB.source_id, connector: 'rest', ownerPrincipalId: hoffmann.principalId }, admin.token);
      if (r.ok) ok(`the administrator PROVISIONED its collection agent ${short(r.body.agent.agentId)} (owner A. Hoffmann)`); else fail('the administrator provisions the agent', r);
    } else note(`its collection agent ${short(agent.agent_id)} is active — an earlier run`);
    let runs = await ecbRuns(ECB.source_id);
    // a minute for the schedule's first iteration to open its run; then as long as a run is still running (ten minutes at most)
    for (let i = 0; i < 30 && runs.length === 0; i += 1) { await sleep(2000); runs = await ecbRuns(ECB.source_id); }
    for (let i = 0; i < 300 && runs.some((x) => x.state === 'running'); i += 1) { await sleep(2000); runs = await ecbRuns(ECB.source_id); }
    // the command form when nothing collected it: the ECB portal answers a COLD full-range query with a 504 from its gateway (~10 s) while
    // its backend computes, and serves it once warm — so M. Dvořák retries, a minute apart, at most six times; every attempt is a recorded run
    const walked = async () => (await q(`select e.details -> 'checkpoint' -> 'backfill' ->> 'done' done, e.details -> 'checkpoint' -> 'backfill' ->> 'cursor' cursor from observation.collection_run_events e
      join observation.collection_runs_current r on r.run_id = e.run_id where r.source_id = $1 and e.event = 'run.checkpointed' order by e.occurred_at desc limit 1`, [ECB.source_id]))[0] ?? null;
    // the walk: as many runs as it takes (each inside the contract's budget), a failed attempt retried after half a minute — twelve attempts at most
    for (let attempt = 1; attempt <= 12 && (await walked())?.done !== 'true'; attempt += 1) {
      if (attempt > 1 && runs.length > 0 && runs[runs.length - 1].state !== 'finished') await sleep(30_000);
      const c = await call(`${O}/sources/${ECB.source_id}/collect`, ob(dvorak, { action: 'observation.run.trigger', objectType: 'RUN', consequence: 'C1' }), { contractVersion: Number(ECB.contract_version) }, dvorak.token);
      if (c.ok) { const w = await walked(); (c.body.run.state === 'finished' ? ok : note)(`M. Dvořák COLLECTED it (the command form, attempt ${attempt}): run ${short(c.body.run.runId)} ${c.body.run.state} — ${c.body.run.admitted} admitted, ${c.body.run.noop} unchanged${c.body.run.reason ? ` (${c.body.run.reason})` : ''}; the walk ${w?.done === 'true' ? 'DONE' : `at ${w?.cursor ?? 'its start'}`}`); }
      else if (c.status === 409) { note(`M. Dvořák's collection (attempt ${attempt}) waits: ${String(c.body?.message ?? '').slice(0, 160)}`); for (let i = 0; i < 300 && (await ecbRuns(ECB.source_id)).some((x) => x.state === 'running'); i += 1) await sleep(2000); }
      else fail(`M. Dvořák collects (attempt ${attempt})`, c);
      runs = await ecbRuns(ECB.source_id);
    }
    note(`the collection runs of ${ECB_KEY}: ${runs.map((x) => `${short(x.run_id)} ${x.state}${x.failure_reason ? ` [${String(x.failure_reason).slice(0, 120)}]` : ''} (${x.items_admitted} admitted, ${x.items_noop} unchanged) at ${iso(x.started_at)}`).join('; ')}`);
    if ((await walked())?.done === 'true') {
      const t = await call(`${O}/sources/${ECB.source_id}/transition`, ob(dvorak, { action: 'observation.source.transition', objectType: 'SRC', objectId: ECB.source_id }),
        { contractVersion: ECB.contract_version, target: 'retired', reason: 'the bounded history is collected (its closed-range walk is done); retired so that nothing is scheduled to collect it again — its evidence stays' }, dvorak.token);
      if (t.ok) ok('M. Dvořák RETIRED the contract once its closed-range walk was done — the schedule removed; the evidence stands'); else fail('M. Dvořák retires the contract', t);
      ECB = await ecbSrc();
    } else bad(`the bounded ECB history's walk is not done — not retired (the runs: ${runs.map((x) => `${x.state} ${x.items_admitted}`).join(', ') || 'none'})`);
  }
  const sched = ECB === null ? [] : await q(`select status, cadence_seconds from observation.scheduler_entries where source_id = $1`, [ECB.source_id]);
  const evd = ECB === null ? [] : await q(`select count(*)::int n, sum((payload ->> 'byte_length')::bigint)::bigint bytes, min(recorded_at) at from objects.canonical_objects where object_type = 'EVD' and provenance_ref like $1`, [`SRC:${ECB.source_id}@%`]);
  const runsAll = ECB === null ? [] : await ecbRuns(ECB.source_id);
  (ECB?.lifecycle_state === 'retired' && sched.every((s) => s.status !== 'scheduled') && evd[0]?.n >= 1 ? ok : bad)(`${ECB_KEY}: ${ECB?.lifecycle_state}, ${ECB?.acquisition_mode}, ${ECB?.data_origin}, rights ${ECB?.rights_state}; scheduler entry ${sched.map((s) => s.status).join(', ') || 'none'}; ${runsAll.length} collection run(s); ${evd[0]?.n} evidence object(s), ${Number(evd[0]?.bytes ?? 0).toLocaleString('en')} bytes, recorded ${iso(evd[0]?.at)} — through the real REST connector`);
  // ITS SERIES
  const ser = (await q(`select series_key from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = $3`, [T, D, ECB_KEY]))[0] ?? null;
  if (ser) note(`the series ${ECB_KEY} is registered — an earlier run`);
  else {
    const r = await call(`${P}/series/register`, pe(eriksen, { action: 'prediction.series.register', objectType: 'SER' }), { seriesKey: ECB_KEY, sourceKey: ECB_KEY, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', selector: null,
      unit: 'USD per EUR', seasonalityDays: 1, subjectEntityId: null, attribution: 'Source: ECB statistics.', description: 'ECB euro reference rate against the US dollar, daily (TARGET business days) — the bounded history 1999-01-04 → 2026-09-30',
      publicationCalendar: { rule: 'business-days', closures: [], authority: 'ECB: euro foreign exchange reference rates are published on TARGET business days only' } }, eriksen.token);
    if (r.ok) ok(`N. Eriksen REGISTERED the series ${ECB_KEY} (sdmx-json-observations@1, OBS_VALUE, USD per EUR)`); else fail('N. Eriksen registers the ECB history series', r);
  }
  ENV_OUT.EYE_B25_ECB_SERIES = ECB_KEY;
}
// THE 3y / 5y VALIDATION — bayes_level@1 on the real ECB history: 100 origins each, spread over the whole history (stride 83 days at 3y, 76 at 5y)
const VAL = { '3y': { origins: 100, stride: 83 }, '5y': { origins: 100, stride: 76 } };
const validationRow = async (methodRef, series, h, kind) => (await q(`select validation_id::text, backtest_id::text, kind, mode, origins, passed, verdict, metrics, window_from::text, window_to::text, synthetic, observations, computed_at
   from prediction.method_validations where tenant_id = $1 and domain_id = $2 and method_ref = $3 and series_key = $4 and horizon_code = $5 and kind = $6 and computed_by = $7 order by computed_at desc limit 1`, [T, D, methodRef, series, h, kind, eriksen.principalId]))[0] ?? null;
const ECB_VAL = {};
const ECB_HELD = ECB === null ? 0 : Number((await q(`select count(*)::int n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like $1`, [`SRC:${ECB.source_id}@%`]))[0].n);
if (ECB_HELD === 0) bad(`the bounded ECB history holds no evidence: the 3y/5y validation and the ECB quantity forecasts are NOT staged (nothing is recorded on an empty history)`);
for (const h of ECB_HELD === 0 ? [] : ['3y', '5y']) {
  let v = await validationRow('bayes_level@1', ECB_KEY, h, 'quantity_rolling_origin');
  if (v) note(`the ${h} validation of bayes_level@1 on ${ECB_KEY} stands (${iso(v.computed_at)}) — an earlier run`);
  else {
    const t0 = Date.now();
    await renew(eriksen);
    const r = await callLong(`${P}/registry/validations/run`, pe(eriksen, { action: 'prediction.registry.validation.record', objectType: 'MVL' }),
      { methodRef: 'bayes_level@1', seriesKey: ECB_KEY, horizon: h, origins: VAL[h].origins, stride: VAL[h].stride, minOrigins: 20, mode: 'retrospective' }, eriksen.token);
    if (!r.ok) fail(`N. Eriksen runs the ${h} validation on ${ECB_KEY}`, r); else note(`N. Eriksen RAN the ${h} rolling-origin validation (${mins(t0)})`);
    v = await validationRow('bayes_level@1', ECB_KEY, h, 'quantity_rolling_origin');
  }
  ECB_VAL[h] = v;
  if (v) (v.synthetic === false ? ok : bad)(`THE ${h.toUpperCase()} VALIDATION on the real ECB history (${v.mode}, ${v.observations} observations): ${v.origins} origins, history ${v.window_from} → ${v.window_to}; 80% coverage ${f4(v.metrics?.coverage)} (T1 75–85%: ${v.metrics?.t1 ? 'met' : 'NOT met'}), pinball ${f4(v.metrics?.pinball)} vs climatology ${f4(v.metrics?.reference_pinball)} (skill ${f4(v.metrics?.skill)}, climatology coverage ${f4(v.metrics?.reference_coverage)}) — ${v.passed ? 'PASSED' : 'NOT PASSED'}: "${String(v.verdict).slice(0, 360)}"`);
}
// THE ECB QUANTITY FORECASTS at 5y and 3y: issued validated_retrospective on a pass, REFUSED naming the failed validation otherwise
const FX_ASU = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and status = 'active' and title ilike '%EUR/USD%' order by 1 limit 1`, [T, D]))[0] ?? null;
const routeRow = async (series, h, outcome) => (await q(`select route_id::text, outcome, refusal, refusal_class, forecast_id::text, method_ref, requested_at from prediction.forecast_routes where tenant_id = $1 and domain_id = $2 and series_key = $3 and horizon_code = $4 and outcome = $5 and requested_by = $6 and target_key is null order by requested_at desc limit 1`,
  [T, D, series, h, outcome, eriksen.principalId]))[0] ?? null;
for (const h of ECB_HELD === 0 ? [] : ['5y', '3y']) {
  const issued = await routeRow(ECB_KEY, h, 'issued'); const refused = await routeRow(ECB_KEY, h, 'refused');
  const v = ECB_VAL[h];
  if (issued || refused) {
    const f = issued ? (await q(`select validation_state, validation_note, quantiles, statement from prediction.forecasts_current where forecast_id = $1`, [issued.forecast_id]))[0] : null;
    note(`the ${h} quantity route on ${ECB_KEY} stands — ${issued ? `ISSUED ${short(issued.forecast_id)} by ${issued.method_ref} [${f?.validation_state}]` : `REFUSED (${refused.refusal_class}): "${String(refused.refusal).slice(0, 300)}"`} — an earlier run`);
    ENV_OUT[`EYE_B25_ECB_${h.toUpperCase()}`] = issued ? f?.validation_state : 'refused';
    continue;
  }
  if (FX_ASU === null) { bad('no active EUR/USD assumption to rest the ECB forecasts on'); continue; }
  const t0 = Date.now();
  const r = await longAs(eriksen, `${P}/portfolio/issue`, pe(eriksen, { action: 'prediction.portfolio.issue', objectType: 'FCT' }), { seriesKey: ECB_KEY, horizon: h, assumptions: [FX_ASU.id], label: 'replay demonstration' });
  if (v?.passed) {
    if (r.ok && r.body.forecast?.validation_state === 'validated_retrospective') ok(`THE ${h} QUANTITY FORECAST on ${ECB_KEY} ISSUED ${short(r.body.forecast.forecastId)} by ${r.body.forecast.method_ref} — validated_retrospective (EMPIRICAL, retrospective: one vintage) (${mins(t0)}): "${String(r.body.forecast.statement).slice(0, 300)}"; note "${String(r.body.forecast.validation_note).slice(0, 300)}"`);
    else fail(`the ${h} quantity forecast on ${ECB_KEY} after a PASSED validation`, r);
    ENV_OUT[`EYE_B25_ECB_${h.toUpperCase()}`] = r.body?.forecast?.validation_state ?? 'failed';
  } else {
    if (expectRefused(`THE ${h} QUANTITY FORECAST on ${ECB_KEY} (its validation did NOT pass)`, r, 422, new RegExp(`^forecast rejected \\(horizon\\): ${ECB_KEY} at ${h} is unsupported — no passed quantity-rolling-origin validation of bayes_level@1 at ${h}`))) note(`the refusal names the failed validation: ${/the latest, recorded .*/.exec(String(r.body?.message ?? ''))?.[0]?.slice(0, 300) ?? '—'}`);
    ENV_OUT[`EYE_B25_ECB_${h.toUpperCase()}`] = 'refused';
  }
}

/* ── B25-F1 (F-P4-01) ────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB25-F1 (F-P4-01) — the corridor at 30d by the EVENT method (intervention window) and at 5y in REGIME language: different methods per horizon; the 3y quantity refused');
const ASU_SHARED = await weberAsu(sharedAsuTitle, 'the daily transit counts of the strait are taken as IMF PortWatch publishes them (satellite AIS estimates), revisions included');
{
  let v = await validationRow('event_rate@1', CORRIDOR, '30d', 'event_backtest');
  if (v) note(`the 30d event backtest of event_rate@1 on ${CORRIDOR} stands (${iso(v.computed_at)}) — an earlier run`);
  else {
    const t0 = Date.now();
    note('N. Eriksen runs the 30d EVENT backtest on the real history (the series read takes minutes)');
    await renew(eriksen);
    const r = await callLong(`${P}/registry/validations/run`, pe(eriksen, { action: 'prediction.registry.validation.record', objectType: 'MVL' }),
      { methodRef: 'event_rate@1', targetKey: TARGET_KEY, horizon: '30d', origins: 60, stride: 30, minOrigins: 20, mode: 'retrospective' }, eriksen.token);
    if (!r.ok) fail('N. Eriksen runs the 30d event backtest', r); else note(`the event backtest recorded (${mins(t0)})`);
    v = await validationRow('event_rate@1', CORRIDOR, '30d', 'event_backtest');
  }
  if (v) (v.synthetic === false ? ok : bad)(`THE 30d EVENT BACKTEST on the real corridor history (${v.mode}): ${v.origins} origins ${v.window_from} → ${v.window_to}; Brier ${f4(v.metrics?.brier)} vs the prior-mean reference ${f4(v.metrics?.reference_brier)} (skill ${f4(v.metrics?.brier_skill)}), log score ${f4(v.metrics?.log_score)}, mean probability ${f4(v.metrics?.mean_probability)} vs observed frequency ${f4(v.metrics?.observed_frequency)} (gap ${f4(v.metrics?.calibration_gap)}) — ${v.passed ? 'PASSED' : 'NOT PASSED'}`);
}
const routedRow = async (h, methodRef) => (await q(`select f.forecast_id::text, f.method_ref, f.forecast_kind, f.validation_state, f.statement, f.horizon_policy, f.outcome_spec, f.information_set_id::text, f.environment_digest, f.issued_at
   from prediction.forecasts_current f where f.tenant_id = $1 and f.domain_id = $2 and f.target_key = $3 and f.horizon_code = $4 and f.method_ref = $5 and f.issued_by = $6 and f.state = 'issued' order by f.issued_at desc limit 1`, [T, D, TARGET_KEY, h, methodRef, eriksen.principalId]))[0] ?? null;
const ROUTED = {};
for (const [h, methodRef] of [['30d', 'event_rate@1'], ['5y', 'regime_judgement@1']]) {
  let f = await routedRow(h, methodRef);
  if (f) note(`the ${h} routed forecast ${short(f.forecast_id)} (${f.method_ref}) stands — an earlier run`);
  else if (ASU_SHARED) {
    const t0 = Date.now();
    note(`N. Eriksen issues ${TARGET_KEY} at ${h} through portfolio/issue (the series read takes minutes)`);
    const r = await longAs(eriksen, `${P}/portfolio/issue`, pe(eriksen, { action: 'prediction.portfolio.issue', objectType: 'FCT' }), { targetKey: TARGET_KEY, horizon: h, assumptions: [ASU_SHARED], label: 'live', refreshCadence: 'weekly' });
    if (!r.ok) fail(`N. Eriksen issues ${TARGET_KEY} at ${h}`, r); else ok(`N. Eriksen ISSUED ${TARGET_KEY} at ${h} through the portfolio (${mins(t0)}): ${short(r.body.forecast.forecastId)} by ${r.body.forecast.method_ref} (${r.body.forecast.family})`);
    f = await routedRow(h, methodRef);
  }
  ROUTED[h] = f;
}
{
  const a = ROUTED['30d']; const b = ROUTED['5y'];
  const pay = async (id) => (await q(`select schema_ref, payload from objects.canonical_objects where object_id = $1 and object_type = 'FCT' order by object_version desc limit 1`, [id]))[0] ?? null;
  if (a && b) {
    const pa = await pay(a.forecast_id); const pb = await pay(b.forecast_id);
    const oa = pa?.payload?.outcome ?? {}; const ob2 = pb?.payload?.outcome ?? {};
    (a.forecast_kind === 'event' && a.method_ref === 'event_rate@1' && a.horizon_policy?.confidence_language === 'probability' && /^P\(portwatch:chokepoint4:n_total < 41 on 5 consecutive published observation\(s\) within the 30d window/.test(a.statement) ? ok : bad)(
      `THE 30d PACKAGE ${short(a.forecast_id)} [${pa?.schema_ref}]: EVENT by ${a.method_ref} in ${a.horizon_policy?.confidence_language} (${a.horizon_policy?.treatment}) — "${a.statement.slice(0, 330)}"; evidence: ${oa.evidence?.windows} windows (${oa.evidence?.hits} with the event, ${oa.evidence?.skipped_coverage_gaps} coverage gaps skipped); ${a.validation_state}`);
    (b.forecast_kind === 'regime' && b.method_ref === 'regime_judgement@1' && b.validation_state === 'scenario_language' && /^SCENARIO LANGUAGE, NOT A VALIDATED FORECAST/.test(b.statement) && ob2.judgement?.judged_by === eriksen.principalId ? ok : bad)(
      `THE 5y PACKAGE ${short(b.forecast_id)} [${pb?.schema_ref}]: REGIME by ${b.method_ref} in ${b.horizon_policy?.confidence_language} — "${b.statement.slice(0, 330)}"; modal ${ob2.modal}; the judgement's share ${f4(ob2.judgement?.share)} (judged by ${nm(ob2.judgement?.judged_by)})`);
    (a.method_ref !== b.method_ref ? ok : bad)(`DIFFERENT METHODS PER HORIZON on one target: 30d ${a.method_ref} (event, probability) · 5y ${b.method_ref} (regime, scenario language) — the horizon policy v${a.horizon_policy?.version} chose them`);
    const ev = await q(`select forecast_id::text, event from prediction.forecast_events where forecast_id = any($1::uuid[]) order by occurred_at`, [[a.forecast_id, b.forecast_id]]);
    note(`their ledger: ${[a, b].map((x) => `${short(x.forecast_id)} ${ev.filter((e) => e.forecast_id === x.forecast_id).map((e) => e.event).join(' → ')}`).join('; ')}`);
  } else bad('the 30d and 5y routed forecasts are not both issued');
}
{
  const prior = await routeRow(CORRIDOR, '3y', 'refused');
  const RE = /^forecast rejected \(horizon\): portwatch:chokepoint4:n_total at 3y is unsupported — no passed quantity-rolling-origin validation of bayes_level@1 at 3y with at least 20 origins/;
  if (prior) (RE.test(prior.refusal) ? ok : bad)(`the 3y QUANTITY request on ${CORRIDOR} stands REFUSED (${prior.refusal_class}, route ${short(prior.route_id)}, ${iso(prior.requested_at)}) — an earlier run: "${prior.refusal.slice(0, 300)}"`);
  else if (ASU_SHARED) {
    const r = await longAs(eriksen, `${P}/portfolio/issue`, pe(eriksen, { action: 'prediction.portfolio.issue', objectType: 'FCT' }), { seriesKey: CORRIDOR, horizon: '3y', assumptions: [ASU_SHARED], label: 'live' });
    expectRefused(`N. Eriksen's 3y QUANTITY forecast on the corridor series ${CORRIDOR}`, r, 422, RE);
    const ledg = r.body?.route_id ? await q(`select r.outcome, r.refusal_class, (select string_agg(event, ',') from prediction.forecast_events e where e.forecast_id = r.forecast_id) events,
      (select count(*)::int from prediction.forecasts_current f where f.forecast_id = r.forecast_id) rows from prediction.forecast_routes r where r.route_id = $1`, [r.body.route_id]) : [];
    (ledg[0]?.events === 'forecast.horizon_refused' && ledg[0]?.rows === 0 ? ok : bad)(`the refusal is LEDGERED: route ${short(r.body?.route_id)} ${ledg[0]?.outcome} (${ledg[0]?.refusal_class}), event ${ledg[0]?.events}, no forecast row`);
  }
  ENV_OUT.EYE_B25_REFUSED_SERIES = CORRIDOR;
}

/* ── B25-F3 (F-P4-03) ────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB25-F3 (F-P4-03) — a corridor forecast pins the twin snapshot and graph revision it used; a later graph change leaves the replayed package unchanged');
const groundedRow = async () => (await q(`select f.forecast_id::text, f.information_set_id::text, f.environment_digest, f.environment, f.issued_at, s.revision_head, s.twin_id::text, s.twin_version, s.manifest_digest, s.known_at
   from prediction.forecasts_current f join prediction.information_sets s on s.information_set_id = f.information_set_id
  where f.tenant_id = $1 and f.domain_id = $2 and f.series_key = $3 and f.horizon_code = '30d' and f.issued_by = $4 and f.target_key is null and f.method_ref is null and s.frozen_via = 'prediction.forecast.issue' order by f.issued_at desc limit 1`, [T, D, GROUNDED, eriksen.principalId]))[0] ?? null;
let GF = await groundedRow();
if (GF === null) {
  const t0 = Date.now();
  // the method named (seasonal naive — the leash's own choice where no backtest record exists): the route then reads the series once, not twice
  note(`N. Eriksen issues the GROUNDED 30d forecast on ${GROUNDED} by seasonal naive (the series read takes minutes)`);
  const r = await longAs(eriksen, `${P}/forecasts/issue-grounded`, pe(eriksen, { action: 'prediction.forecast.issue', objectType: 'FCT' }), { seriesKey: GROUNDED, horizon: '30d', assumptions: [ASU_SHARED], label: 'live', refreshCadence: 'weekly', method: 'seasonal-naive' });
  if (!r.ok) fail('N. Eriksen issues the grounded forecast', r); else ok(`N. Eriksen ISSUED the GROUNDED forecast ${short(r.body.forecast.forecastId)} on ${GROUNDED} at 30d (${mins(t0)})`);
  GF = await groundedRow();
} else {
  // a grounded issue the platform made in this ledger (frozen via the issue) — the frozen_via filter above; any later one of the same question supersedes it
  note(`the grounded forecast ${short(GF.forecast_id)} stands (issued ${iso(GF.issued_at)}) — an earlier run`);
}
if (GF) {
  const g = await call(`${P}/forecasts/${GF.forecast_id}/grounding`, pe(eriksen, { action: 'prediction.information_set.read', objectType: 'FCT', objectId: GF.forecast_id, ...READ }), {}, eriksen.token);
  const m = g.body?.grounding?.set?.manifest ?? null;
  const tw = m?.twin ?? null; const feats = (m?.features ?? []).map((x) => x.key);
  (g.ok && g.body.grounding.grounded && tw?.twin_id === TWIN.twin_id && m.graph?.revision_head === Number(GF.revision_head) && m.graph?.subject?.entity_id === SUEZ.entity_id ? ok : bad)(
    `THE PINS (the grounding read): set ${short(GF.information_set_id)} — graph revision ${m?.graph?.revision_head} as of ${iso(m?.graph?.known_at)}, subject ${SUEZ?.canonical_name} (${m?.graph?.edge_count} edge(s), ${m?.graph?.event_count} event(s)); the twin "${TWIN_TITLE}" v${tw?.version} (${tw?.branch_id}, served as ${tw?.mode}; state set ${String(tw?.state_set_digest).slice(0, 12)}…); ${m?.evidence?.length} evidence versions; features ${feats.filter((k) => k.startsWith('twin.')).slice(0, 4).join(', ')}…; gaps ${(m?.coverage_gaps ?? []).map((x) => x.key).join(', ') || 'none'}; manifest ${String(GF.manifest_digest).slice(0, 16)}…`);
  const env = GF.environment ?? {};
  (GF.environment_digest ? ok : bad)(`THE ENVIRONMENT (V03-T-196): node ${env.node}, ${env.platform}/${env.arch}, ${env.method_ref} implementation ${String(env.implementation_digest).slice(0, 12)}…, ${env.assembler_version} → digest ${String(GF.environment_digest).slice(0, 16)}…`);
  ENV_OUT.EYE_B25_GROUNDED_SERIES = GROUNDED;
  ENV_OUT.EYE_B25_GROUNDED_FORECAST = GF.forecast_id;
}
const replays = async (id) => q(`select replay_id::text, outcome, environment_match, fresh, diverged, replayed_at, original_manifest_digest = replayed_manifest_digest same_manifest, original_output_digest = replayed_output_digest same_output from prediction.forecast_replays where forecast_id = $1 order by replayed_at`, [id]);
const replay = async () => { const t0 = Date.now(); const r = await longAs(eriksen, `${P}/forecasts/${GF.forecast_id}/replay`, pe(eriksen, { action: 'prediction.forecast.replay', objectType: 'FCT', objectId: GF.forecast_id }), {}); return { r, took: mins(t0) }; };
const REV_KEY = 'b25-act:suez-canal-transit';
const revRow = async () => (await q(`select revision_id::text, revision::int, committed_by::text, committed_at, result from graph.revisions where tenant_id = $1 and domain_id = $2 and idempotency_key = $3`, [T, D, REV_KEY]))[0] ?? null;
if (GF) {
  let REV = await revRow();
  // 1. the replay BEFORE the later graph change
  const before = (await replays(GF.forecast_id)).filter((x) => REV === null || new Date(x.replayed_at) < new Date(REV.committed_at));
  if (before.length > 0) note(`the replay before the graph change stands: ${before.map((x) => `${x.outcome} at ${iso(x.replayed_at)}`).join(', ')} — an earlier run`);
  else {
    note('N. Eriksen REPLAYS the forecast from its frozen set (it re-reads exactly the pinned evidence versions: minutes)');
    const { r, took } = await replay();
    if (!r.ok) fail('N. Eriksen replays (before)', r);
    else (r.body.replay.outcome === 'REPRODUCED' ? ok : bad)(`N. Eriksen REPLAYED it (${took}): ${r.body.replay.outcome} — manifest ${String(r.body.replay.manifest?.original).slice(0, 12)}… = ${String(r.body.replay.manifest?.replayed).slice(0, 12)}…, ${r.body.replay.diverged.length} divergence(s), environment ${r.body.replay.environment.match ? 'the same' : `DIFFERENT (${r.body.replay.environment.differences.join(', ')})`}; a fresh grounding now ${r.body.replay.fresh.differs ? `would differ (${r.body.replay.fresh.what.join(', ')})` : 'would not differ'}`);
  }
  // 2. K. Müller's change set through the B23 route, touching the grounded forecast's subject (the Suez Canal)
  if (REV) note(`K. Müller's change set stands: revision ${REV.revision} (${REV_KEY}) at ${iso(REV.committed_at)} — an earlier run`);
  else {
    const claim = (await q(`select c.object_id::text id, c.object_version::int v from objects.canonical_objects c where c.tenant_id = $1 and c.domain_id = $2 and c.object_type = 'REL' and c.payload ->> 'subject' = 'MV Hanse Trader' and c.payload ->> 'predicate' = 'transits' and c.payload ->> 'object_value' = 'Suez' and c.lifecycle_state = 'active' order by c.object_version desc limit 1`, [T, D]))[0] ?? null;
    const vessel = (await q(`select e.entity_id::text from graph.edges_current g join graph.entities_current e on e.entity_id = g.subject_entity_id where g.tenant_id = $1 and g.domain_id = $2 and g.claim_object_id = $3 and e.lifecycle_state = 'active' order by g.asserted_at desc limit 1`, [T, D, claim?.id]))[0] ?? null;
    const ont = (await q(`select version_id::text from graph.ontology_versions where tenant_id = $1 and domain_id = $2 and state = 'active' order by version desc limit 1`, [T, D]))[0] ?? null;
    const head = await call(`${G}/revisions/head`, dom(mueller, 'graph', { action: 'graph.read', objectType: 'GRV', ...READ }), {}, mueller.token);
    if (claim === null || vessel === null || !head.ok) bad(`the change set cannot be built (claim ${claim ? 'found' : 'absent'}, vessel ${vessel ? 'found' : 'absent'}, head ${head.status})`);
    else {
      const r = await call(`${G}/revisions`, dom(mueller, 'graph', { action: 'graph.revision.commit', objectType: 'GRV' }), { idempotency_key: REV_KEY, expected_revision: head.body.head.revision,
        change_set: { ontology: { version_id: ont?.version_id ?? null }, nodes: [], identifiers: [],
          edges: [{ predicate: 'transits', subject: { entity_id: vessel.entity_id }, object: { entity_id: SUEZ.entity_id }, valid_from: '2024-01-12T00:00:00Z', provenance: { claim_object_id: claim.id, claim_version: claim.v } }] } }, mueller.token);
      if (!r.ok) fail('K. Müller commits the change set', r);
      else ok(`K. Müller (knowledge owner) COMMITTED revision ${r.body.revision.revision} through the B23 route (graph.revision.commit): MV Hanse Trader transits ${SUEZ.canonical_name} from 2024-01-12, resting on the extracted claim ${short(claim.id)}@${claim.v} ("MV Hanse Trader transits Suez" — its object resolved by him to the ${SUEZ.canonical_name} place); the domain's head ${head.body.head.revision} → ${r.body.revision.revision}`);
    }
    REV = await revRow();
  }
  // 3. the replay AFTER it: REPRODUCED, while a fresh grounding differs
  if (REV) {
    const after = (await replays(GF.forecast_id)).filter((x) => new Date(x.replayed_at) > new Date(REV.committed_at));
    let a = after[after.length - 1] ?? null;
    if (a) note(`the replay after the graph change stands (${iso(a.replayed_at)}) — an earlier run`);
    else {
      note('N. Eriksen REPLAYS it again after K. Müller\'s change set (minutes)');
      const { r, took } = await replay();
      if (!r.ok) fail('N. Eriksen replays (after)', r); else note(`replayed (${took})`);
      a = (await replays(GF.forecast_id)).filter((x) => new Date(x.replayed_at) > new Date(REV.committed_at)).pop() ?? null;
    }
    const what = a?.fresh?.what ?? [];
    (a?.outcome === 'REPRODUCED' && a.same_manifest && a.same_output && a.fresh?.differs === true && what.includes('graph.revision_head') ? ok : bad)(
      `AFTER THE LATER GRAPH CHANGE the replay is ${a?.outcome} — the same manifest (${a?.same_manifest}) and the same output (${a?.same_output}), environment ${a?.environment_match ? 'the same' : 'DIFFERENT'}; a FRESH grounding now differs (revision ${a?.fresh?.revision_head} against the pinned ${GF.revision_head}): ${what.join(', ')}`);
    ENV_OUT.EYE_B25_PINNED_REVISION = String(GF.revision_head);
  }
}

/* ── B25-F2 (F-P4-02) ────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB25-F2 (F-P4-02) — two methods disagree on the corridor forecast; both distributions, the ensemble and the assumption that splits them; a labelled judgement overlay');
{
  // 1. THE ROUTING: forecast.disagreement → the forecast owner, as B91-A published its classes
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const routed = (rules) => JSON.stringify(rules?.classes?.['forecast.disagreement']?.route_roles ?? []) === JSON.stringify(['forecast_owner']);
  if (active === null) bad('no active attention policy on the corridor domain');
  else if (routed(active.rules)) note(`attention policy version ${active.version} routes forecast.disagreement → [forecast_owner] — an earlier run`);
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    rules.classes['forecast.disagreement'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 4320, notify: 'in_app' };
    const r = await call(`${E}/policy/publish`, dom(dvorak, 'executive', { action: 'executive.attention.policy.publish', objectType: 'ATP' }), { rules,
      reason: 'B25: a material disagreement between forecast methods is routed to the forecast owner; every earlier class unchanged' }, dvorak.token);
    if (!r.ok) fail('M. Dvořák publishes the attention policy', r);
    else {
      const pub = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0];
      const kept = Object.keys(active.rules.classes).filter((c) => JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c]));
      const others = Object.keys(active.rules).filter((k) => k !== 'classes').every((k) => JSON.stringify(pub.rules[k]) === JSON.stringify(active.rules[k]));
      (kept.length === Object.keys(active.rules.classes).length && others && routed(pub.rules) ? ok : bad)(`M. Dvořák PUBLISHED attention policy VERSION ${pub.version} (supersedes ${active.version}): + forecast.disagreement → [forecast_owner]; ${kept.length} of ${Object.keys(active.rules.classes).length} earlier classes byte-identical, the other sections ${others ? 'unchanged' : 'CHANGED'}`);
    }
  }
}
// 2. THE ASSUMPTIONS: the shared one (above) and one tied to each method
const ASU_PERSIST = await weberAsu('The Red Sea diversions have run their course: last week\'s transits repeat', 'carriers have finished re-routing around the Cape; the strait\'s last week of transits repeats through the month');
const ASU_REVERT = await weberAsu('Carriers keep diverting at the pace of the last weeks', 'the decline of transits through the strait continues at its recent pace through the month');
// 3. THE ENSEMBLE
const ensRow = async () => (await q(`select run_id::text, ensemble_forecast_id::text, state, disagreement, escalation, attention_item_id::text, admitted_at, finished_at, information_set_id::text from prediction.ensemble_runs
   where tenant_id = $1 and domain_id = $2 and series_key = $3 and horizon_code = $4 and observed_through = $5 and owner_principal_id = $6 and state = 'completed' order by admitted_at desc limit 1`, [T, D, CORRIDOR, ENS_HORIZON, ENS_CUT, eriksen.principalId]))[0] ?? null;
let RUN = await ensRow();
if (RUN) note(`the ensemble run ${short(RUN.run_id)} (${CORRIDOR} at ${ENS_HORIZON} cut at ${ENS_CUT}) stands ${RUN.state} — an earlier run`);
else if (ASU_SHARED && ASU_PERSIST && ASU_REVERT) {
  const t0 = Date.now();
  note(`N. Eriksen issues the ENSEMBLE on ${CORRIDOR} at ${ENS_HORIZON}, observed through ${ENS_CUT} (the series read takes minutes; the compute budget is the members')`);
  await renew(eriksen);
  const r = await callLong(`${P}/ensembles/issue`, pe(eriksen, { action: 'prediction.ensemble.issue', objectType: 'ENS' }), { seriesKey: CORRIDOR, horizon: ENS_HORIZON, observedThrough: ENS_CUT, assumptions: [ASU_SHARED],
    members: [{ methodRef: 'seasonal_naive@1', assumptions: [ASU_PERSIST] }, { methodRef: 'holt_winters@1', assumptions: [ASU_REVERT] }], label: 'replay demonstration' }, eriksen.token);
  if (!r.ok) fail('N. Eriksen issues the ensemble', r); else ok(`N. Eriksen ISSUED the ensemble run ${short(r.body.ensemble.run.run_id)} → ${r.body.ensemble.run.state} (${mins(t0)})`);
  RUN = await ensRow();
}
let ENS = null;
if (RUN) {
  const rd = await call(`${P}/ensembles/${RUN.run_id}/read`, pe(eriksen, { action: 'prediction.ensemble.read', objectType: 'ENS', objectId: RUN.run_id, ...READ }), {}, eriksen.token);
  ENS = rd.ok ? rd.body.ensemble : null;
  if (!rd.ok) fail('the ensemble read', rd);
  else {
    const mem = ENS.members ?? []; const e = ENS.ensemble ?? {}; const d = ENS.disagreement ?? {};
    const q3 = (x) => `median ${f4(x?.q50)} (10–90: ${f4(x?.q10)}–${f4(x?.q90)})`;
    (mem.length === 2 && mem.every((m) => m.state === 'issued') ? ok : bad)(`BOTH DISTRIBUTIONS (members issued, each tied to its assumption): ${mem.map((m) => `${m.method_ref} ${q3(m.quantiles)} — tied to "${m.tied_assumptions?.[0] === ASU_PERSIST ? 'the diversions have run their course' : m.tied_assumptions?.[0] === ASU_REVERT ? 'carriers keep diverting' : short(m.tied_assumptions?.[0])}"`).join(' · ')} transits/day at ${e.target_at ?? '—'}`);
    (e.ensemble_role === 'ensemble' && e.method_ref === 'ensemble:linear_pool@1' ? ok : bad)(`THE ENSEMBLE ${short(e.forecast_id)} (${e.label_kind}): ${e.method_ref} ${q3(e.quantiles)} — "${String(e.statement).slice(0, 420)}"`);
    const split = d.analysis?.splitting_assumptions ?? [];
    (['material', 'notable'].includes(d.level) && split.length === 2 ? ok : bad)(`THE DISAGREEMENT (measured by the ${d.measured_by}): ${String(d.level).toUpperCase()} — max gap ratio ${f4(d.max_gap_ratio)}, min overlap ${f4(d.min_overlap)}; THE ASSUMPTION THAT SPLITS THEM: ${split.map((s) => `"${s.title}" (held by ${(s.held_by ?? []).join(', ')})`).join(' vs ')}`);
    note(`excluded method paths: ${(ENS.excluded_models ?? []).length === 0 ? 'NONE — the horizon policy plans exactly the two statistical methods for a 30d quantity; no planned path was lost (said on the package)' : ENS.excluded_models.map((x) => `${x.method_ref} (${x.class}: ${x.reason})`).join('; ')}`);
    const item = RUN.attention_item_id ? (await q(`select state, outcome, owner_principal_id::text owner, route_roles, policy_version from executive.attention_items where item_id = $1`, [RUN.attention_item_id]))[0] : null;
    if (d.level === 'material') (item && item.owner === eriksen.principalId ? ok : bad)(`THE ESCALATION: the material disagreement escalated to ${nm(RUN.escalation?.to)} by ${RUN.escalation?.channel}; attention item ${short(RUN.attention_item_id)} ${item?.state}/${item?.outcome}, owner ${nm(item?.owner)}, roles ${(item?.route_roles ?? []).join('+')}, policy version ${item?.policy_version}`);
    ENV_OUT.EYE_B25_SERIES = CORRIDOR; ENV_OUT.EYE_B25_HORIZON = ENS_HORIZON; ENV_OUT.EYE_B25_ENSEMBLE_RUN = RUN.run_id;
  }
}
// 4. THE JUDGEMENT OVERLAY (N. Eriksen)
if (ENS?.ensemble?.forecast_id) {
  const fid = ENS.ensemble.forecast_id;
  const standing = (await q(`select overlay_id::text, version, state, adjustment, label from prediction.judgement_overlays where forecast_id = $1 and state = 'active' order by version desc limit 1`, [fid]))[0] ?? null;
  const [sn, hw] = (ENS.members ?? []).map((m) => m.quantiles);
  const evd = (await q(`select (x ->> 'evidence_object_id') id from prediction.forecasts_current f, jsonb_array_elements(f.evidence_refs) x where f.forecast_id = $1 order by (x ->> 'evidence_version')::int desc limit 1`, [fid]))[0] ?? null;
  if (standing) note(`N. Eriksen's JUDGEMENT overlay ${short(standing.overlay_id)} v${standing.version} stands (${standing.state}) — an earlier run`);
  else if (sn && hw) {
    const r2 = (x) => Math.round(x * 100) / 100;
    const lo = Math.min(sn.q10, hw.q10); const mid = hw.q50 + (sn.q50 - hw.q50) * 0.25; const hi = Math.max(ENS.ensemble.quantiles.q90, mid + 1);
    const r = await call(`${P}/forecasts/${fid}/overlays/add`, pe(eriksen, { action: 'prediction.overlay.add', objectType: 'FCT', objectId: fid }), {
      adjustment: { kind: 'quantiles', q10: r2(lo), q50: r2(mid), q90: r2(hi) },
      rationale: 'N. Eriksen\'s judgement: the collapse of the last fortnight is read as continuing — the median set a quarter of the way from the trend member toward the repeat-last-week member; a JUDGEMENT, not model output',
      evidence: [{ kind: 'strategy', id: ASU_REVERT }, ...(evd ? [{ kind: 'evidence', id: evd.id }] : [])] }, eriksen.token);
    if (!r.ok) fail('N. Eriksen adds the judgement overlay', r);
    else ok(`N. Eriksen ADDED a JUDGEMENT overlay ${short(r.body.overlay.overlay_id)} v${r.body.overlay.version} (${r.body.overlay.label}, ${r.body.overlay.state}): median ${r.body.overlay.adjustment.q50} (10–90: ${r.body.overlay.adjustment.q10}–${r.body.overlay.adjustment.q90}) — beside the model's own distribution, unchanged: ${r.body.overlay.model_distribution?.label} median ${f4(r.body.overlay.model_distribution?.quantiles?.q50)}`);
  }
  const list = await call(`${P}/forecasts/${fid}/overlays/list`, pe(hoffmann, { action: 'prediction.read', objectType: 'FCT', objectId: fid, ...READ }), {}, hoffmann.token);
  (list.ok && list.body.standing?.label === 'JUDGEMENT' && list.body.model?.label === 'MODEL OUTPUT' ? ok : bad)(`A. Hoffmann READS the overlays: the standing ${list.body?.standing?.label} v${list.body?.standing?.version} by ${nm(list.body?.standing?.author_principal_id)} beside the ${list.body?.model?.label} (median ${f4(list.body?.model?.quantiles?.q50)})`);
  // 5. A. Hoffmann's writes are refused
  const w1 = await call(`${P}/forecasts/${fid}/overlays/add`, pe(hoffmann, { action: 'prediction.overlay.add', objectType: 'FCT', objectId: fid }), { adjustment: { kind: 'quantiles', q10: 1, q50: 2, q90: 3 }, rationale: 'the analyst tries to add a judgement of her own', evidence: [{ kind: 'strategy', id: ASU_REVERT }] }, hoffmann.token);
  expectRefused('A. Hoffmann\'s judgement overlay', w1, 403);
  const w2 = await call(`${P}/ensembles/issue`, pe(hoffmann, { action: 'prediction.ensemble.issue', objectType: 'ENS' }), { seriesKey: CORRIDOR, horizon: '90d', assumptions: [ASU_SHARED] }, hoffmann.token);
  expectRefused('A. Hoffmann\'s ensemble issue', w2, 403);
}

/* ── B25-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
await renewAll();
console.log('\nB25-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from prediction.forecast_methods where tenant_id = $1 and domain_id = $2)::int methods, (select count(*) from prediction.forecast_targets where tenant_id = $1 and domain_id = $2)::int targets,
     (select count(*) from prediction.horizon_policies where tenant_id = $1 and domain_id = $2)::int policies, (select count(*) from prediction.method_validations where tenant_id = $1 and domain_id = $2)::int validations,
     (select count(*) from prediction.forecast_routes where tenant_id = $1 and domain_id = $2)::int routes, (select count(*) from prediction.information_sets where tenant_id = $1 and domain_id = $2)::int sets,
     (select count(*) from prediction.forecast_replays where tenant_id = $1 and domain_id = $2)::int replays, (select count(*) from prediction.ensemble_runs where tenant_id = $1 and domain_id = $2)::int runs,
     (select count(*) from prediction.judgement_overlays where tenant_id = $1 and domain_id = $2)::int overlays`, [T, D]))[0];
  note(`in the ledgers: ${n.methods} registry entr(ies), ${n.targets} target version(s), ${n.policies} horizon polic(ies), ${n.validations} validation(s), ${n.routes} route(s), ${n.sets} information set(s), ${n.replays} replay(s), ${n.runs} ensemble run(s), ${n.overlays} overlay version(s)`);
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/\s/.test(String(v)) ? `'${v}'` : v}`);
  const v3 = ECB_VAL['3y']; const v5 = ECB_VAL['5y'];
  note(`LIMITS said. THREE CLAIMS KEPT APART: (1) SOFTWARE CAPABILITY — the registry, the routing, the horizon policy, the refusal, the grounding, the replay, the ensemble manager and the overlay all ran on this deployment through their governed routes; (2) SYNTHETIC DEMONSTRATION — N. Eriksen's structural judgement (the regime pseudo-counts), J. Weber's assumptions, the overlay's rationale, the regime thresholds and the target's wording are declared, not measured; the harnesses' validations run on SYNTHETIC histories; (3) EMPIRICAL VALIDATION — only bayes_level@1 on the REAL ECB EUR/USD history (retrospective, ONE vintage: the 2026 publication cut by date at each origin, not historical-knowledge validation; overlapping 3y/5y targets, so the origins are not independent): 3y ${v3 ? `${v3.passed ? 'PASSED' : 'NOT PASSED'} (coverage ${f4(v3.metrics?.coverage)}, ${v3.origins} origins)` : 'not run'}, 5y ${v5 ? `${v5.passed ? 'PASSED' : 'NOT PASSED'} (coverage ${f4(v5.metrics?.coverage)}, ${v5.origins} origins)` : 'not run'}; and the 30d event backtest on the REAL PortWatch history (retrospective, one vintage). It is NEVER claimed for the corridor's 3y/5y: the corridor's 5y stays SCENARIO LANGUAGE, its 3y quantity is refused. SUBSTITUTIONS: "Bab el-Mandeb transit delay" is the governed target on the REAL transit COUNT series (no delay series exists; the twin's corridor-delay element is a declared feature only); the demonstration's graph holds NO Bab el-Mandeb Strait entity (its extracted ENT claim is queued for review — not decided by this act), so ${CORRIDOR} names no subject and the GROUNDED forecast of F-P4-03 runs on ${GROUNDED} (the Suez Canal — the corridor twin's boundary place); K. Müller's change set touches that subject (the claim "MV Hanse Trader transits Suez", its object resolved by him to the Suez Canal) instead of the strait; the tracker's "Regensburg line demand series" does not exist — the 3y refusal is shown on the corridor's own real transit series (≈7.8 years: no quantity validation at 3y was run or recorded on it); the bounded ECB history is a separate source (the live ecb-eurusd and PortWatch contracts untouched) and was scheduled only between its agent's provisioning and its retirement (the platform schedules every active collected source) — collected once. HARNESS-PROVEN ONLY: the Bayesian prior-sensitivity refusal, the causal (MC-013) and optimisation (MC-015) families, quarantine/reinstatement and the digest pin, the ensemble's retries/budget/resume/PER-07 precision refusal and the model-path exclusions, the overlay's revision/withdrawal, the context refusals (future cut-off, stale head, twin/evidence mismatch) and a DIVERGED replay. TIMING: each read of a PortWatch series is ~8,900 governed retrievals — 15–20 minutes here; the act waits, the walks read what it recorded.`);
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
