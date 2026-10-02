#!/usr/bin/env node
/**
 * CP-6 batch B30 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): TWIN STATE,
 * RECONCILIATION, THE ENVELOPE AND THE FABRIC CARRYOVERS (migration 0103; F-P5-02 / F-P5-03 / F-P5-04 complete, F-P5-06 / F-P5-07 advanced)
 * — exercised by the personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers, and where nothing
 * happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and
 * says "stands — an earlier run" instead of writing it twice. No clock is moved; nothing is planted: every row is a persona's governed act,
 * the real PortWatch collection's, or the schedule's (the attention agent's tick, every 60 s on the demonstration — its tick step
 * `twin-freshness` and its after-tick hooks `twin-estimation` and `simulation-experiments` run there; the act WAITS for the ticks).
 *
 *   B30-0 THE STATE: 0102 and 0103 applied; the casting read from identity.role_bindings (no persona created, no role granted); the attention
 *         agent and its cadence; the inputs (the corridor twin and its head, the PortWatch chokepoints source and the series
 *         portwatch:chokepoint4:n_total, the every-kind corridor scenario's "regional blockade" branch, E. Kovács's discrete-event study twin).
 *   B30-S ESTIMATION AND RECONCILIATION (F-P5-02): S. Lindqvist's conservation set corridor-transit-balance; the Reconciliation Agent
 *         registered (kind reconciliation, this runtime's digest); T. Nakamura's estimators of corridor.capacity_share (the primary a ratio of
 *         the latest PortWatch count to the corridor's baseline — the baseline chosen so the latest count reads 62 %, SYNTHETIC — and two
 *         challengers); M. Dvořák's PortWatch collection now (the real publisher); the attention tick queues the check and the agent
 *         PROPOSES (when the collection brought new evidence) — else A. Hoffmann proposes through the route, SAID; the estimate's candidates,
 *         spread, qualification and the SATISFIED conservation check; routed to T. Nakamura, who APPROVES → a new snapshot.
 *   B30-B BRANCHES, MERGE, FRESHNESS (F-P5-03): an actual version observed through the database's day − 5; T. Nakamura's freshness SLO of
 *         2 days (set AFTER that head, so no older head is raised); J. Weber's assumption "The corridor is blockaded for 45 days" linked to
 *         the "regional blockade" branch; the twin branched `blockade` with the SCENARIO element shock.corridor_delay_days = 45 citing it; the
 *         merge opened and its completion REFUSED 409 (unreconciled) — left open; the freshness read (5 days stale); the tick raises
 *         twin.freshness.
 *   B30-E THE ENVELOPE (F-P5-04): a BRANCH `stress-75` (forked from actual's head, so the 75-day state is never actual's head the B30-B
 *         walks read) with shock.corridor_delay_days = 75; the run without an acknowledgement REFUSED 422; T. Nakamura's acknowledged run →
 *         OUTSIDE; its decision use REFUSED outside_envelope; T. Richter's (domain administrator) admission REFUSED 403 (ownership);
 *         T. Nakamura admits it EXPLORATORY ONLY; H. Petrović (method steward) concurs.
 *   B30-X THE FABRIC CARRYOVERS (F-P5-06/07): E. Kovács's discrete-event@1 experiment (60 paths, chunks of 20, three a tick) declared,
 *         J. Weber approves its budget, started, COMPLETED by the ticks; T. Nakamura retires a SUPERSEDED corridor control — checked first
 *         through the run's retirement read: no package cites it, nothing rests on it.
 *   B30-9 THE STATE, the env lines for the four walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC except the PortWatch transit counts (the IMF PortWatch publisher's, collected through the real connector; the
 * baseline they are read against is the persona's statement). Nothing prints a credential.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, digest, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

// The act may live in a worktree without .eye-local: the RUNTIME root is the tree it runs from (the main tree), the code's own root otherwise.
const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
// the built API this act's code belongs to (the Reconciliation Agent's identity is this runtime's scan): the act's own tree first
const requireBuilt = createRequire(join(existsSync(join(SELF_ROOT, 'apps', 'api', 'dist')) ? SELF_ROOT : ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const G = `${X}/graph`; const W = `${X}/twins`; const S = `${X}/simulations`;
const ES = `${X}/twin-estimation`; const BR = `${X}/twin-branches`; const EN = `${X}/twin-envelope`; const CS = `${X}/constraints`; const O = `${X}/observation`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 240)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t;
const dbDay = async (minus = 0) => (await q(`select to_char((clock_timestamp() at time zone 'UTC')::date - $1::int, 'YYYY-MM-DD') d`, [minus]))[0].d;
const dayOf = (v) => { if (v === null || v === undefined) return null; if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`; return String(v).slice(0, 10); };
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const tStart = Date.now();
console.log(`THE B30 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};
/** Poll every `every` ms until `done(probe())` or the deadline; the last read answered either way (a note when it timed out). */
async function waitFor(what, probe, done, ms, every = 2000) {
  const until = Date.now() + ms; let last = null;
  while (Date.now() < until) { last = await probe(); if (done(last)) return last; await sleep(every); }
  note(`${what}: not within ${Math.round(ms / 1000)} s (the last read ${JSON.stringify(last).slice(0, 200)})`); return last;
}
const ENV_OUT = {};
/**
 * THE SAME GOVERNED ENVELOPE as governed.mjs's call, over node:http with NO client timeout: a series read of the PortWatch chokepoints source
 * is one governed retrieval per evidence version (about 8,900 on the demonstration — several minutes), longer than fetch's five-minute
 * header timeout. Used for the estimation reads and the proposal only.
 */
function callLong(path, over, payload = {}, token = null) {
  const envelope = {
    message_id: randomUUID(), scope: over.scope, tenant_id: over.tenantId ?? null, domain_id: over.domainId ?? null, principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'observation', action: over.action, side_effect_class: over.sideEffect ?? 'reversible', consequence_class: over.consequence ?? 'C1',
    object_type: over.objectType, object_id: over.objectId ?? null, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: randomUUID(), trace_id: over.trace ?? 'phase4', payload_digest: digest(payload),
  };
  const body = JSON.stringify({ envelope, payload });
  const u = new URL(API + path);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', timeout: 0,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(token === null ? {} : { authorization: `Bearer ${token}` }) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let b = {}; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { b = {}; } resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: b, correlationId: envelope.correlation_id }); });
    });
    req.on('error', reject); req.end(body);
  });
}

/* ── B30-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB30-0 THE STATE — 0102 and 0103, the casting, the attention agent, the inputs');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0102%' or filename like '0103%' order by 1`);
  if (m.length === 2) ok(`migrations applied: ${m.map((x) => x.filename).join(', ')}`); else { bad(`0102 and 0103 are not both applied (${m.map((x) => x.filename).join(', ') || 'neither'})`); process.exit(1); }
}
const CAST = { 't.nakamura': ['twin_owner'], 't.richter': ['domain_admin'], 'h.petrovic': ['method_steward'], 's.lindqvist': ['constraint_steward'], 'e.kovacs': ['twin_owner'],
  'j.weber': ['strategy_owner'], 'm.dvorak': ['collection_manager', 'executive'], 'a.hoffmann': ['domain_analyst'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')} — no persona is created, no role granted`); process.exit(1); }
  const tn = rows.find((r) => r.login_name === 't.nakamura')?.roles ?? [];
  note(`T. Nakamura holds ${tn.join(', ')}${tn.includes('simulation_operator') ? '' : ' (not simulation_operator: every route the act casts him in admits twin_owner)'}; T. Richter is the domain's administrator (the read one); the second humans for approvals are J. Weber (the fabric budget) and H. Petrović (the concurrence)`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const nakamura = await who('t.nakamura'); const richter = await who('t.richter'); const petrovic = await who('h.petrovic'); const lindqvist = await who('s.lindqvist');
const kovacs = await who('e.kovacs'); const weber = await who('j.weber'); const dvorak = await who('m.dvorak'); const hoffmann = await who('a.hoffmann');
const NAME = { [nakamura.principalId]: 'T. Nakamura', [richter.principalId]: 'T. Richter', [petrovic.principalId]: 'H. Petrović', [lindqvist.principalId]: 'S. Lindqvist',
  [kovacs.principalId]: 'E. Kovács', [weber.principalId]: 'J. Weber', [dvorak.principalId]: 'M. Dvořák', [hoffmann.principalId]: 'A. Hoffmann', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose, consequence = 'C2') => (over) => as(s, scope, { purposeId: purpose, consequence, ...over });
const READ = { sideEffect: 'none' };
/** The twin routes and the B30 routes under the purpose `twin`, the simulation routes under `simulation` — as the harnesses issue them. */
const tw = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(path, env_(s, 'twin')({ action, objectType, objectId, ...extra }), payload, s.token);
const sm = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(path, env_(s, 'simulation')({ action, objectType, objectId, ...extra }), payload, s.token);

// THE ATTENTION AGENT: the tick's host — its scheduled ticks run twin-freshness (a tick step) and twin-estimation / simulation-experiments (after-tick hooks)
const ATT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (ATT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [ATT.agent_id]))[0];
  (last.n > 0 ? ok : bad)(`the attention agent ${short(ATT.agent_id)} — cadence ${ATT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${iso(last.t)})` : ''} — the act waits for its ticks, it calls no tick route`);
}
/** The first attention tick that started after `mark` and finished. */
const tickAfter = async (mark) => (await q(`select run_id::text id, started_at, finished_at, outcome, outputs from executive.agent_runs
                                             where agent_id = $1 and task = 'attention_tick' and started_at > $2 and finished_at is not null order by started_at limit 1`, [ATT.agent_id, mark]))[0] ?? null;
// THE INPUTS
const TWIN_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const TWIN = (await q(`select twin_id::text id, title, owner_principal_id::text owner, behaviour_model_ref model from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, TWIN_TITLE]))[0] ?? null;
const headOf = async (branch = 'actual') => (await q(`select version, observed_through, known_at, admitted_at, completeness, opened_by::text opened_by from twin.twin_versions where twin_id = $1 and branch_id = $2 and state = 'admitted' order by version desc limit 1`, [TWIN.id, branch]))[0] ?? null;
const SERIES_KEY = 'portwatch:chokepoint4:n_total';
const SERIES = (await q(`select series_key, source_key, unit from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = $3`, [T, D, SERIES_KEY]))[0] ?? null;
const SRC = SERIES === null ? null : (await q(`select source_id::text, contract_version, lifecycle_state, name from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 and lifecycle_state = 'active' order by contract_version desc limit 1`, [T, D, SERIES.source_key]))[0] ?? null;
const EVERY_TITLE = 'Bab el-Mandeb over the next quarter — every scenario kind (vocabulary v1)';
const EVERY = (await q(`select scenario_id::text id, title, owner_principal_id::text owner from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, EVERY_TITLE]))[0] ?? null;
const BLOCK_BRANCH = EVERY === null ? null : (await q(`select branch_id::text id, name, state from prediction.branches_current where scenario_id = $1 and kind = 'user-defined' and kind_label = 'regional blockade' limit 1`, [EVERY.id]))[0] ?? null;
const DES_TITLE = 'Regensburg plant — line 1 and its bearing supply (discrete-event study)';
const DS = (await q(`select twin_id::text id, owner_principal_id::text owner from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, DES_TITLE]))[0] ?? null;
const CORRIDOR_RISK = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and status = 'active' and title = 'Corridor closure — Regensburg line' limit 1`, [T, D]))[0] ?? null;
{
  const head = TWIN ? await headOf() : null;
  const have = { TWIN: !!TWIN, HEAD: !!head, SERIES: !!SERIES, SRC: !!SRC, EVERY: !!EVERY, BLOCK_BRANCH: !!BLOCK_BRANCH, DS: !!DS, CORRIDOR_RISK: !!CORRIDOR_RISK };
  if (Object.values(have).some((x) => !x)) { bad(`an input is missing: ${JSON.stringify(have)}`); process.exit(1); }
  ok(`the inputs: the corridor twin ${short(TWIN.id)} "${TWIN.title}" (owner ${nm(TWIN.owner)}, ${TWIN.model}) at actual v${head.version} (observed through ${dayOf(head.observed_through)}); the series ${SERIES_KEY} (${SERIES.unit}) of "${SRC.name}" v${SRC.contract_version} (${SRC.lifecycle_state}); the scenario "${EVERY.title}" and its "regional blockade" branch ${short(BLOCK_BRANCH.id)} (${BLOCK_BRANCH.state}); E. Kovács's study twin ${short(DS.id)}; the risk "${CORRIDOR_RISK.title}"`);
}

/* ── B30-S ESTIMATION AND RECONCILIATION ─────────────────────────────────────────────── */
console.log('\nB30-S ESTIMATION AND RECONCILIATION (F-P5-02) — a PortWatch transit count, the estimator\'s corridor capacity, the conservation check, the Reconciliation Agent, the owner\'s approval into a new snapshot');
const KEY = 'corridor.capacity_share'; const SET_KEY = 'corridor-transit-balance';
const PCT = (v) => `${Number(v).toFixed(3).replace(/\.?0+$/, '')} %`;
// THE CONSERVATION SET (S. Lindqvist): the estimate's transit balance conserved within half a transit; the share at most 100 %
{
  const cur = (await q(`select set_id::text, current_version, state, steward_principal_id::text steward from simulation.constraint_sets where tenant_id = $1 and domain_id = $2 and set_key = $3`, [T, D, SET_KEY]))[0];
  if (cur) note(`the set ${SET_KEY} stands — an earlier run (v${cur.current_version}, ${cur.state}, steward ${nm(cur.steward)})`);
  else {
    const r = await tw(lindqvist, `${CS}/sets/declare`, 'simulation.constraint.declare', 'CST', { setKey: SET_KEY, title: 'Corridor transit balance (SYNTHETIC)',
      constraints: [{ key: 'transits-conserved', kind: 'conservation', stocks: [KEY], tolerance: 0.5, unit: 'transits/day', applies_to: ['run_input'], title: 'the estimate accounts for the observed transit count' },
                    { key: 'share-at-most-100', kind: 'business_rule', quantity: KEY, op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'], title: 'the corridor never carries more than its baseline share' }],
      note: 'a corridor capacity estimate is checked against the observed transits before it is published (SYNTHETIC tolerance)' });
    if (!r.ok) fail('S. Lindqvist declares the conservation set', r);
    else ok(`S. Lindqvist (constraint steward) DECLARED "${r.body.set.title}" (${SET_KEY}) v${r.body.set.version}: CONSERVATION of ${KEY}'s transit balance (opening + inflow − outflow = closing within 0.5 transits/day, no negative stock) and the business rule ${KEY} ≤ 100 %, both applying to run inputs`);
  }
}
// THE RECONCILIATION AGENT, registered as act-b29 registers the Supply Chain Agent: its version and digest are this runtime's scan (the built API)
const agentOf = async (kind) => (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = $3 and status = 'active' order by created_at desc limit 1`, [T, D, kind]))[0] ?? null;
let REC = null;
{
  let identity = null;
  try { identity = requireBuilt('./dist/twin/estimation/reconciliation-agent.js'); } catch (e) { bad(`the built API's Reconciliation Agent could not be read (build apps/api first): ${String(e?.message ?? e).slice(0, 160)}`); }
  if (identity !== null) {
    const { RECONCILIATION_AGENT_VERSION: version, RECONCILIATION_AGENT_DIGEST: codeDigest } = identity;
    const cur = await agentOf('reconciliation');
    if (cur && cur.code_digest === codeDigest) { REC = cur; note(`the Reconciliation Agent ${short(cur.agent_id)} is registered — an earlier run (${cur.agent_version}, digest ${cur.code_digest.slice(0, 12)}…)`); }
    else {
      if (cur) note(`an earlier Reconciliation Agent ${short(cur.agent_id)} carries digest ${cur.code_digest.slice(0, 12)}… (not this runtime's) — registered anew`);
      const r = await call(`${X}/agents/decision/register`, as(admin, scope, { purposeId: 'platform.administration', action: 'agent.register', objectType: 'AGT' }), { kind: 'reconciliation', version, codeDigest,
        ownerPrincipalId: nakamura.principalId, escalationPrincipalId: dvorak.principalId, budgets: { max_reads: 40, max_gateway_calls: 0, max_elapsed_ms: 1_200_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] }, admin.token);
      if (!r.ok) fail('the administrator registers the Reconciliation Agent', r);
      else { REC = await agentOf('reconciliation'); ok(`the administrator REGISTERED the Reconciliation Agent ${short(r.body.agent.agentId)} — kind reconciliation, role ${r.body.agent.role}, ${version} digest ${String(codeDigest).slice(0, 12)}…; accountable T. Nakamura, escalation M. Dvořák; it PROPOSES only`); }
    }
    if (REC) NAME[REC.principal_id] = 'the Reconciliation Agent';
  }
}
// THE ESTIMATORS (T. Nakamura): the primary — the latest PortWatch count against the corridor's baseline, in per cent — and two challengers
const estimatorsOf = async () => q(`select estimator_id::text id, name, version, role, method, parameters, declared_at from twin.estimators where twin_id = $1 and key = $2 and state = 'active' order by role desc, name`, [TWIN.id, KEY]);
const estimateRow = async (id) => (await q(`select estimate_id::text id, state, proposed_value::float8 v, unit, as_of, proposer_kind, proposed_by::text proposed_by, agent_id::text agent, run_id::text run, constraint_outcome,
                                             material, routed, ambiguous, attention_item_id::text item, applied_version, decided_by::text decided_by, spread, candidates, head_version from twin.estimates where estimate_id = $1`, [id]))[0] ?? null;
const latestEstimate = async (state) => (await q(`select estimate_id::text id from twin.estimates where twin_id = $1 and key = $2 and state = $3 order by coalesce(decided_at, proposed_at) desc limit 1`, [TWIN.id, KEY, state]))[0]?.id ?? null;
let APPROVED = await latestEstimate('approved');
let BASELINE = null;
const input = { kind: 'series', series_key: SERIES_KEY, unit: 'transits/day', cadence_days: 1 };
if (APPROVED) note(`an approved estimate of ${KEY} stands — an earlier run (${short(APPROVED)})`);
else {
  let est = await estimatorsOf();
  const primary = est.find((e) => e.role === 'primary') ?? null;
  if (primary) { BASELINE = Number(primary.parameters.baseline); note(`the estimators of ${KEY} stand — an earlier run: ${est.map((e) => `${e.name}@${e.version} (${e.role}, ${e.method})`).join(', ')}; the baseline ${BASELINE} transits/day`); }
  else {
    // the corridor's latest transit count as the series reads it now (the Phase 4 path: every point names its evidence) — the baseline is chosen against it
    const s = await callLong(`${P}/series/${encodeURIComponent(SERIES_KEY)}/points`, env_(nakamura, 'prediction')({ action: 'prediction.read', objectType: 'SER', sideEffect: 'none' }), { limit: 7 }, nakamura.token);
    const last = s.ok ? (s.body.points ?? []).slice(-1)[0] : null;
    if (!last) { fail('T. Nakamura reads the PortWatch series', s); }
    else {
      BASELINE = Math.round((Number(last.value) * 50 / 31) * 1e6) / 1e6;   // the latest count reads 62 % of it (SYNTHETIC baseline)
      ok(`T. Nakamura READ the corridor's PortWatch series: ${s.body.total} points, the latest ${last.value} transits on ${last.date} (evidence ${short(last.evidence_object_id)} v${last.evidence_version}, recorded ${iso(last.recorded_at)}); the corridor's baseline stated as ${BASELINE} transits/day (SYNTHETIC)`);
      const decl = (over) => ({ twinId: TWIN.id, key: KEY, inputs: [input], unit: '%', bounds: { min: 0, max: 100 }, materiality: 0.05, ambiguity: 0.5, constraintSets: [SET_KEY], ...over });
      for (const d of [
        decl({ name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline', parameters: { baseline: BASELINE, scale: 100 }, note: 'corridor capacity: the latest PortWatch transit count against the corridor\'s baseline (SYNTHETIC baseline)' }),
        decl({ name: 'portwatch-ma', role: 'challenger', method: 'moving_average', parameters: { window: 7, baseline: BASELINE, scale: 100 }, note: 'the weekly mean of the transit counts as a challenger (SYNTHETIC baseline)' }),
        decl({ name: 'portwatch-kalman', role: 'challenger', method: 'kalman_1d', parameters: { window: 30, process_variance: 4, measurement_variance: 25, baseline: BASELINE, scale: 100 }, note: 'a random-walk Kalman filter over a month of counts as a challenger (SYNTHETIC)' }),
      ]) {
        const r = await tw(nakamura, `${ES}/estimators/declare`, 'twin.estimator.declare', 'TWN', d, TWIN.id);
        if (!r.ok) fail(`T. Nakamura declares ${d.name}`, r); else ok(`T. Nakamura (the twin's owner) DECLARED ${d.name} v${r.body.estimator.version} — ${d.role}, ${d.method} ${JSON.stringify(d.parameters)} on ${SERIES_KEY}, the constraint set ${SET_KEY}`);
      }
      est = await estimatorsOf();
    }
  }
  let OPEN = await latestEstimate('proposed');
  if (OPEN) note(`an open proposal ${short(OPEN)} stands — an earlier run`);
  else if (est.length > 0) {
    // THE COLLECTION: M. Dvořák collects the PortWatch chokepoints source now — the real publisher, through the connector
    const since = est.map((e) => new Date(e.declared_at)).sort((a, b) => a - b)[0];
    const mark = await dbNow();
    const c = await call(`${O}/sources/${SRC.source_id}/collect`, env_(dvorak, 'observation', 'C1')({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion: Number(SRC.contract_version) }, dvorak.token);
    if (!c.ok) note(`M. Dvořák's collection was not run: ${refusalLine(c)}`);
    else note(`M. Dvořák (collection manager) COLLECTED "${SRC.name}" now: ${JSON.stringify(c.body.run ?? c.body.outcome ?? c.body).slice(0, 220)}`);
    const fresh = (await q(`select count(*)::int n, max(recorded_at) t from objects.canonical_objects where object_type = 'EVD' and tenant_id = $1 and domain_id = $2 and provenance_ref like 'SRC:' || $3 || '@%' and recorded_at > $4`, [T, D, SRC.source_id, since]))[0];
    if (fresh.n > 0 && REC) {
      ok(`THE NEW COUNT ARRIVED: ${fresh.n} evidence version(s) of the source recorded since the estimators were declared (the latest ${iso(fresh.t)}) — the tick queues the telemetry check and the Reconciliation Agent scans`);
      const got = await waitFor('the Reconciliation Agent\'s proposal after the tick', async () => (await q(`select estimate_id::text id from twin.estimates where twin_id = $1 and key = $2 and proposer_kind = 'agent' and proposed_at > $3 order by proposed_at desc limit 1`, [TWIN.id, KEY, mark]))[0] ?? null,
        (x) => x !== null, 1_200_000, 5000);
      OPEN = got?.id ?? null;
      const runs = await q(`select run_id::text id, outcome, stop_reason, outputs -> 'proposed' proposed, refusals from executive.agent_runs where agent_id = $1 and started_at > $2 order by started_at`, [REC.agent_id, mark]);
      for (const r of runs) note(`the agent's run ${short(r.id)} (reconcile_scan): ${r.outcome}${r.stop_reason ? ` — ${String(r.stop_reason).slice(0, 120)}` : ''}; proposed ${JSON.stringify(r.proposed ?? []).slice(0, 160)}; refused at the PDP: ${(r.refusals ?? []).map((x) => x.action).join(', ') || 'none'}`);
    } else {
      note(`THE PUBLISHER RETURNED NOTHING NEW: no evidence version of "${SRC.name}" was recorded after the estimators were declared${fresh.n === 0 ? '' : ' (and no Reconciliation Agent is registered)'} — so no telemetry trigger is queued and the agent has nothing to scan; the latest count stands as the schedule collected it. A. Hoffmann (domain analyst) PROPOSES through the route instead — SAID: the agent's proposal on a new count is harness-proven (phase6-estimation-b30 ES5) and runs here when PortWatch publishes`);
      const r = await callLong(`${ES}/estimates/propose`, env_(hoffmann, 'twin')({ action: 'twin.estimate.propose', objectType: 'TWE' }), { twinId: TWIN.id, key: KEY, note: 'the corridor capacity on the latest PortWatch count (SYNTHETIC baseline)' }, hoffmann.token);
      if (!r.ok) fail('A. Hoffmann proposes the estimate', r); else { OPEN = r.body.estimate.estimate_id; ok(`A. Hoffmann PROPOSED ${short(OPEN)} through the route (computed server-side from the declared estimators)`); }
    }
  }
  if (OPEN) {
    const e = await estimateRow(OPEN);
    const r = await tw(nakamura, `${ES}/estimates/${OPEN}/read`, 'twin.estimation.read', 'TWE', {}, OPEN, READ);
    const x = r.ok ? r.body.estimate : null;
    if (x === null) fail('T. Nakamura reads the estimate', r);
    else {
      const cands = (x.candidates ?? []).map((c) => `${c.name} (${c.role}, ${c.method}) ${c.value === null ? `EXCLUDED — ${c.excluded}` : PCT(c.value)}${c.last_point ? ` [latest ${c.last_point.value} on ${c.last_point.date}]` : ''}`);
      (Math.abs(Number(x.proposed_value) - 62) < 0.0005 ? ok : bad)(`THE ESTIMATE ${short(OPEN)}: ${KEY} = ${PCT(x.proposed_value)} as of ${x.as_of} (confidence ${x.confidence}) — proposed by ${e.proposer_kind === 'agent' ? `the Reconciliation Agent (run ${short(e.run)})` : nm(e.proposed_by)} on head v${x.head_version}${Math.abs(Number(x.proposed_value) - 62) < 0.0005 ? '' : ' — NOT 62 %: the count the proposal read is not the count the baseline was stated against (a new count arrived between them)'}`);
      note(`every candidate kept: ${cands.join('; ')}; the spread ${JSON.stringify(x.spread)}`);
      const qual = (x.qualifications ?? []).map((qq) => `${qq.verdict ?? qq.outcome ?? '?'}`);
      note(`the inputs qualified before estimation: ${(x.qualifications ?? []).length} record(s) — ${[...new Set(qual)].join(', ')}; the primary's ${JSON.stringify(((x.qualification ?? {}).primary ?? x.qualification ?? {})).slice(0, 200)}`);
      const cc = x.constraint_check ?? {};
      (x.constraint_outcome === 'satisfied' ? ok : bad)(`THE CONSERVATION CHECK before publish: ${String(x.constraint_outcome).toUpperCase()} — sets ${(cc.pins ?? []).map((p) => `${p.set_key} v${p.version}`).join(', ') || '—'}, applied ${(cc.applied ?? []).join(', ') || '—'}, vacuous ${cc.vacuous}`);
      (e.material && e.routed && x.attention_item?.owner_principal_id === nakamura.principalId ? ok : bad)(`MATERIAL (${JSON.stringify(x.materiality)}) → ROUTED to ${nm(x.attention_item?.owner_principal_id)}: ${x.attention_item?.signal_class} "${String(x.attention_item?.title ?? '').slice(0, 100)}" (${x.attention_item?.state})`);
    }
    if (e.state === 'proposed') {
      if (e.proposer_kind === 'human' && e.proposed_by === nakamura.principalId) bad('the open proposal is T. Nakamura\'s own — he does not decide it (separation of duties)');
      let d = await tw(nakamura, `${ES}/estimates/${OPEN}/decide`, 'twin.estimate.decide', 'TWE', { decision: 'approved', note: 'the corridor capacity on the PortWatch count is accepted (SYNTHETIC baseline)', allowIncomplete: false }, OPEN);
      if (!d.ok && /missing, unreadable or stale/.test(String(d.body?.message ?? ''))) {
        note(`the approval without allowIncomplete was refused (${refusalLine(d)}) — approved again EXPLICITLY as incomplete`);
        d = await tw(nakamura, `${ES}/estimates/${OPEN}/decide`, 'twin.estimate.decide', 'TWE', { decision: 'approved', note: 'the corridor capacity on the PortWatch count is accepted (SYNTHETIC baseline)', allowIncomplete: true }, OPEN);
      }
      if (!d.ok) fail('T. Nakamura approves the estimate', d);
      else ok(`T. Nakamura (the twin's owner) APPROVED it → a NEW SNAPSHOT v${d.body.snapshot?.version} on actual (${d.body.snapshot?.completeness}, observed through ${dayOf(d.body.snapshot?.observedThrough)}) in ONE transaction`);
      APPROVED = OPEN;
    } else if (e.state === 'approved') APPROVED = OPEN;
  }
}
if (APPROVED) {
  const e = await estimateRow(APPROVED);
  const el = (await q(`select kind, value, unit, confidence, citations from twin.state_elements where twin_id = $1 and version = $2 and key = $3`, [TWIN.id, e.applied_version, KEY]))[0] ?? null;
  const v = (await q(`select version, state, observed_through, completeness, supersedes from twin.twin_versions where twin_id = $1 and version = $2`, [TWIN.id, e.applied_version]))[0] ?? null;
  const ann = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'TwinStateChanged' and payload ->> 'twin_id' = $1 and (payload ->> 'version')::int = $2`, [TWIN.id, e.applied_version]))[0].n;
  (el?.kind === 'estimated' && Math.abs(Number(el.value) - e.v) < 1e-9 && v?.state === 'admitted' ? ok : bad)(`the snapshot v${v?.version} (supersedes v${v?.supersedes}; ${v?.state}, ${v?.completeness}, observed through ${dayOf(v?.observed_through)}) carries ${KEY} = ${el?.value} ${el?.unit} ESTIMATED (confidence ${el?.confidence}, citing ${(el?.citations ?? []).length} evidence version(s)); approved by ${nm(e.decided_by)}; proposed by ${e.proposer_kind === 'agent' ? 'the Reconciliation Agent' : nm(e.proposed_by)}; TwinStateChanged ${ann}`);
  const item = e.item ? (await q(`select state from executive.attention_items where item_id = $1`, [e.item]))[0]?.state : null;
  note(`the routed item ${short(e.item)} is ${item ?? '—'} (the B30 estimation part leaves closing the item on decision out — its report's gap)`);
}
ENV_OUT.EYE_B30_OWNER = 't.nakamura'; ENV_OUT.EYE_B30_TWIN_TITLE = TWIN_TITLE; ENV_OUT.EYE_B30_ESTIMATE_KEY = KEY; ENV_OUT.EYE_B30_CONSTRAINT_SET = SET_KEY; ENV_OUT.EYE_B30_ESTIMATE_VALUE = '62';

/* ── B30-B BRANCHES, MERGE, FRESHNESS ────────────────────────────────────────────────── */
console.log('\nB30-B BRANCHES, MERGE, FRESHNESS (F-P5-03) — the head 5 days stale against a 2-day SLO, the corridor twin branched for a blockade, merging it back refused until reconciliation');
const BRANCH = 'blockade';
const DELAY = 'shock.corridor_delay_days';
/** Open a version, ground the given elements (or scenario elements), admit it — resuming a draft an earlier run left on that branch. */
async function versionOf(owner, label, branchId, openPayload, { elements = [], scenario = [] } = {}) {
  let v = (await q(`select version from twin.twin_versions where twin_id = $1 and branch_id = $2 and state = 'draft' order by version desc limit 1`, [TWIN.id, branchId]))[0]?.version ?? null;
  if (v !== null) note(`${label}: the open draft v${v} on ${branchId} is resumed (an earlier run left it)`);
  else {
    const o = await tw(owner, `${W}/${TWIN.id}/versions/open`, 'twin.version', 'TWN', { branchId, knownAt: new Date(await dbNow()).toISOString(), ...openPayload }, TWIN.id);
    if (!o.ok) { fail(`${label}: the version opened`, o); return null; }
    v = o.body.version.version;
  }
  const have = new Set((await q(`select key from twin.state_elements where twin_id = $1 and version = $2`, [TWIN.id, v])).map((x) => x.key));
  const els = elements.filter((e) => !have.has(e.key)); const scs = scenario.filter((e) => !have.has(e.key));
  if (els.length > 0) { const g = await tw(owner, `${W}/${TWIN.id}/versions/${v}/ground`, 'twin.ground', 'TWN', { elements: els }, TWIN.id); if (!g.ok) { fail(`${label}: grounded`, g); return null; } }
  if (scs.length > 0) { const g = await tw(owner, `${BR}/twins/${TWIN.id}/versions/${v}/scenario-elements`, 'twin.ground', 'TWN', { elements: scs }, TWIN.id); if (!g.ok) { fail(`${label}: the scenario element grounded`, g); return null; } }
  let a = await tw(owner, `${W}/${TWIN.id}/versions/${v}/admit`, 'twin.version.admit', 'TWN', { allowIncomplete: false }, TWIN.id);
  if (!a.ok && /missing, unreadable or stale/.test(String(a.body?.message ?? ''))) {
    note(`${label}: the admission without allowIncomplete was refused (${refusalLine(a)}) — admitted EXPLICITLY as incomplete`);
    a = await tw(owner, `${W}/${TWIN.id}/versions/${v}/admit`, 'twin.version.admit', 'TWN', { allowIncomplete: true }, TWIN.id);
  }
  if (!a.ok) { fail(`${label}: admitted`, a); return null; }
  return { version: v, admitted: a.body.admitted };
}
// THE HEAD OBSERVED THROUGH THE DATABASE'S DAY − 5 (the database's day, never the act's clock)
const FIVE = await dbDay(5);
let STALE = await headOf();
if (dayOf(STALE.observed_through) === FIVE) note(`actual's head v${STALE.version} is observed through ${FIVE} — the database's day − 5 — already (${STALE.opened_by === nakamura.principalId ? 'T. Nakamura\'s' : nm(STALE.opened_by)}; the estimate's snapshot or an earlier run): no further version`);
else {
  const v = await versionOf(nakamura, 'the current corridor state', 'actual', { observedThrough: FIVE, carryFrom: STALE.version });
  if (v) ok(`T. Nakamura ADMITTED actual v${v.version} carrying v${STALE.version}, observed through ${FIVE} (the database's day − 5) — ${v.admitted?.completeness}`);
  STALE = await headOf();
}
// THE FRESHNESS SLO (T. Nakamura) — set after that head is admitted, so the sweep never raises an older head
{
  const cur = (await q(`select version, max_age_days from twin.freshness_policies where twin_id = $1 order by version desc limit 1`, [TWIN.id]))[0] ?? null;
  if (cur && cur.max_age_days === 2) note(`the freshness SLO v${cur.version} (2 days) stands — an earlier run`);
  else {
    expectRefused('E. Kovács (a peer twin owner) sets the corridor twin\'s SLO', await tw(kovacs, `${BR}/twins/${TWIN.id}/freshness-policy`, 'twin.freshness.policy', 'TWN', { maxAgeDays: 30, keyMaxAge: {}, note: 'a peer loosening another owner\'s SLO (SYNTHETIC)' }, TWIN.id), 403, /^freshness policy rejected \(ownership\)/);
    const r = await tw(nakamura, `${BR}/twins/${TWIN.id}/freshness-policy`, 'twin.freshness.policy', 'TWN', { maxAgeDays: 2, keyMaxAge: {}, nearExpiryHours: 48, note: 'the corridor state is refreshed every two days (SYNTHETIC SLO)' }, TWIN.id);
    if (!r.ok) fail('T. Nakamura sets the freshness SLO', r); else ok(`T. Nakamura SET the freshness SLO v${r.body.policy.version}: the head at most ${r.body.policy.max_age_days} days old (a freeze announced ${r.body.policy.near_expiry_hours} h before it expires)`);
  }
}
const freshnessOf = async (s, v) => { const r = await tw(s, `${BR}/twins/${TWIN.id}/versions/${v}/freshness`, 'twin.read', 'TWN', {}, TWIN.id, READ); return r.ok ? r.body.freshness : (fail(`the freshness of v${v}`, r), null); };
{
  const f = await freshnessOf(hoffmann, STALE.version);
  if (f) (f.state === 'stale' && f.age_days === 5 && f.stale_by_days === 3 ? ok : bad)(`A. Hoffmann READ the freshness of v${f.version}: ${String(f.state).toUpperCase()} — ${f.age_days} days old (observed through ${f.reference_day}, today ${f.today}), the SLO ${f.policy?.max_age_days} days (v${f.policy?.version}), stale by ${f.stale_by_days} days; dependency ${f.dependency?.state ?? '—'}`);
}
// THE TICK RAISES twin.freshness (the tick step twin-freshness, once per head and policy)
{
  const raised = async () => (await q(`select item_id::text id, state, owner_principal_id::text owner, title, created_at from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'twin.freshness' and subject_id = $3 and title like $4 order by created_at desc limit 1`, [T, D, TWIN.id, `%v${STALE.version} %`]))[0] ?? null;
  let it = await raised();
  if (it) note(`the freshness item for v${STALE.version} stands — raised at ${iso(it.created_at)} (an earlier run or tick)`);
  else it = await waitFor('the tick that raises twin.freshness', raised, (x) => x !== null, 180_000, 3000);
  (it && /5 days stale/.test(it.title) && it.owner === nakamura.principalId ? ok : bad)(`THE TICK RAISED twin.freshness ${short(it?.id)} → ${nm(it?.owner)} (${it?.state}): "${it?.title ?? '—'}"`);
}
// THE ASSUMPTION (J. Weber) linked to the "regional blockade" branch of the every-kind scenario
const ASU_TITLE = 'The corridor is blockaded for 45 days (SYNTHETIC)';
let ASU = (await q(`select strategy_object_id::text id, verification_state from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and title = $3 and status = 'active' limit 1`, [T, D, ASU_TITLE]))[0] ?? null;
if (ASU) note(`the assumption ${short(ASU.id)} "${ASU_TITLE}" stands — an earlier run (${ASU.verification_state})`);
else {
  const r = await call(`${G}/strategy/declare`, env_(weber, 'graph')({ action: 'graph.strategy.declare', objectType: 'ASU' }), { objectType: 'ASU', title: ASU_TITLE,
    statement: 'no merchant transit through Bab el-Mandeb for 45 days (SYNTHETIC)', restsOn: [{ kind: 'strategy', id: CORRIDOR_RISK.id, rationale: 'the blockade is the corridor-closure risk at its most severe (SYNTHETIC)' }] }, weber.token);
  if (!r.ok) fail('J. Weber declares the blockade assumption', r); else { ASU = { id: r.body.strategy.objectId, verification_state: 'unverified' }; ok(`J. Weber (strategy owner) DECLARED the assumption ${short(ASU.id)} "${ASU_TITLE}" in the Knowledge Graph — resting on "${CORRIDOR_RISK.title}"`); }
}
if (ASU) {
  const link = (await q(`select link_id::text id, version from prediction.scenario_assumptions where scenario_id = $1 and branch_id = $2 and assumption_id = $3 and state = 'linked' limit 1`, [EVERY.id, BLOCK_BRANCH.id, ASU.id]))[0] ?? null;
  if (link) note(`the link ${short(link.id)} to the "regional blockade" branch stands — an earlier run (v${link.version})`);
  else {
    const r = await call(`${P}/scenarios/anatomy/${EVERY.id}/assumptions/link`, env_(weber, 'prediction')({ action: 'prediction.scenario.anatomy.assumption', objectType: 'SCN', objectId: EVERY.id }),
      { assumptionId: ASU.id, branchId: BLOCK_BRANCH.id, critical: false, condition: { kind: 'state', text: 'transits resume through the strait (SYNTHETIC)' }, rationale: 'the regional blockade branch rests on a 45-day closure (SYNTHETIC)' }, weber.token);
    if (!r.ok) fail('J. Weber links the assumption to the "regional blockade" branch', r); else ok(`J. Weber LINKED it to the "regional blockade" branch ${short(BLOCK_BRANCH.id)} (not critical; v${r.body.link.version})`);
  }
}
// THE BRANCH: the corridor twin branched `blockade` from actual's head, its delay a SCENARIO element citing the linked assumption
let BHEAD = await headOf(BRANCH);
if (BHEAD) note(`the branch ${BRANCH} stands — an earlier run (head v${BHEAD.version})`);
else if (ASU) {
  const base = await headOf();
  expectRefused(`T. Nakamura grounds ${DELAY} as a scenario through the generic ground route`, await (async () => {
    const o = await tw(nakamura, `${W}/${TWIN.id}/versions/open`, 'twin.version', 'TWN', { branchId: BRANCH, forkedFromVersion: base.version, carryFrom: base.version, observedThrough: dayOf(base.observed_through), except: [DELAY], knownAt: new Date(await dbNow()).toISOString() }, TWIN.id);
    if (!o.ok) return o;
    return tw(nakamura, `${W}/${TWIN.id}/versions/${o.body.version.version}/ground`, 'twin.ground', 'TWN', { elements: [{ key: DELAY, kind: 'scenario', value: 45, unit: 'days', citations: [{ kind: 'assumption', id: ASU.id }] }] }, TWIN.id);
  })(), 422, /kind must be one of observed, estimated, assumed, predicted, simulated/);
  const v = await versionOf(nakamura, 'the blockade branch', BRANCH, { forkedFromVersion: base.version, carryFrom: base.version, observedThrough: dayOf(base.observed_through), except: [DELAY] },
    { scenario: [{ key: DELAY, value: 45, unit: 'days', scenarioId: EVERY.id, scenarioBranchId: BLOCK_BRANCH.id, assumption: { id: ASU.id }, confidence: 0.4 }] });
  if (v) ok(`T. Nakamura BRANCHED the corridor twin: ${BRANCH} v${v.version} forked from actual v${base.version}, ${DELAY} = 45 days as a SCENARIO element (the "regional blockade" branch, citing the assumption) — admitted ${v.admitted?.completeness}`);
  BHEAD = await headOf(BRANCH);
}
if (BHEAD) {
  const el = (await q(`select kind, value from twin.state_elements where twin_id = $1 and version = $2 and key = $3`, [TWIN.id, BHEAD.version, DELAY]))[0];
  (el?.kind === 'scenario' && Number(el.value) === 45 ? ok : bad)(`the branch head v${BHEAD.version}: ${DELAY} = ${el?.value} (${el?.kind}); actual's head v${(await headOf()).version} keeps its own`);
}
// THE MERGE: opened by T. Nakamura; its completion REFUSED until reconciliation — left open for the walk
let MERGE = (await q(`select merge_id::text id, state, diverging, source_version, target_version, opened_by::text opened_by from twin.branch_merges where twin_id = $1 and source_branch = $2 and state in ('open', 'reconciled', 'completing') limit 1`, [TWIN.id, BRANCH]))[0] ?? null;
if (MERGE) note(`the merge ${short(MERGE.id)} of ${BRANCH} stands — an earlier run (${MERGE.state}, v${MERGE.source_version} → actual v${MERGE.target_version})`);
else if (BHEAD) {
  const r = await tw(nakamura, `${BR}/twins/${TWIN.id}/merges/open`, 'twin.branch.merge', 'TWN', { sourceBranch: BRANCH, reason: 'take the blockade planning state back into actual (SYNTHETIC)' }, TWIN.id);
  if (!r.ok) fail('T. Nakamura opens the merge', r);
  else { MERGE = { id: r.body.merge.merge_id, state: r.body.merge.state, diverging: r.body.merge.diverging, source_version: r.body.merge.source_version, target_version: r.body.merge.target_version };
    ok(`T. Nakamura OPENED the merge ${short(MERGE.id)} of ${BRANCH} v${MERGE.source_version} into actual v${MERGE.target_version}: the server's diverging keys ${(MERGE.diverging ?? []).map((k) => `${k.key} (${k.change})`).join(', ')}; unresolved ${JSON.stringify(r.body.merge.unresolved)}`); }
}
if (MERGE) {
  expectRefused(`T. Nakamura completes the merge of ${BRANCH} with nothing reconciled`, await tw(nakamura, `${BR}/merges/${MERGE.id}/complete`, 'twin.branch.merge', 'TWN', {}, null), 409, /^branch merge rejected \(unreconciled\): merging branch blockade back into actual is refused until reconciliation/);
  const it = (await q(`select item_id::text id, state, owner_principal_id::text owner, title from executive.attention_items where signal_class = 'twin.reconciliation' and subject_id = $1 order by created_at limit 1`, [MERGE.id]))[0] ?? null;
  note(`the merge stays OPEN (the walk's refusal reads it); its review item ${short(it?.id)} → ${nm(it?.owner)} (${it?.state}): "${String(it?.title ?? '—').slice(0, 110)}"`);
}
{
  const r = await tw(hoffmann, `${BR}/twins/${TWIN.id}/explorer`, 'twin.read', 'TWN', {}, TWIN.id, READ);
  if (!r.ok) fail('A. Hoffmann reads the explorer', r);
  else { const x = r.body.explorer; note(`the explorer (A. Hoffmann): branches ${(x.branches ?? []).map((b) => `${b.branch_id} v${b.head}${b.forked_from ? ` (from v${b.forked_from})` : ''}`).join(', ')}; merges ${(x.merges ?? []).map((m) => `${m.source_branch} ${m.state}`).join(', ')}; served ${x.served?.mode ?? '—'} v${x.served?.version ?? '—'}; head freshness ${x.freshness?.state ?? x.head_freshness?.state ?? '—'}`); }
}
{
  const before = (await q(`select max(admitted_at) t from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'admitted' and version < $2`, [TWIN.id, STALE.version]))[0].t;
  const at = new Date(new Date(before).getTime() + 60_000);
  const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  ENV_OUT.EYE_B30_BRANCH = BRANCH; ENV_OUT.EYE_B30_AS_OF = local(at.getTime() < new Date(STALE.admitted_at).getTime() ? at : new Date(before));
}

/* ── B30-E THE ENVELOPE ──────────────────────────────────────────────────────────────── */
console.log('\nB30-E THE ENVELOPE (F-P5-04) — a 75-day corridor delay run outside supply-flow@1\'s envelope: disabled for decision use, admitted as exploratory by the twin owner only');
const STRESS = 'stress-75';
const asCitation = (c) => ({ kind: c.kind, id: c.id, ...(c.version === undefined || c.version === null ? {} : { version: Number(c.version) }) });
let SHEAD = await headOf(STRESS);
if (SHEAD) note(`the branch ${STRESS} stands — an earlier run (head v${SHEAD.version})`);
else {
  const base = await headOf();
  const cur = (await q(`select citations from twin.state_elements where twin_id = $1 and version = $2 and key = $3`, [TWIN.id, base.version, DELAY]))[0];
  const v = await versionOf(nakamura, 'the 75-day stress state', STRESS, { forkedFromVersion: base.version, carryFrom: base.version, observedThrough: dayOf(base.observed_through), except: [DELAY] },
    { elements: [{ key: DELAY, kind: 'assumed', value: 75, unit: 'days', citations: (cur?.citations ?? []).filter((c) => c.kind !== 'twin').map(asCitation) }] });
  if (v) ok(`T. Nakamura opened the corridor's stress state on the BRANCH ${STRESS} v${v.version} (forked from actual v${base.version}; actual's head is untouched — the B30-B walks read it): ${DELAY} = 75 days ASSUMED — admitted ${v.admitted?.completeness}`);
  SHEAD = await headOf(STRESS);
}
const runStress = (s, extra = {}) => sm(s, `${W}/simulations/run`, 'simulation.run', 'SIM', { twinId: TWIN.id, twinVersion: SHEAD.version, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG',
  interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...extra });
let RUN75 = SHEAD === null ? null : (await q(`select run_id::text id from simulation.runs_current where twin_id = $1 and twin_version = $2 and envelope_state = 'outside' and state = 'completed' order by opened_at limit 1`, [TWIN.id, SHEAD.version]))[0]?.id ?? null;
if (RUN75) note(`the outside-envelope run ${short(RUN75)} on ${STRESS} v${SHEAD.version} stands — an earlier run`);
else if (SHEAD) {
  expectRefused('T. Nakamura runs the 75-day state without an acknowledgement', await runStress(nakamura), 422, /^run rejected \(envelope\): outside the operating envelope of supply-flow@1 \(corridor_delay_days = 75 outside \[0, 60\]\)/);
  const r = await runStress(nakamura, { envelope: { acknowledge: true, reason: 'the 75-day corridor delay is the stress case the board asked to see (SYNTHETIC)' } });
  if (!r.ok) fail('T. Nakamura runs the 75-day state with his acknowledgement', r); else { RUN75 = r.body.run.runId; ok(`T. Nakamura (a twin owner) ACKNOWLEDGED the envelope and RAN ${short(RUN75)} → ${r.body.run.state}`); }
}
if (RUN75) {
  const row = (await q(`select envelope_state, envelope_check, envelope_ack, outputs -> 'totals' ->> 'line_stop_days' ls from simulation.runs_current where run_id = $1`, [RUN75]))[0];
  note(`the run's envelope: ${String(row.envelope_state).toUpperCase()} — ${JSON.stringify(row.envelope_check?.violations ?? row.envelope_check).slice(0, 160)}; acknowledged by ${nm(row.envelope_ack?.acknowledged_by)}; line-stop days ${row.ls ?? '—'} (SYNTHETIC)`);
  const useOf = async () => { const u = await sm(hoffmann, `${S}/validity/runs/${RUN75}/use`, 'simulation.validity.read', 'SIM', {}, RUN75, READ); return u.ok ? u.body.use : (fail('A. Hoffmann reads the run\'s decision use', u), null); };
  const adm = async () => (await q(`select admission_id::text id, admitted_by::text admitted_by, concurred_by::text concurred_by from simulation.exploratory_admissions where run_id = $1`, [RUN75]))[0] ?? null;
  let a = await adm();
  if (!a) {
    const u = await useOf();
    if (u) (u.use === 'refused' && (u.reasons ?? [])[0]?.class === 'outside_envelope' ? ok : bad)(`A. Hoffmann READ its decision use: ${u.label} — "${String((u.reasons ?? [])[0]?.detail ?? '').slice(0, 170)}"`);
    expectRefused('T. Richter (the domain administrator) admits it as exploratory', await sm(richter, `${EN}/runs/${RUN75}/admit`, 'twin.envelope.admit', 'SIM', { reason: 'the administrator admits the stress case (SYNTHETIC)' }, RUN75), 403, /^exploratory admission rejected \(ownership\): only a twin owner admits an outside-envelope run as exploratory/);
    const r = await sm(nakamura, `${EN}/runs/${RUN75}/admit`, 'twin.envelope.admit', 'SIM', { reason: 'explore the 75-day closure as a stress case, never as a plan (SYNTHETIC)' }, RUN75);
    if (!r.ok) fail('T. Nakamura admits it as exploratory', r); else ok(`T. Nakamura (the twin's owner) ADMITTED it: ${r.body.admission.decision_use?.label} — keys ${JSON.stringify(r.body.admission.keys)}`);
    a = await adm();
  } else note(`the exploratory admission ${short(a.id)} by ${nm(a.admitted_by)} stands — an earlier run`);
  if (a && !a.concurred_by) {
    const r = await sm(petrovic, `${EN}/runs/${RUN75}/concur`, 'twin.envelope.concur', 'SIM', { note: 'the stress case is worth exploring; never for a decision (SYNTHETIC)' }, RUN75);
    if (!r.ok) fail('H. Petrović concurs', r); else ok(`H. Petrović (method steward, a second named human) CONCURRED with the exploratory admission`);
  } else if (a) note(`H. Petrović's concurrence stands — an earlier run (${nm(a.concurred_by)})`);
  const u = await useOf();
  if (u) (u.use === 'refused' && u.exploratory === true ? ok : bad)(`the decision use now: ${u.label} (exploratory ${u.exploratory}; admitted by ${nm(u.exploratory_admission?.admitted_by)}, concurred by ${nm(u.exploratory_admission?.concurred_by)})`);
  ENV_OUT.EYE_B30_TWIN_OWNER = 't.nakamura'; ENV_OUT.EYE_B30_DOMAIN_ADMIN = 't.richter'; ENV_OUT.EYE_B30_OUTSIDE_RUN = RUN75;
}

/* ── B30-X THE FABRIC CARRYOVERS ─────────────────────────────────────────────────────── */
console.log('\nB30-X THE FABRIC CARRYOVERS (F-P5-06/07) — a discrete-event@1 experiment in chunks, completed by the ticks; a superseded corridor control retired with its reason');
const FAB_TITLE = 'Regensburg line — bearing shortage, 60 paths (SYNTHETIC)';
const OR = `${S}/orchestration`; const FB = `${S}/fabric`;
const expRow = async () => (await q(`select experiment_id::text id, state, run_id::text run, progress, approved_by::text approved_by, declared_by::text declared_by from simulation.experiments where tenant_id = $1 and domain_id = $2 and title = $3 order by declared_at desc limit 1`, [T, D, FAB_TITLE]))[0] ?? null;
let EXP = await expRow();
if (EXP) note(`the fabric experiment ${short(EXP.id)} "${FAB_TITLE}" stands — an earlier run (${EXP.state})`);
else {
  const dsv = (await q(`select version from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'admitted' order by version desc limit 1`, [DS.id]))[0]?.version;
  const r = await sm(kovacs, `${OR}/declare`, 'simulation.experiment.declare', 'SXP', { title: FAB_TITLE, question: 'How many line-stop days does a 21-day bearing shortage cost the Regensburg line across cycle-time variation?',
    run: { twinId: DS.id, twinVersion: dsv, runKind: 'control', controlRunId: null, shock: false, component: 'bearing', interventions: [{ type: 'none' }], horizonDays: 42,
           modelRef: 'discrete-event@1', params: { start_date: '2026-10-05', shortage: { start_day: 7, days: 21, fraction: 0.4 } } },
    paths: 60, chunkSize: 20, seed: 31, pace: { chunks_per_tick: 3 }, measures: ['line_stop_days'], budget: { max_paths: 60, max_wall_seconds: 600, max_chunks: 6 } });
  if (!r.ok) fail(`E. Kovács declares "${FAB_TITLE}"`, r);
  else { const x = r.body.experiment; ok(`E. Kovács (the study twin's owner) DECLARED ${short(x.experiment_id)}: ${x.method_ref} on v${x.twin_version}, ${x.paths} paths in chunks of ${x.chunk_size}, seed ${x.seed}, ${x.pace?.chunks_per_tick} chunks a tick, measures ${JSON.stringify(x.measures)}, the budget ${JSON.stringify(x.budget)}; on an unstable checkpoint: ${x.on_unstable}`); }
  EXP = await expRow();
}
if (EXP?.state === 'declared') {
  const x = (await sm(kovacs, `${OR}/${EXP.id}/read`, 'simulation.experiment.read', 'SXP', {}, EXP.id, READ)).body.experiment;
  expectRefused('E. Kovács (the declarer) approves her own budget', await sm(kovacs, `${OR}/${EXP.id}/approve`, 'simulation.experiment.approve', 'SXP', { budgetDigest: x.budget_digest, note: 'I approve my own budget (SYNTHETIC)' }, EXP.id), 403, /^experiment rejected \(separation_of_duties\)/);
  const r = await sm(weber, `${OR}/${EXP.id}/approve`, 'simulation.experiment.approve', 'SXP', { budgetDigest: x.budget_digest, note: 'sixty paths answer the line question; the budget is approved as read (SYNTHETIC)' }, EXP.id);
  if (!r.ok) fail('J. Weber approves the budget', r); else ok(`J. Weber APPROVED the budget by its digest ${String(r.body.experiment.approved_budget_digest).slice(0, 12)}… → ${r.body.experiment.state}`);
  EXP = await expRow();
} else if (EXP?.approved_by) note(`the budget was approved by ${nm(EXP.approved_by)} — an earlier run`);
if (EXP?.state === 'approved') {
  const r = await sm(kovacs, `${OR}/${EXP.id}/start`, 'simulation.experiment.start', 'SXP', {}, EXP.id);
  if (!r.ok) fail('E. Kovács starts the experiment', r); else ok(`E. Kovács STARTED it: the run ${short(r.body.experiment.run_id)} opened (seeded, ${(await q(`select samples from simulation.runs_current where run_id = $1`, [r.body.experiment.run_id]))[0]?.samples} samples) → ${r.body.experiment.state}`);
  EXP = await expRow();
}
if (EXP?.state === 'running') EXP = await waitFor('the ticks that complete the fabric experiment', expRow, (e) => e.state !== 'running', 420_000, 3000);
if (EXP) {
  const ev = (await q(`select event from simulation.experiment_events where experiment_id = $1 order by occurred_at, event_id`, [EXP.id])).map((e) => e.event);
  const run = EXP.run ? (await q(`select state, samples, model_ref, outputs -> 'summary' -> 'line_stop_days' ls from simulation.runs_current where run_id = $1`, [EXP.run]))[0] : null;
  const ks = await q(`select seq, chunk_index, paths_done from simulation.experiment_checkpoints where experiment_id = $1 order by seq`, [EXP.id]);
  (EXP.state === 'completed' && run?.state === 'completed' ? ok : bad)(`THE FABRIC EXPERIMENT ${String(EXP.state).toUpperCase()} by the attention agent's ticks: ${ks.length} checkpoints (${ks.map((k) => `${k.paths_done}`).join(' → ')} paths); the ledger ${ev.join(' → ')}; the run ${short(EXP.run)} ${run?.state} (${run?.model_ref}, ${run?.samples} samples; line-stop days ${JSON.stringify(run?.ls ?? null).slice(0, 120)} — SYNTHETIC)`);
}
ENV_OUT.EYE_B30_FABRIC_TITLE = 'Regensburg line — bearing shortage'; ENV_OUT.EYE_B30_OPERATOR = 't.nakamura'; ENV_OUT.EYE_B30_STEWARD = 'h.petrovic';
// THE RETIREMENT: a SUPERSEDED corridor control — the oldest of T. Nakamura's that nothing rests on (no package, no analysis, no dependent run), superseded by the promoted control
const RET_REASON = 'superseded by the promoted corridor control (SYNTHETIC)';
let RET = (await q(`select r.retirement_id::text id, r.run_id::text run, r.superseded_by::text sup from simulation.retirements r where r.tenant_id = $1 and r.domain_id = $2 and r.subject_kind = 'run' and r.reason = $3 and r.retired_by = $4 limit 1`, [T, D, RET_REASON, nakamura.principalId]))[0] ?? null;
if (RET) note(`the retirement ${short(RET.id)} of run ${short(RET.run)} stands — an earlier run (superseded by ${short(RET.sup)})`);
else {
  const SUP = (await q(`select run_id::text id, opened_at from simulation.runs_current where tenant_id = $1 and domain_id = $2 and twin_id = $3 and run_kind = 'control' and state = 'completed' and validity = 'valid' and promotion_id is not null and retired_at is null order by opened_at desc limit 1`, [T, D, TWIN.id]))[0] ?? null;
  const cands = SUP === null ? [] : await q(`select r.run_id::text id, r.opened_at, r.twin_version, (simulation.sxp_retirement_reach(r.run_id) -> 'counts') counts from simulation.runs_current r
      where r.tenant_id = $1 and r.domain_id = $2 and r.twin_id = $3 and r.run_kind = 'control' and r.state = 'completed' and r.validity = 'valid' and r.retired_at is null and r.promotion_id is null
        and coalesce(r.envelope_state, 'inside') <> 'outside' and r.operator_principal_id = $4 and r.opened_at < $5 and not exists (select 1 from simulation.experiments e where e.run_id = r.run_id)
      order by r.opened_at`, [T, D, TWIN.id, nakamura.principalId, SUP.opened_at]);
  const pick = cands.find((c) => Number(c.counts?.packages) === 0 && Number(c.counts?.analyses) === 0 && Number(c.counts?.dependent_runs) === 0) ?? null;
  if (!SUP || !pick) bad(`no superseded corridor control to retire: the promoted control ${SUP ? short(SUP.id) : 'ABSENT'}; ${cands.length} older candidate(s), none free of reach`);
  else {
    const rd = await sm(nakamura, `${FB}/runs/${pick.id}/read`, 'simulation.fabric.read', 'SIM', {}, pick.id, READ);
    const reach = rd.ok ? rd.body.run?.reach : null;
    if (!reach || (reach.packages ?? []).length > 0 || Number(reach.counts?.analyses) > 0 || Number(reach.counts?.dependent_runs) > 0) bad(`the reach read of ${short(pick.id)} is not clear: ${rd.ok ? JSON.stringify(reach?.counts) : refusalLine(rd)} — not retired`);
    else {
      ok(`T. Nakamura READ the run ${short(pick.id)} (control on v${pick.twin_version}, opened ${iso(pick.opened_at)}) through the retirement read first: ${reach.counts.packages} package(s) cite it, ${reach.counts.analyses} analysis record(s) rest on it, ${reach.counts.dependent_runs} run(s) compare against it — nothing a committed package cites`);
      const r = await sm(nakamura, `${FB}/runs/${pick.id}/retire`, 'simulation.retirement.run', 'SIM', { reason: RET_REASON, supersededBy: SUP.id }, pick.id);
      if (!r.ok) fail('T. Nakamura retires the superseded control', r);
      else { RET = { id: r.body.retirement.retirement_id, run: pick.id, sup: SUP.id }; ok(`T. Nakamura RETIRED ${short(pick.id)} — "${RET_REASON}", superseded by the promoted control ${short(SUP.id)}; reach recorded ${JSON.stringify(r.body.retirement.reach?.counts)}; owners told ${(r.body.retirement.notified ?? []).length}`); }
    }
  }
}
if (RET) {
  const u = await sm(hoffmann, `${S}/validity/runs/${RET.run}/use`, 'simulation.validity.read', 'SIM', {}, RET.run, READ);
  if (u.ok) ((u.body.use.reasons ?? []).some((x) => x.class === 'retired') ? ok : bad)(`the retired run's decision use: ${u.body.use.label}`); else fail('the retired run\'s decision use', u);
  ENV_OUT.EYE_B30_RETIRED_RUN = RET.run; ENV_OUT.EYE_B30_RETIRED_REASON = RET_REASON;
}

/* ── B30-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB30-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from twin.estimators where tenant_id = $1 and domain_id = $2 and state = 'active')::int estimators,
                             (select count(*) from twin.estimates where tenant_id = $1 and domain_id = $2)::int estimates,
                             (select count(*) from twin.estimates where tenant_id = $1 and domain_id = $2 and proposer_kind = 'agent')::int agent_estimates,
                             (select count(*) from twin.estimation_events where tenant_id = $1 and domain_id = $2 and event like 'trigger.%')::int triggers,
                             (select count(*) from twin.observation_requests where tenant_id = $1 and domain_id = $2)::int requests,
                             (select count(*) from twin.freshness_policies where tenant_id = $1 and domain_id = $2)::int policies,
                             (select count(*) from twin.branch_merges where tenant_id = $1 and domain_id = $2)::int merges,
                             (select count(*) from twin.branch_events where tenant_id = $1 and domain_id = $2)::int branch_events,
                             (select count(*) from simulation.exploratory_admissions where tenant_id = $1 and domain_id = $2)::int admissions,
                             (select count(*) from twin.envelope_events where tenant_id = $1 and domain_id = $2)::int envelope_events,
                             (select count(*) from simulation.retirements where tenant_id = $1 and domain_id = $2)::int retirements,
                             (select count(*) from simulation.experiments where tenant_id = $1 and domain_id = $2 and method_ref <> 'supply-flow@1')::int fabric_experiments,
                             (select count(*) from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class in ('twin.reconciliation', 'twin.freshness', 'twin.envelope', 'twin.observation_request', 'simulation.checkpoint'))::int items`, [T, D]))[0];
  note(`in the ledgers: ${n.estimators} active estimator(s), ${n.estimates} estimate(s) (${n.agent_estimates} by the agent), ${n.triggers} queued trigger(s), ${n.requests} observation request(s); ${n.policies} freshness polic(ies), ${n.merges} merge(s), ${n.branch_events} branch event(s); ${n.admissions} exploratory admission(s), ${n.envelope_events} envelope event(s); ${n.retirements} retirement(s), ${n.fabric_experiments} fabric experiment(s); ${n.items} B30 attention item(s)`);
  const head = await headOf();
  note(`the corridor twin now: actual v${head.version} observed through ${dayOf(head.observed_through)} (${head.completeness}); branches ${(await q(`select branch_id, max(version) v from twin.twin_versions where twin_id = $1 and state = 'admitted' group by 1 order by 1`, [TWIN.id])).map((b) => `${b.branch_id} v${b.v}`).join(', ')}`);
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/\s/.test(v) ? `'${v}'` : v}`);
  note(`LIMITS said: EVERY FIGURE IS SYNTHETIC except the PortWatch transit counts — the corridor's baseline (stated so that the latest count reads 62 %), the challengers' parameters, the conservation tolerance (0.5 transits/day), the 2-day SLO, the 45-day blockade, the 75-day stress delay, the bearing shortage and the reasons are the personas' statements for the demonstration, not measurements. THE PORTWATCH COUNT: the series portwatch:chokepoint4:n_total is the IMF PortWatch publisher's (collected through the real connector — M. Dvořák's collection now, and the daily schedule); its latest point is what the estimate reads — when the publisher has nothing new since the estimators were declared (PortWatch publishes weekly), no telemetry trigger is queued and the act says so and A. Hoffmann proposes through the route; the Reconciliation Agent's proposal on a NEW count is then harness-proven (phase6-estimation-b30 ES5) — the estimation walk's "the Reconciliation Agent (run …)" line holds only on a staging where the agent proposed. THE TICK: the attention agent's real scheduled tick (60 s) raises twin.freshness, queues the estimation checks and drains the fabric experiment — waited for, never driven (the "synthetic tick" of the harnesses is NOT used here). "5 DAYS STALE" holds only on the day the head was admitted: the age is the database's day minus the head's observed_through (the act re-admits a head at the day − 5 when it runs on a later day). THE BRANCHES: the 75-day stress state lives on the branch ${STRESS}, never on actual's head (the B30-B walks read actual); the blockade merge is LEFT OPEN (the walk's refused completion reads it); the stress run is admitted EXPLORATORY and concurred, never promoted. THE RETIREMENT: the oldest of T. Nakamura's corridor controls that no package, analysis or run rests on, superseded by the promoted control. NOT STAGED (HARNESS-PROVEN): estimation — the stale/suspended-source qualification refusals, the violated conservation and range refusals, the stale-head approval rollback, the decline, the internal-change and ontology-revision triggers, the drifted agent, observation requests and their fulfilment (phase6-estimation-b30 ES1–ES6); branches — checkpoint restore, the reconciled and completed merge, the stale merge withdrawn, per-key staleness, the dependency uncertainty, the frozen validated snapshot and its expiry, component confidence, the scenario basis rule (phase6-branches-b30 BR1–BR7); envelope — the raised promotion threshold, calibration and drift, the model lifecycle (deprecated/incompatible/retired), the AI context, the degraded modes (phase6-envelope-b30 E3–E8); fabric — the war-gaming retry, the checkpoint indicators acted on (stop/pause/quarantine), the experiment retirement, the envelope sweep, rare events and benchmark validation (phase6-experiments-b30 X1–X6). LEFT OUT (the parts' reports): closing the routed estimate item on decision; an estimate citation kind; the calibration tick hook; the scenario-element web form. Nothing is cleaned: every object stands as a demonstration fact.`);
}

/* ── THE END ── */
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
