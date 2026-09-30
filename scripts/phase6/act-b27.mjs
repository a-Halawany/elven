#!/usr/bin/env node
/**
 * CP-6 batch B27 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): SCENARIO ANATOMY, SETS
 * AND COHERENCE (migration 0097; F-P4-07 / F-P4-08 / F-P4-09) — exercised by the personas through the REAL HTTP path, each scene stating the
 * effect it produced in the ledgers, and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE:
 * each scene first reads what an earlier run left and says "stands — an earlier run" instead of writing it twice. No clock is moved; nothing
 * is planted: every row is a persona's governed act or the schedule's (the attention agent's tick, every 60 s on the demonstration — the act
 * WAITS for it; it calls no tick route, there is none outside the test runtime).
 *
 *   B27-0 THE STATE: 0097 applied; the casting read from identity.role_bindings (no new persona: the B27 roles are the existing ones); the
 *         attention agent and its cadence; the inputs (the Regensburg objective, the corridor risk, the January Regensburg decision, the
 *         corridor control/intervention run pair, a forecast not assessed unfit, the escalated insurer signal).
 *   B27-A THE ANATOMY (F-P4-07; stage scene 1): J. Weber declares a FRESH "Bab el-Mandeb closure" scenario — Baseline (J. Weber) and the
 *         disruption "Insurer withdrawal" (N. Eriksen, on the B27 transit signpost, its divergence stated); the drivers "Houthi activity"
 *         (scenario-wide, EXOGENOUS) and "Insurer withdrawal" (the disruption branch, endogenous), the actor "Carriers" (agency high), the
 *         mechanism "War-risk premium → rerouting" (resting on both drivers), the intervention "Naval escort" and the impact "Regensburg line
 *         stop" on the Regensburg objective; the analyst's declaration REFUSED (403); the ASU "Insurers keep war-risk cover" declared by
 *         J. Weber and linked CRITICAL to the disruption branch by its owner; the narrative, implication and option records; J. Weber
 *         INVALIDATES the ASU through the graph's verify route → the disruption branch SUSPENDED in the same act and N. Eriksen TASKED
 *         (scenario.suspension); the owner's reinstatement REFUSED while the assumption stays invalidated. LEFT SUSPENDED (the walk's stage).
 *   B27-S THE SET (F-P4-08; stage scene 2): J. Weber declares "Regensburg supply — the corridor scenario set" over the every-kind corridor
 *         scenario's Baseline, Disruption and user-defined "regional blockade" branches with the policy {require: baseline + stress,
 *         min_branches 3, min_adverse 1}; ACTIVATES → the check FAILS on the missing stress kind and J. Weber is tasked (scenario.set_gap);
 *         L. Brandt's bind of a COMMITTED Regensburg package REFUSED (why a fresh package); L. Brandt declares a FRESH package on the January
 *         Regensburg decision (status quo vs dual-source), BINDS the set and PROPOSES → REFUSED 409 `recommendation rejected (plurality)`
 *         naming stress; J. Weber adds the scenario's STRESS branch → the check passes, the gap item closes → L. Brandt's proposal goes
 *         through; L. Brandt COMPARES the branches side by side; M. Dvořák records the PORTFOLIO REVIEW (robustness and regret computed by the
 *         port); the tick step scenario-relevance (67) scores the set's scenario — the act WAITS for it; N. Eriksen PROPOSES a scenario from
 *         the escalated insurer signal, her own resolution refused, J. Weber RESOLVES it (accepting declares nothing).
 *   B27-Q THE QUALITY (F-P4-09; stage scene 3): N. Eriksen registers the SYNTHETIC series freight-rate:red-sea-container-spot (no source
 *         feeds it — said); J. Weber defines its signpost and declares "Bab el-Mandeb freight exposure (SYNTHETIC)" (Baseline and the upside
 *         "Freight-rate spike" on it), adds through BranchScenario two branches that differ ONLY IN WORDING ("Strait closure" and the
 *         user-defined "strait shutdown"), RETIRES the freight-rate signpost (its branch's indicator MISSING) and EVALUATES → FAILED:
 *         indistinct_branches and indicator_missing, NOT DECISION-ACTIVE, J. Weber's scenario.quality item; the frequency-to-probability map
 *         declared (4 bands), a probability set by the map and one by expert elicitation; a narrative basis and the analyst's set REFUSED.
 *   B27-9 THE STATE, the env lines for the walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC (the freight-rate series and its signpost, the payoffs, the probabilities, the elicitation, the anatomy's
 * elements and records); the transit signposts rest on the real PortWatch series key but are never evaluated here. Nothing prints a credential.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

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
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const G = `${X}/graph`; const DC = `${X}/decisions`;
const AN = 'scenarios/anatomy'; const QU = 'scenarios/quality'; const ST = 'scenarios/sets';
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 220)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const tStart = Date.now();
console.log(`THE B27 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
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

/* ── B27-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB27-0 THE STATE — 0097, the casting, the attention agent, the inputs');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0097%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0097 is not applied'); process.exit(1); }
}
const CAST = { 'j.weber': ['strategy_owner'], 'n.eriksen': ['forecast_owner'], 'l.brandt': ['decision_authority', 'decision_owner'], 'm.dvorak': ['executive'], 'a.hoffmann': ['domain_analyst'], 's.okafor': ['decision_approver'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const weber = await who('j.weber'); const eriksen = await who('n.eriksen'); const brandt = await who('l.brandt'); const dvorak = await who('m.dvorak'); const hoffmann = await who('a.hoffmann'); const okafor = await who('s.okafor');
const NAME = { [weber.principalId]: 'J. Weber', [eriksen.principalId]: 'N. Eriksen', [brandt.principalId]: 'L. Brandt', [dvorak.principalId]: 'M. Dvořák', [hoffmann.principalId]: 'A. Hoffmann',
  [okafor.principalId]: 'S. Okafor', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose, consequence = 'C2') => (over) => as(s, scope, { purposeId: purpose, consequence, ...over });
/** The prediction routes (the older ones and the three B27 parts'), under the purpose `prediction` as the harnesses issue them. */
const pd = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${P}/${path}`, env_(s, 'prediction')({ action, objectType, objectId, ...extra }), payload, s.token);
const gr = (s, path, action, objectType, payload, objectId = null) => call(`${G}/${path}`, env_(s, 'graph')({ action, objectType, objectId }), payload, s.token);
const dc = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${DC}/${path}`, env_(s, 'decision', 'C1')({ action, objectType, objectId, ...extra }), payload, s.token);
const READ = { sideEffect: 'none' };

// THE ATTENTION AGENT: the tick's host on this runtime (its scheduled ticks are what the act waits for)
const AGENT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (AGENT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [AGENT.agent_id]))[0];
  ok(`the attention agent ${short(AGENT.agent_id)} (registered in B24) — cadence ${AGENT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${new Date(last.t).toISOString().slice(0, 19)}Z)` : ''} — the B27 steps scenario-relevance (67) and scenario-quality (68) run inside it`);
}
// The inputs the scenes read
const OBJ_REG = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const CORRIDOR = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and status = 'active' and title = 'Corridor closure — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const JAN = (await q(`select package_id::text pkg, decision_object_id::text dec, state from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const PAIR = (await q(`select c.run_id::text control, i.run_id::text intervention, c.twin_id::text twin from simulation.runs_current c join simulation.runs_current i on i.control_run_id = c.run_id and i.run_kind = 'intervention' and i.state = 'completed' and i.validity = 'valid'
                        where c.tenant_id = $1 and c.domain_id = $2 and c.run_kind = 'control' and c.state = 'completed' and c.validity = 'valid' and c.model_ref = 'supply-flow@1'
                          and not exists (select 1 from simulation.runs_current x, jsonb_array_elements(coalesce(x.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                                           join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid where x.run_id in (c.run_id, i.run_id) and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn')
                        order by c.opened_at desc, i.opened_at limit 1`, [T, D]))[0] ?? null;
// a forecast the fresh scenarios rest on: issued and NOT assessed unfit (every older forecast of the demonstration was — a scenario on one fails the v1 coherence check)
const FCT = (await q(`select forecast_id::text id, series_key, fitness_state from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and state = 'issued' and coalesce(fitness_state, '') <> 'unfit' order by issued_at desc limit 1`, [T, D]))[0] ?? null;
const EVERY_TITLE = 'Bab el-Mandeb over the next quarter — every scenario kind (vocabulary v1)';
const EVERY = (await q(`select scenario_id::text id, title, owner_principal_id::text owner from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, EVERY_TITLE]))[0] ?? null;
const SIGNAL = (await q(`select signal_id::text id, title from prediction.signals_current where tenant_id = $1 and domain_id = $2 and disposition = 'escalate' and title ilike '%insurer%' order by (title ilike '%second insurer%') desc, disposition_at desc nulls last limit 1`, [T, D]))[0] ?? null;
if ([OBJ_REG, CORRIDOR, JAN, PAIR, FCT, EVERY, SIGNAL].some((x) => x === null)) {
  bad(`an input is missing: ${JSON.stringify({ OBJ_REG: !!OBJ_REG, CORRIDOR: !!CORRIDOR, JAN: !!JAN, PAIR: !!PAIR, FCT: !!FCT, EVERY: !!EVERY, SIGNAL: !!SIGNAL })}`); process.exit(1);
}
ok(`the inputs: the Regensburg objective ${short(OBJ_REG.id)}; the corridor risk ${short(CORRIDOR.id)}; the January Regensburg decision ${short(JAN.dec)} (its package ${JAN.state}); the run pair ${short(PAIR.control)} / ${short(PAIR.intervention)}; the forecast ${short(FCT.id)} of ${FCT.series_key} (fitness ${FCT.fitness_state ?? 'not assessed'}); the every-kind scenario ${short(EVERY.id)}; the escalated signal "${String(SIGNAL.title).slice(0, 70)}"`);
// THE TRANSIT SIGNPOST the fresh scenarios' adverse branches watch — defined once by N. Eriksen on the real PortWatch key (never evaluated here)
const TRANSIT_DESC = 'B27 signpost: Bab el-Mandeb transits below 41 per day for five consecutive published days (SYNTHETIC signpost on the PortWatch series key)';
let TRANSIT = (await q(`select indicator_id::text id, state from prediction.indicators_current where tenant_id = $1 and domain_id = $2 and description = $3 limit 1`, [T, D, TRANSIT_DESC]))[0] ?? null;
if (TRANSIT) note(`the B27 transit signpost ${short(TRANSIT.id)} stands (${TRANSIT.state}) — an earlier run`);
else {
  const r = await pd(eriksen, 'indicators/define', 'prediction.indicator.define', 'IND', { seriesKey: 'portwatch:chokepoint4:n_total', description: TRANSIT_DESC, comparator: '<', threshold: 41, consecutiveDays: 5, owner: eriksen.principalId });
  if (!r.ok) { fail('N. Eriksen defines the B27 transit signpost', r); process.exit(1); }
  TRANSIT = { id: r.body.indicator.indicatorId, state: 'active' }; ok(`N. Eriksen DEFINED the B27 transit signpost ${short(TRANSIT.id)} on portwatch:chokepoint4:n_total (< 41 for five days)`);
}
const branchesOf = async (scenarioId) => q(`select branch_id::text id, name, kind, kind_label, state, owner_principal_id::text owner, indicator_id::text indicator from prediction.branches_current where scenario_id = $1 order by added_at, name`, [scenarioId]);
const itemsOf = (cls, subject) => q(`select item_id::text id, state, owner_principal_id::text owner, route_roles, title, subject_kind from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = $3 and subject_id = $4 order by created_at`, [T, D, cls, subject]);

/* ── B27-A THE ANATOMY (stage scene 1) ───────────────────────────────────────────────── */
console.log('\nB27-A THE ANATOMY — "Bab el-Mandeb closure": drivers, actors, the mechanism; the critical insurer assumption INVALIDATED → the disruption branch SUSPENDED, its owner TASKED');
const A_TITLE = 'Bab el-Mandeb closure — Houthi activity and insurer withdrawal (SYNTHETIC)';
let A_SCN = (await q(`select scenario_id::text id from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, A_TITLE]))[0]?.id ?? null;
if (A_SCN) note(`the scenario ${short(A_SCN)} "${A_TITLE}" stands — an earlier run`);
else {
  const r = await pd(weber, 'scenarios/declare', 'prediction.scenario.declare', 'SCN', { title: A_TITLE, statement: 'the Bab el-Mandeb corridor over the next quarter: it stays open as forecast, or war-risk insurers withdraw and carriers reroute via the Cape (SYNTHETIC)',
    forecastId: FCT.id, owner: weber.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'transits hold near the forecast level (SYNTHETIC)', owner: weber.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Insurer withdrawal', kind: 'disruption', statement: 'war-risk cover is withdrawn and sailings through the strait stop (SYNTHETIC)', divergence: 'insurers withdraw war-risk cover, so carriers stop sailing whatever the transits say',
        indicatorId: TRANSIT.id, owner: eriksen.principalId, consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 },
    ] });
  if (!r.ok) { fail('J. Weber declares the anatomy scenario', r); }
  else { A_SCN = r.body.scenario.scenarioId; ok(`J. Weber DECLARED the scenario ${short(A_SCN)} "${A_TITLE}" on the forecast ${short(FCT.id)}: Baseline (J. Weber) and the disruption "Insurer withdrawal" (N. Eriksen, on the transit signpost, its divergence stated) — v1 coherence ${r.body.scenario.coherence?.outcome ?? '—'}`); }
}
let A_BASE = null; let A_DIS = null; let ASU = null; let LINK = null;
if (A_SCN) {
  const brs = await branchesOf(A_SCN);
  A_BASE = brs.find((b) => b.kind === 'baseline') ?? null; A_DIS = brs.find((b) => b.name === 'Insurer withdrawal') ?? null;
  const an = (s, path, action, payload, objectId = A_SCN, extra = {}) => pd(s, `${AN}/${path}`, action, 'SCN', payload, objectId, extra);
  const elementOf = async (name) => (await q(`select element_id::text id, version, kind, branch_id::text branch from prediction.scenario_elements where scenario_id = $1 and name = $2 and state = 'active' limit 1`, [A_SCN, name]))[0] ?? null;
  const element = async (s, spec) => {
    const had = await elementOf(spec.name);
    if (had) { note(`the ${had.kind} "${spec.name}" stands (v${had.version}) — an earlier run`); return had.id; }
    const r = await an(s, `${A_SCN}/elements/declare`, 'prediction.scenario.anatomy.element', spec);
    if (!r.ok) { fail(`${nm(s.principalId)} declares the ${spec.kind} "${spec.name}"`, r); return null; }
    ok(`${nm(s.principalId)} DECLARED the ${spec.kind} "${spec.name}"${spec.branchId ? ' on the disruption branch' : ' (scenario-wide)'} — v${r.body.element.version}${spec.kind === 'driver' ? `, exogenous ${spec.attributes.exogenous}` : ''}${spec.kind === 'actor' ? `, agency ${spec.attributes.agency}` : ''}`);
    return r.body.element.element_id;
  };
  const HOUTHI = await element(weber, { kind: 'driver', name: 'Houthi activity', description: 'attacks on merchant shipping in the southern Red Sea and the Bab el-Mandeb strait (SYNTHETIC)', attributes: { exogenous: true },
    graphRefs: [{ kind: 'strategy', id: CORRIDOR.id }] });
  const INSURER = A_DIS ? await element(eriksen, { kind: 'driver', name: 'Insurer withdrawal', branchId: A_DIS.id, description: 'war-risk underwriters withdraw cover for the corridor (SYNTHETIC)', attributes: { exogenous: false } }) : null;
  await element(weber, { kind: 'actor', name: 'Carriers', description: 'the container lines that route NORDWERK\'s magnets and bearings through the corridor (SYNTHETIC)', attributes: { agency: 'high', interest: 'keep schedules and insured hulls' } });
  const PREMIUM = HOUTHI && INSURER ? await element(eriksen, { kind: 'mechanism', name: 'War-risk premium → rerouting', branchId: A_DIS.id, description: 'the war-risk premium makes the corridor uneconomic, so carriers reroute via the Cape (SYNTHETIC)',
    attributes: { cause: 'the war-risk premium rises or cover is withdrawn', effect: 'carriers reroute via the Cape of Good Hope', dependencies: [HOUTHI, INSURER] } }) : null;
  if (HOUTHI) await element(eriksen, { kind: 'intervention', name: 'Naval escort', branchId: A_DIS.id, description: 'coalition navies escort convoys through the strait (SYNTHETIC)', attributes: { by: 'coalition navies', expected_effect: 'fewer attacks, a lower premium', targets: [HOUTHI] } });
  if (PREMIUM) await element(eriksen, { kind: 'impact', name: 'Regensburg line stop', branchId: A_DIS.id, description: 'magnets arrive about three weeks late and the Regensburg line stops (SYNTHETIC)',
    attributes: { on: { kind: 'strategy', id: OBJ_REG.id }, direction: 'adverse', magnitude: 'severe', horizon: '30d', dependencies: [PREMIUM] } });
  // the PDP: an analyst declares no element
  expectRefused('A. Hoffmann (domain_analyst) declares a driver', await an(hoffmann, `${A_SCN}/elements/declare`, 'prediction.scenario.anatomy.element', { kind: 'driver', name: 'Bunker fuel price', description: 'an analyst may read the anatomy, not write it (SYNTHETIC)', attributes: { exogenous: true } }), 403);
  // THE ASSUMPTION: declared by the strategy owner in the Knowledge Graph (unverified), linked CRITICAL to the disruption branch by its owner
  const ASU_TITLE = 'Insurers keep war-risk cover';
  ASU = (await q(`select strategy_object_id::text id, verification_state from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and title = $3 and status = 'active' limit 1`, [T, D, ASU_TITLE]))[0] ?? null;
  if (ASU) note(`the assumption ${short(ASU.id)} "${ASU_TITLE}" stands (${ASU.verification_state}) — an earlier run`);
  else {
    const r = await gr(weber, 'strategy/declare', 'graph.strategy.declare', 'ASU', { objectType: 'ASU', title: ASU_TITLE, statement: 'hull and cargo insurers keep writing war-risk cover for the Bab el-Mandeb corridor (SYNTHETIC)',
      restsOn: [{ kind: 'strategy', id: CORRIDOR.id, rationale: 'the corridor risk is what the cover protects against (B27, SYNTHETIC)' }] });
    if (!r.ok) fail('J. Weber declares the assumption', r); else { ASU = { id: r.body.strategy.objectId, verification_state: 'unverified' }; ok(`J. Weber DECLARED the assumption ${short(ASU.id)} "${ASU_TITLE}" in the Knowledge Graph — unverified`); }
  }
  if (ASU && A_DIS) {
    LINK = (await q(`select link_id::text id, version, critical from prediction.scenario_assumptions where scenario_id = $1 and branch_id = $2 and assumption_id = $3 and state = 'linked' limit 1`, [A_SCN, A_DIS.id, ASU.id]))[0] ?? null;
    if (LINK) note(`the critical link ${short(LINK.id)} stands (v${LINK.version}) — an earlier run`);
    else if (ASU.verification_state === 'invalidated') bad('the assumption is invalidated but no link stands — the scene cannot be replayed on this database');
    else {
      const r = await an(eriksen, `${A_SCN}/assumptions/link`, 'prediction.scenario.anatomy.assumption', { assumptionId: ASU.id, branchId: A_DIS.id, critical: true,
        condition: { kind: 'state', text: 'the war-risk cover assumption is invalidated' }, rationale: 'the disruption branch exists because war-risk cover may be withdrawn' });
      if (!r.ok) fail('N. Eriksen links the assumption', r); else { LINK = { id: r.body.link.link_id, version: r.body.link.version, critical: true }; ok(`N. Eriksen LINKED "${ASU_TITLE}" CRITICAL to the disruption branch (condition: the ASU's state; v${LINK.version}) — the register`); }
    }
  }
  // THE RECORDS: narrative, implication, option (PR-33-002)
  const recordOf = async (kind, title) => (await q(`select record_id::text id from prediction.scenario_records where scenario_id = $1 and kind = $2 and title = $3 limit 1`, [A_SCN, kind, title]))[0] ?? null;
  for (const [s, rec] of [
    [weber, { kind: 'narrative', title: 'How the corridor closes', body: 'attacks rise, insurers withdraw war-risk cover, carriers reroute via the Cape and the corridor empties within weeks (SYNTHETIC)', cites: [{ kind: 'strategy', id: CORRIDOR.id }] }],
    [eriksen, { kind: 'implication', branchId: A_DIS?.id, title: 'Magnets arrive three weeks late', body: 'the Cape adds about three weeks to every magnet shipment for the Regensburg line (SYNTHETIC)', cites: [{ kind: 'strategy', id: OBJ_REG.id }] }],
    [weber, { kind: 'option', title: 'Dual-source the magnets before the season', body: 'qualify a second magnet source so the line does not rest on the corridor alone (SYNTHETIC)', cites: [{ kind: 'strategy', id: OBJ_REG.id }] }],
  ]) {
    if (await recordOf(rec.kind, rec.title)) { note(`the ${rec.kind} record "${rec.title}" stands — an earlier run`); continue; }
    const r = await an(s, `${A_SCN}/records/add`, 'prediction.scenario.anatomy.record', rec);
    if (!r.ok) fail(`${nm(s.principalId)} adds the ${rec.kind} record`, r); else ok(`${nm(s.principalId)} ADDED the ${rec.kind} record "${rec.title}"${rec.branchId ? ' (the disruption branch)' : ''} — citing ${rec.cites.map((c) => c.kind).join(', ')}`);
  }
  // THE INVALIDATION → THE SUSPENSION in the same act; the branch owner TASKED
  if (ASU && LINK && A_DIS) {
    const before = (await q(`select state from prediction.branches_current where branch_id = $1`, [A_DIS.id]))[0].state;
    if (before === 'suspended') note(`the disruption branch is SUSPENDED — an earlier run`);
    else {
      const r = await gr(weber, `strategy/${ASU.id}/assumption/verify`, 'graph.assumption.verify', 'ASU', { state: 'invalidated', reason: 'the Joint War Committee listed the corridor and the underwriters withdrew war-risk cover (SYNTHETIC)' }, ASU.id);
      if (!r.ok) fail('J. Weber invalidates the assumption', r); else ok(`J. Weber INVALIDATED "${ASU_TITLE}" through the graph's verify route (0090 §I — a person's governed act with its reason)`);
    }
    const b = (await q(`select state, suspended_from, suspended_by::text, suspension_reason, suspension_cause from prediction.branches_current where branch_id = $1`, [A_DIS.id]))[0];
    (b.state === 'suspended' ? ok : bad)(`THE SUSPENSION: "Insurer withdrawal" is ${b.state.toUpperCase()} (from ${b.suspended_from ?? '—'}, by ${nm(b.suspended_by)}) — "${String(b.suspension_reason ?? '').slice(0, 110)}…"; cause ${b.suspension_cause?.kind ?? '—'} via ${b.suspension_cause?.via ?? '—'}`);
    const base = (await q(`select state from prediction.branches_current where branch_id = $1`, [A_BASE.id]))[0].state;
    (base === 'open' ? ok : bad)(`the Baseline stays ${base} (no critical link names it)`);
    const items = await itemsOf('scenario.suspension', A_DIS.id);
    const it = items.find((x) => x.state !== 'closed') ?? items[0] ?? null;
    (it && it.owner === eriksen.principalId ? ok : bad)(`THE TASK: ${it ? `${short(it.id)} "${String(it.title).slice(0, 90)}" → ${it.state}, owner ${nm(it.owner)} (the branch owner; subject ${it.subject_kind})` : 'ABSENT'}`);
    const ev = await q(`select count(*)::int n from prediction.scenario_events where scenario_id = $1 and branch_id = $2 and event = 'branch.suspended'`, [A_SCN, A_DIS.id]);
    note(`the scenario ledger: ${ev[0].n} branch.suspended event(s) on the disruption branch`);
    // the reinstatement refused while the critical assumption stays invalidated (the owner holds the control; the port refuses)
    expectRefused('N. Eriksen reinstates the branch while the assumption stays invalidated', await an(eriksen, `branches/${A_DIS.id}/reinstate`, 'prediction.scenario.anatomy.reinstate', { note: 'the corridor looks calmer this week (SYNTHETIC)' }, A_DIS.id), 409, /^branch suspension rejected/);
    const rd = await an(hoffmann, `${A_SCN}/read`, 'prediction.scenario.anatomy.read', {}, A_SCN, READ);
    if (!rd.ok) fail('A. Hoffmann reads the anatomy', rd);
    else {
      const a = rd.body.anatomy; const dis = (a.branches ?? []).find((x) => x.branch_id === A_DIS.id);
      const k = (a.scenario_wide?.elements_by_kind ?? {});
      const reg = (a.assumptions ?? []).find((l) => l.link_id === LINK.id);
      ok(`A. Hoffmann READ the anatomy: scenario-wide drivers ${(k.driver ?? []).map((e) => e.name).join(', ')}; actors ${(k.actor ?? []).map((e) => e.name).join(', ')}; the disruption branch ${dis?.state} (live ${dis?.live}, decision-active ${dis?.decision_active}), its mechanisms ${(dis?.elements_by_kind?.mechanism ?? []).map((e) => e.name).join(', ')}, its map ${(dis?.map ?? []).map((p) => `${p.intervention.name} → ${p.impacts.map((i) => i.name).join('+') || 'unmapped'}`).join('; ')}; the register: ${reg ? `critical ${reg.critical}, invalidated ${reg.invalidated}, condition met ${reg.condition_met}` : '—'}; ${(a.records ?? []).length} record(s)`);
    }
  }
}
ENV_OUT.EYE_B27_ANATOMY_STRATEGY = 'j.weber'; ENV_OUT.EYE_B27_ANATOMY_BRANCH_OWNER = 'n.eriksen'; ENV_OUT.EYE_B27_ANATOMY_READER = 'a.hoffmann';
ENV_OUT.EYE_B27_ANATOMY_SCENARIO = 'Bab el-Mandeb closure'; ENV_OUT.EYE_B27_ANATOMY_BRANCH = 'Insurer withdrawal'; ENV_OUT.EYE_B27_ANATOMY_STAGE = 'suspended';

/* ── B27-S THE SET (stage scene 2) ───────────────────────────────────────────────────── */
console.log('\nB27-S THE SET — the Regensburg supply decision weighed against baseline, disruption and "regional blockade"; the missing STRESS branch flagged before the recommendation is allowed');
const st = (s, path, action, objectType, payload, objectId = null, extra = {}) => pd(s, `${ST}/${path}`, action, objectType, payload, objectId, extra);
const SET_TITLE = 'Regensburg supply — the corridor scenario set (SYNTHETIC)';
const PKG_TITLE = 'Regensburg supply — dual-source against the corridor scenarios (SYNTHETIC)';
const EB = await branchesOf(EVERY.id);
const pick = (name) => EB.find((b) => b.name === name) ?? null;
const B = { baseline: pick('Baseline'), disruption: pick('Disruption'), blockade: EB.find((b) => b.kind === 'user-defined' && b.kind_label === 'regional blockade') ?? null, stress: pick('Stress') };
if (Object.values(B).some((x) => x === null)) bad(`the every-kind scenario lacks a branch the scene needs: ${JSON.stringify(Object.fromEntries(Object.entries(B).map(([k, v]) => [k, v?.state ?? null])))}`);
let SET = (await q(`select set_id::text id, state, version, last_check_outcome from prediction.scenario_sets where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, SET_TITLE]))[0] ?? null;
const membersOf = async () => q(`select member_id::text id, branch_id::text branch, scenario_id::text scenario from prediction.scenario_set_members where set_id = $1 and removed_at is null`, [SET.id]);
const addMember = async (branch, label) => {
  if ((await membersOf()).some((m) => m.branch === branch.id)) { note(`the member ${label} stands — an earlier run`); return null; }
  const r = await st(weber, `${SET.id}/members/add`, 'prediction.scenario.set.member', 'SCS', { scenarioId: EVERY.id, branchId: branch.id }, SET.id);
  if (!r.ok) { fail(`J. Weber adds ${label}`, r); return null; }
  const c = r.body.membership.check;
  ok(`J. Weber ADDED the branch ${label} (${branch.kind}${branch.kind_label ? ` “${branch.kind_label}”` : ''}) → set v${r.body.membership.set?.version}${c ? `; the check ${c.outcome.toUpperCase()} (missing ${JSON.stringify(c.missing_kinds)}, live ${c.live_branches}, gap items closed ${c.gap_items_closed ?? 0})` : ''}`);
  return r.body.membership;
};
if (!Object.values(B).some((x) => x === null)) {
  if (SET) note(`the set ${short(SET.id)} "${SET_TITLE}" stands (${SET.state}, v${SET.version}, last check ${SET.last_check_outcome ?? '—'}) — an earlier run`);
  else {
    const r = await st(weber, 'declare', 'prediction.scenario.set.declare', 'SCS', { title: SET_TITLE, purpose: 'the corridor scenarios the Regensburg supply decision is weighed against — it is not recommended until a stress branch is in the set (SYNTHETIC)',
      policy: { require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 } });
    if (!r.ok) fail('J. Weber declares the set', r);
    else { SET = { id: r.body.set.set_id, state: 'draft', version: r.body.set.version }; ok(`J. Weber DECLARED the set ${short(SET.id)} "${SET_TITLE}" (draft v${SET.version}, owner J. Weber) — the policy requires baseline + stress, at least 3 branches, at least 1 adverse`); }
  }
}
let PKG = null;
if (SET) {
  await addMember(B.baseline, '"Baseline"'); await addMember(B.disruption, '"Disruption"'); await addMember(B.blockade, '"Blockade"');
  SET = (await q(`select set_id::text id, state, version, last_check_outcome from prediction.scenario_sets where set_id = $1`, [SET.id]))[0];
  if (SET.state === 'draft') {
    const r = await st(weber, `${SET.id}/activate`, 'prediction.scenario.set.activate', 'SCS', {}, SET.id);
    if (!r.ok) fail('J. Weber activates the set', r);
    else { const c = r.body.transition.check; (c?.outcome === 'failed' && (c.missing_kinds ?? []).includes('stress') ? ok : bad)(`J. Weber ACTIVATED the set → the plurality check ${String(c?.outcome).toUpperCase()}: missing ${JSON.stringify(c?.missing_kinds)} (live ${c?.live_branches}, adverse ${c?.adverse_branches}); new gap ${c?.new_gap}`); }
  } else note(`the set is ${SET.state} — an earlier run`);
  const gaps = await itemsOf('scenario.set_gap', SET.id);
  (gaps.length > 0 && gaps[0].owner === weber.principalId ? ok : bad)(`THE FLAG: the set-gap item ${gaps[0] ? `${short(gaps[0].id)} "${String(gaps[0].title).slice(0, 90)}" → ${gaps[0].state}, owner ${nm(gaps[0].owner)}` : 'ABSENT'} (${gaps.length} item(s) on the set)`);
  // THE PACKAGE: a COMMITTED package cannot be bound (why the act drafts a fresh one)
  const bindingOf = async (pkg) => (await q(`select binding_id::text id from decision.package_scenario_sets where set_id = $1 and package_id = $2 limit 1`, [SET.id, pkg]))[0] ?? null;
  if (!(await bindingOf(JAN.pkg))) expectRefused(`L. Brandt binds the set to the ${JAN.state} January package`, await st(brandt, `${SET.id}/bind`, 'prediction.scenario.set.bind', 'SCS', { packageId: JAN.pkg }, SET.id), 409, /^scenario set rejected/);
  PKG = (await q(`select package_id::text id, state, current_version v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PKG_TITLE]))[0] ?? null;
  if (PKG) note(`the package ${short(PKG.id)} "${PKG_TITLE}" stands (${PKG.state}, v${PKG.v}) — an earlier run`);
  else {
    const d = await dc(brandt, 'declare', 'decision.package.declare', 'DPK', { decisionObjectId: JAN.dec, title: PKG_TITLE, statement: 'whether to dual-source the magnets for the Regensburg line, weighed against the corridor scenario set (SYNTHETIC)', owner: brandt.principalId });
    if (!d.ok) fail('L. Brandt declares the package', d);
    else {
      const id = d.body.package.packageId;
      const o = await dc(brandt, `${id}/versions/open`, 'decision.package.version', 'DPK', { knownAt: await dbNow(), observedThrough: null }, id);
      if (!o.ok) fail('L. Brandt opens version 1', o);
      else {
        const v = o.body.version.version;
        const steps = [
          await dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'status-quo', title: 'Hold the booked routing and the single magnet source', kind: 'status_quo', consequences: [{ kind: 'run', id: PAIR.control, version: 1 }], risks: [], opportunities: [] }, id),
          await dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'dual-source', title: 'Dual-source the magnets and reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: PAIR.intervention, version: 1 }], risks: ['the qualification of a second source takes a quarter'], opportunities: [] }, id),
          await dc(brandt, `${id}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
            monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }], reversibility: 'reversible until the first purchase order is placed', informationValue: 'the scenario set, not a single forecast, bounds the choice' }, id),
          await dc(brandt, `${id}/versions/${v}/choice`, 'decision.package.choice', 'DPK', { option_key: 'dual-source', rationale: 'Across the corridor scenarios dual-sourcing loses least; the status quo fails badly under a regional blockade (SYNTHETIC).', decision_deadline: '2027-01-15',
            accepted_trade_offs: ['the qualification cost of a second magnet source'], action_owner: brandt.principalId,
            outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: PAIR.twin, period: { from: '2024-01-11', to: '2024-04-10' } }] }, id),
        ];
        const b1 = steps.find((x) => !x.ok);
        if (b1) fail('L. Brandt drafts the package', b1);
        else { PKG = { id, state: 'draft', v }; ok(`L. Brandt DECLARED the FRESH package ${short(id)} "${PKG_TITLE}" on the January Regensburg decision and DRAFTED version ${v}: status-quo vs dual-source (the runs ${short(PAIR.control)} / ${short(PAIR.intervention)}), the choice dual-source, approver S. Okafor`); }
      }
    }
  }
  if (PKG) {
    if (await bindingOf(PKG.id)) note('the set is bound to the package — an earlier run');
    else {
      expectRefused('J. Weber (not the package owner) binds the set', await st(weber, `${SET.id}/bind`, 'prediction.scenario.set.bind', 'SCS', { packageId: PKG.id }, SET.id), 403, /^scenario set rejected \(authority\)/);
      const r = await st(brandt, `${SET.id}/bind`, 'prediction.scenario.set.bind', 'SCS', { packageId: PKG.id }, SET.id);
      if (!r.ok) fail('L. Brandt binds the set', r); else ok(`L. Brandt BOUND the set to the package (the package's owner) — the binding's check ${String(r.body.binding.check?.outcome).toUpperCase()}, missing ${JSON.stringify(r.body.binding.check?.missing_kinds)}`);
    }
    const vstate = async () => (await q(`select state from decision.package_versions where package_id = $1 and version = $2`, [PKG.id, PKG.v]))[0]?.state;
    const hasStress = (await membersOf()).some((m) => m.branch === B.stress.id);
    if ((await vstate()) === 'draft' && !hasStress) {
      const r = await dc(brandt, `${PKG.id}/versions/${PKG.v}/propose`, 'decision.package.propose', 'DPK', {}, PKG.id);
      expectRefused('L. Brandt PROPOSES the recommendation while the set lacks a stress branch', r, 409, /^recommendation rejected \(plurality\):.*stress/);
      note(`the version stays ${await vstate()}; no version.proposed recorded (${(await q(`select count(*)::int n from decision.package_events where package_id = $1 and event = 'version.proposed'`, [PKG.id]))[0].n})`);
    } else note(`the plurality refusal was staged by an earlier run (the version is ${await vstate()}, stress member ${hasStress})`);
    // THE RECOVERY: the scenario's STRESS branch joins → the check passes → the gap item closes → the proposal goes through
    await addMember(B.stress, '"Stress"');
    const gaps2 = await itemsOf('scenario.set_gap', SET.id);
    (gaps2.length > 0 && gaps2.every((g) => g.state === 'closed') ? ok : bad)(`the set-gap item${gaps2.length > 1 ? 's' : ''} ${gaps2.map((g) => `${short(g.id)} ${g.state}`).join(', ')} — the flag cleared by the stress branch's arrival`);
    if ((await vstate()) === 'draft') {
      const r = await dc(brandt, `${PKG.id}/versions/${PKG.v}/propose`, 'decision.package.propose', 'DPK', {}, PKG.id);
      if (!r.ok) fail('L. Brandt proposes once the set is plural', r); else ok(`L. Brandt PROPOSED version ${PKG.v} — the set is plural; digest ${String(r.body.proposal?.versionDigest).slice(0, 12)}… → ${await vstate()}`);
    } else note(`the version is ${await vstate()} — an earlier run`);
    const sr = (await q(`select state, version, last_check_outcome from prediction.scenario_sets where set_id = $1`, [SET.id]))[0];
    const checks = await q(`select trigger, outcome from prediction.scenario_set_checks where set_id = $1 order by as_of`, [SET.id]);
    (sr.last_check_outcome === 'passed' ? ok : bad)(`the set: ${sr.state} v${sr.version}, last check ${sr.last_check_outcome}; the recorded checks ${checks.map((c) => `${c.trigger}:${c.outcome}`).join(' → ')}`);
  }
  // THE COMPARISON (CAP-DS-02): L. Brandt, side by side
  const cmp = await st(brandt, `${SET.id}/compare`, 'prediction.scenario.set.read', 'SCS', {}, SET.id, READ);
  let LIVE = [];
  if (!cmp.ok) fail('L. Brandt compares the set', cmp);
  else {
    const c = cmp.body.comparison; LIVE = (c.branches ?? []).filter((b) => b.live);
    ok(`L. Brandt COMPARED the set side by side (plurality ${c.plurality?.passed ? 'PASSED' : 'FAILED'}, stale after ${c.stale_after_days} days):`);
    for (const b of c.branches ?? []) console.log(`      ${b.name.padEnd(12)} ${String(b.kind).padEnd(13)} ${(b.kind_label ? `“${b.kind_label}”` : '').padEnd(20)} ${String(b.state).padEnd(9)} live ${String(b.live).padEnd(5)} ${String(b.consequence_class ?? '—').padEnd(3)} signpost ${b.indicator ? `${b.indicator.comparator} ${b.indicator.threshold} (${b.indicator.freshness})` : 'none'} — ${String(b.divergence ?? b.statement ?? '').slice(0, 60)}`);
  }
  // THE PORTFOLIO REVIEW: M. Dvořák weighs the bound package's options across the live branches (SYNTHETIC EUR k)
  const reviews = await q(`select review_id::text id, most_robust, least_regret, regret from prediction.portfolio_reviews where set_id = $1 order by reviewed_at desc`, [SET.id]);
  if (reviews.length > 0) note(`the portfolio review ${short(reviews[0].id)} stands (most robust ${reviews[0].most_robust.join(', ')}, least regret ${reviews[0].least_regret.join(', ')}) — an earlier run`);
  else if (LIVE.length > 0 && PKG) {
    const pay = (key, b) => { const adverse = ['disruption', 'downside', 'stress', 'adversarial', 'user-defined'].includes(b.kind);
      if (key === 'dual-source') return adverse ? -45 : -60; return adverse ? (b.kind === 'user-defined' ? -320 : b.kind === 'stress' ? -240 : -130) : 0; };
    const payoffs = Object.fromEntries(['dual-source', 'status-quo'].map((k) => [k, Object.fromEntries(LIVE.map((b) => [b.branch_id, pay(k, b)]))]));
    const members = (await membersOf()).map((m) => ({ member_id: m.id, relevance: m.branch === B.baseline.id ? 'medium' : 'high', consequence: 'C3' }));
    const r = await st(dvorak, `${SET.id}/review`, 'prediction.scenario.set.review', 'SCS', { members, payoffs, unit: 'EUR k', note: 'dual-sourcing is the robust choice across the corridor branches; the status quo regrets most under the regional blockade (SYNTHETIC payoffs)' }, SET.id);
    if (!r.ok) fail('M. Dvořák records the portfolio review', r);
    else { const v = r.body.review; ok(`M. Dvořák RECORDED the portfolio review ${short(v.review_id)} of package v${v.package_version}: robustness ${JSON.stringify(v.robustness)}, max regret ${JSON.stringify(v.regret)} → most robust ${v.most_robust.join(', ')}, least regret ${v.least_regret.join(', ')} (computed by the port; SYNTHETIC EUR k)`); }
  }
  // LIVING SCENARIOS: the tick step scenario-relevance (67) scores the members of the ACTIVE set — the act WAITS for the scheduled tick
  const act = (await q(`select activated_at from prediction.scenario_sets where set_id = $1`, [SET.id]))[0]?.activated_at ?? null;
  const rel = await waitFor('the tick\'s relevance score of the set\'s scenario', async () => (await q(`select score, trigger, scored_at, basis from prediction.scenario_relevance where scenario_id = $1 and trigger = 'tick' and ($2::timestamptz is null or scored_at >= $2) order by scored_at desc limit 1`, [EVERY.id, act]))[0] ?? null, (x) => x !== null, 180_000);
  (rel ? ok : bad)(`THE TICK (scenario-relevance, order 67): ${rel ? `the every-kind scenario scored ${Number(rel.score).toFixed(2)} at ${new Date(rel.scored_at).toISOString().slice(0, 19)}Z (basis ${JSON.stringify(rel.basis).slice(0, 120)})` : 'no tick score arrived'}`);
  const sp = await q(`select a.state, a.owner_principal_id::text owner, b.name from executive.attention_items a join prediction.branches_current b on b.branch_id = a.subject_id where a.tenant_id = $1 and a.domain_id = $2 and a.signal_class = 'scenario.signpost' and b.scenario_id = $3 order by b.name`, [T, D, EVERY.id]);
  note(`the tick's signpost notices on the member scenario (once per breach, to its owner): ${sp.length === 0 ? 'none' : `${sp.length} — ${sp.map((x) => `${x.name} (${x.state}, ${nm(x.owner)})`).join(', ')}`}`);
  // CREATION TRIGGERS: a scenario proposed from the escalated insurer signal; the proposer cannot resolve it; the strategy owner resolves
  let PROP = (await q(`select proposal_id::text id, state, proposed_by::text by from prediction.scenario_proposals where tenant_id = $1 and domain_id = $2 and kind = 'weak_signal' and source_key = $3 order by proposed_at desc limit 1`, [T, D, SIGNAL.id]))[0] ?? null;
  if (PROP) note(`the proposal ${short(PROP.id)} from the insurer signal stands (${PROP.state}) — an earlier run`);
  else {
    const r = await st(eriksen, 'proposals/propose', 'prediction.scenario.proposal.propose', 'SCP', { kind: 'weak_signal', source: { signal_id: SIGNAL.id }, title: 'War-risk cover withdrawn across the corridor',
      rationale: 'an escalated weak signal reports a second insurer withdrawing war-risk cover; the portfolio carries no scenario in which cover is gone corridor-wide (SYNTHETIC)' });
    if (!r.ok) fail('N. Eriksen proposes a scenario', r);
    else { PROP = { id: r.body.proposal.proposal_id, state: 'open', by: eriksen.principalId }; ok(`N. Eriksen PROPOSED the scenario "War-risk cover withdrawn across the corridor" from the escalated signal ${short(SIGNAL.id)} — ${short(PROP.id)} open, routed to the strategy owners (facts ${JSON.stringify(r.body.proposal.source_facts ?? {}).slice(0, 90)})`); }
  }
  if (PROP && PROP.state === 'open') {
    expectRefused('N. Eriksen (the proposer; a forecast owner holds no resolve rule) resolves her own proposal', await st(eriksen, `proposals/${PROP.id}/resolve`, 'prediction.scenario.proposal.resolve', 'SCP', { resolution: 'accepted', note: 'resolving my own proposal (SYNTHETIC)' }, PROP.id), 403);
    const r = await st(weber, `proposals/${PROP.id}/resolve`, 'prediction.scenario.proposal.resolve', 'SCP', { resolution: 'accepted', note: 'accepted: a corridor-wide cover withdrawal scenario is owed; its owner declares it through the scenario route (SYNTHETIC)' }, PROP.id);
    if (!r.ok) fail('J. Weber resolves the proposal', r); else ok(`J. Weber RESOLVED the proposal → ${r.body.proposal.state} (accepting declares nothing: the scenario is declared by its owner through the scenario route)`);
  } else if (PROP) note(`the proposal is ${PROP.state} — an earlier run`);
}
ENV_OUT.EYE_B27_SETS_TITLE = 'Regensburg supply'; ENV_OUT.EYE_B27_SETS_DECIDER = 'l.brandt'; ENV_OUT.EYE_B27_SETS_OWNER = 'j.weber';

/* ── B27-Q THE QUALITY (stage scene 3) ───────────────────────────────────────────────── */
console.log('\nB27-Q THE QUALITY — two corridor branches that differ only in wording FAIL distinctiveness; the missing freight-rate signpost named; governed probabilities');
const qu = (s, path, action, objectType, payload, objectId = null, extra = {}) => pd(s, `${QU}/${path}`, action, objectType, payload, objectId, extra);
const FR_KEY = 'freight-rate:red-sea-container-spot';
const FR_DESC = 'B27 signpost: Red Sea container spot freight above 4,000 USD per FEU for two consecutive weekly prints (SYNTHETIC series)';
const Q_TITLE = 'Bab el-Mandeb freight exposure (SYNTHETIC)';
{
  const had = (await q(`select series_key from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = $3`, [T, D, FR_KEY]))[0] ?? null;
  if (had) note(`the series ${FR_KEY} stands — an earlier run`);
  else {
    const r = await pd(eriksen, 'series/register', 'prediction.series.register', 'SER', { seriesKey: FR_KEY, sourceKey: 'freight-rate-synthetic', parserRef: 'arcgis-feature-attribute@1', valueField: 'rate_usd_feu', unit: 'USD per FEU', seasonalityDays: 7,
      description: 'Red Sea container spot freight rate, weekly (SYNTHETIC — registered for the B27 demonstration; no source feeds it)' });
    if (!r.ok) fail('N. Eriksen registers the freight-rate series', r); else ok(`N. Eriksen REGISTERED the SYNTHETIC series ${FR_KEY} (weekly, USD per FEU) — the demonstration had no freight-rate series and no source feeds this one: said`);
  }
}
let FR = (await q(`select indicator_id::text id, state from prediction.indicators_current where tenant_id = $1 and domain_id = $2 and description = $3 limit 1`, [T, D, FR_DESC]))[0] ?? null;
if (FR) note(`the freight-rate signpost ${short(FR.id)} stands (${FR.state}) — an earlier run`);
else {
  const r = await pd(weber, 'indicators/define', 'prediction.indicator.define', 'IND', { seriesKey: FR_KEY, description: FR_DESC, comparator: '>', threshold: 4000, consecutiveDays: 2, owner: weber.principalId });
  if (!r.ok) fail('J. Weber defines the freight-rate signpost', r); else { FR = { id: r.body.indicator.indicatorId, state: 'active' }; ok(`J. Weber DEFINED the freight-rate signpost ${short(FR.id)} on ${FR_KEY} (> 4,000 for two weekly prints)`); }
}
let Q_SCN = (await q(`select scenario_id::text id, current_version from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, Q_TITLE]))[0] ?? null;
if (Q_SCN) note(`the scenario ${short(Q_SCN.id)} "${Q_TITLE}" stands (v${Q_SCN.current_version}) — an earlier run`);
else if (FR && FR.state !== 'retired') {
  const r = await pd(weber, 'scenarios/declare', 'prediction.scenario.declare', 'SCN', { title: Q_TITLE, statement: 'what the Bab el-Mandeb corridor does to NORDWERK\'s freight cost over the next quarter (SYNTHETIC)', forecastId: FCT.id, owner: weber.principalId, reviewCadence: 'weekly',
    branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'freight rates hold near their current band (SYNTHETIC)', owner: weber.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Freight-rate spike', kind: 'upside', statement: 'spot freight rates spike above 4,000 USD per FEU (SYNTHETIC)', indicatorId: FR.id, owner: weber.principalId, consequence: 'lock the contract rates for the quarter', responseWindowHours: 48 },
    ] });
  if (!r.ok) fail('J. Weber declares the freight exposure scenario', r); else { Q_SCN = { id: r.body.scenario.scenarioId, current_version: 1 }; ok(`J. Weber DECLARED "${Q_TITLE}" ${short(Q_SCN.id)}: Baseline and the upside "Freight-rate spike" on the freight-rate signpost`); }
}
if (Q_SCN) {
  const common = { indicatorId: TRANSIT.id, divergence: 'the strait closes to merchant traffic (SYNTHETIC)', assumptions: [{ statement: 'naval activity halts transits' }], owner: weber.principalId, consequence: 'reroute every open booking via the Cape', responseWindowHours: 24 };
  for (const [key, branch] of [
    ['b27q-strait-closure', { name: 'Strait closure', kind: 'disruption', statement: 'Strait closure: transits halt for seven days', ...common }],
    ['b27q-strait-shutdown', { name: 'Strait shutdown', kind: 'user_defined', kindLabel: 'strait shutdown', statement: 'Strait closure — transits halted for seven days.', ...common }],
  ]) {
    if ((await branchesOf(Q_SCN.id)).some((b) => b.name === branch.name)) { note(`the branch "${branch.name}" stands — an earlier run`); continue; }
    const cur = Number((await q(`select current_version from prediction.scenarios_current where scenario_id = $1`, [Q_SCN.id]))[0].current_version);
    const r = await pd(weber, `scenarios/${Q_SCN.id}/branches`, 'prediction.scenario.branch', 'SCN', { expected_version: cur, idempotency_key: key, branch }, Q_SCN.id);
    if (!r.ok) fail(`J. Weber branches "${branch.name}"`, r); else ok(`J. Weber ADDED "${branch.name}" (${branch.kind}${branch.kindLabel ? ` “${branch.kindLabel}”` : ''}) through BranchScenario: v${cur} → v${r.body.branching.version}; the v1 coherence check ${r.body.branching.coherence?.outcome ?? '—'} (it pairs KINDS, not wording)`);
  }
  // the freight-rate signpost RETIRED through the governed route → its branch's signpost is MISSING
  FR = (await q(`select indicator_id::text id, state from prediction.indicators_current where indicator_id = $1`, [FR.id]))[0];
  if (FR.state === 'retired') note('the freight-rate signpost is retired — an earlier run');
  else {
    const r = await pd(weber, `indicators/${FR.id}/retire`, 'prediction.indicator.retire', 'IND', { reason: 'the synthetic freight-rate feed was never contracted; the signpost is withdrawn (SYNTHETIC)' }, FR.id);
    if (!r.ok) fail('J. Weber retires the freight-rate signpost', r); else ok(`J. Weber RETIRED the freight-rate signpost ${short(FR.id)} (a reasoned, governed act)`);
  }
  // THE EVALUATION
  let EVAL = (await q(`select evaluation_id::text id, outcome, findings, trigger from prediction.scenario_quality_evaluations where scenario_id = $1 order by evaluated_at desc limit 1`, [Q_SCN.id]))[0] ?? null;
  const failsOf = (e) => (e.findings ?? []).filter((f) => f.outcome === 'fail').map((f) => f.rule);
  if (EVAL && failsOf(EVAL).includes('indistinct_branches')) note(`the evaluation ${short(EVAL.id)} stands (${EVAL.outcome}: ${failsOf(EVAL).join(', ')}) — an earlier run`);
  else {
    const r = await qu(weber, `${Q_SCN.id}/evaluate`, 'prediction.scenario.quality.evaluate', 'SCN', { trigger: 'operator' }, Q_SCN.id);
    if (!r.ok) fail('J. Weber evaluates the quality', r);
    else { EVAL = { id: r.body.evaluation.evaluation_id, outcome: r.body.evaluation.outcome, findings: r.body.evaluation.findings }; ok(`J. Weber EVALUATED the quality (rule v${r.body.evaluation.rule_version ?? '1'}) → ${String(EVAL.outcome).toUpperCase()}; new failure ${r.body.evaluation.new_failure}`); }
  }
  if (EVAL) {
    const f = (EVAL.findings ?? []).find((x) => x.rule === 'indistinct_branches');
    (f ? ok : bad)(`THE DISTINCTIVENESS: ${f ? `FAIL — ${String(f.detail).slice(0, 200)}` : 'indistinct_branches did NOT fail'}`);
    const m = (EVAL.findings ?? []).find((x) => x.rule === 'indicator_missing');
    (m ? ok : bad)(`THE MISSING SIGNPOST: ${m ? `FAIL — ${String(m.detail).slice(0, 160)}` : 'indicator_missing did NOT fail'}`);
    note(`every finding: ${(EVAL.findings ?? []).map((x) => `${x.rule}:${x.outcome}`).join(', ')}`);
  }
  const qi = await itemsOf('scenario.quality', Q_SCN.id);
  (qi.length > 0 && qi[0].owner === weber.principalId ? ok : bad)(`THE TASK: ${qi[0] ? `${short(qi[0].id)} "${String(qi[0].title).slice(0, 90)}" → ${qi[0].state}, owner ${nm(qi[0].owner)}` : 'ABSENT'}`);
  // THE MAP and THE PROBABILITIES (a named human, a method and its basis; never the narrative)
  const MAP_NAME = 'Corridor incident frequency (SYNTHETIC)';
  let MAP = (await q(`select map_id::text id, version from prediction.frequency_probability_maps where tenant_id = $1 and domain_id = $2 and name = $3 and state = 'active' limit 1`, [T, D, MAP_NAME]))[0] ?? null;
  if (MAP) note(`the map "${MAP_NAME}" v${MAP.version} stands — an earlier run`);
  else {
    const bands = [
      { frequency_label: 'rare', min_per_year: 0, max_per_year: 0.2, probability_low: 0, probability_high: 0.05 },
      { frequency_label: 'occasional', min_per_year: 0.2, max_per_year: 1, probability_low: 0.05, probability_high: 0.25 },
      { frequency_label: 'frequent', min_per_year: 1, max_per_year: 5, probability_low: 0.25, probability_high: 0.6 },
      { frequency_label: 'very frequent', min_per_year: 5, max_per_year: null, probability_low: 0.6, probability_high: 0.9 },
    ];
    const r = await qu(weber, 'maps/declare', 'prediction.scenario.probability.map', 'FPM', { name: MAP_NAME, horizon: 'the next 12 months', bands });
    if (!r.ok) fail('J. Weber declares the frequency map', r); else { MAP = { id: r.body.map.map_id, version: r.body.map.version }; ok(`J. Weber DECLARED the frequency-to-probability map "${MAP_NAME}" v${MAP.version}: rare / occasional / frequent / very frequent (SYNTHETIC bands)`); }
  }
  const QB = await branchesOf(Q_SCN.id);
  const probOf = async (branch) => (await q(`select method, probability_low, probability_high from prediction.branch_probabilities_current where branch_id = $1`, [branch]))[0] ?? null;
  const closure = QB.find((b) => b.name === 'Strait closure'); const spike = QB.find((b) => b.name === 'Freight-rate spike');
  const elicitation = { elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'], question: 'will spot freight on the corridor exceed 4,000 USD per FEU within the quarter?', elicited_at: '2026-09-30T10:00:00Z',
    record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)' } };
  if (closure && MAP) {
    const had = await probOf(closure.id);
    if (had) note(`the probability of "Strait closure" stands (${had.method} ${had.probability_low}–${had.probability_high}) — an earlier run`);
    else {
      const r = await qu(weber, `branches/${closure.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'frequency_map', mapId: MAP.id, basis: { frequency_per_year: 0.5, observation: 'the corridor incident log 2015–2024 (SYNTHETIC)' } }, closure.id);
      if (!r.ok) fail('J. Weber sets the closure probability by the map', r); else ok(`J. Weber SET "Strait closure" by the FREQUENCY MAP: 0.5 incidents a year → ${r.body.probability.probability_low}–${r.body.probability.probability_high} (band computed by the port)`);
    }
  }
  if (spike) {
    expectRefused('J. Weber sets a probability on a NARRATIVE basis', await qu(weber, `branches/${spike.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: { narrative: 'the branch statement reads as likely' } }, spike.id), 422, /^branch probability rejected \(narrative\)/);
    expectRefused('A. Hoffmann (domain_analyst) sets a probability', await qu(hoffmann, `branches/${spike.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: elicitation }, spike.id), 403);
    const had = await probOf(spike.id);
    if (had) note(`the probability of "Freight-rate spike" stands (${had.method} ${had.probability_low}–${had.probability_high}) — an earlier run`);
    else {
      const r = await qu(weber, `branches/${spike.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: elicitation }, spike.id);
      if (!r.ok) fail('J. Weber sets the spike probability by elicitation', r); else ok(`J. Weber SET "Freight-rate spike" by EXPERT ELICITATION: 0.10–0.20 (two experts, the recorded session — SYNTHETIC)`);
    }
  }
  const rd = await qu(hoffmann, `${Q_SCN.id}/read`, 'prediction.scenario.quality.read', 'SCN', {}, Q_SCN.id, READ);
  if (!rd.ok) fail('A. Hoffmann reads the quality', rd);
  else {
    const v = rd.body; const da = v.decision_active;
    ok(`A. Hoffmann READ the quality: decision-active ${JSON.stringify(da).slice(0, 180)}; probabilities ${(v.branches ?? []).filter((b) => b.probability).map((b) => `${b.name} ${b.probability.method} ${b.probability.probability_low ?? b.probability.low}–${b.probability.probability_high ?? b.probability.high}`).join('; ')}; the lows sum ${JSON.stringify(v.probability_sum ?? {}).slice(0, 80)}`);
  }
}
ENV_OUT.EYE_B27_QUALITY_OWNER = 'j.weber'; ENV_OUT.EYE_B27_QUALITY_READER = 'a.hoffmann'; ENV_OUT.EYE_B27_QUALITY_SCENARIO_TITLE = 'Bab el-Mandeb freight exposure';

/* ── B27-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB27-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from prediction.scenario_elements where tenant_id = $1 and domain_id = $2)::int elements,
                             (select count(*) from prediction.scenario_assumptions where tenant_id = $1 and domain_id = $2 and state = 'linked')::int links,
                             (select count(*) from prediction.scenario_records where tenant_id = $1 and domain_id = $2)::int records,
                             (select count(*) from prediction.branches_current where tenant_id = $1 and domain_id = $2 and state = 'suspended')::int suspended,
                             (select count(*) from prediction.scenario_sets where tenant_id = $1 and domain_id = $2)::int sets,
                             (select count(*) from prediction.scenario_set_checks where tenant_id = $1 and domain_id = $2)::int checks,
                             (select count(*) from decision.package_scenario_sets where tenant_id = $1 and domain_id = $2)::int bindings,
                             (select count(*) from prediction.portfolio_reviews where tenant_id = $1 and domain_id = $2)::int reviews,
                             (select count(*) from prediction.scenario_relevance where tenant_id = $1 and domain_id = $2)::int relevance,
                             (select count(*) from prediction.scenario_proposals where tenant_id = $1 and domain_id = $2)::int proposals,
                             (select count(*) from prediction.scenario_quality_evaluations where tenant_id = $1 and domain_id = $2)::int evaluations,
                             (select count(*) from prediction.frequency_probability_maps where tenant_id = $1 and domain_id = $2)::int maps,
                             (select count(*) from prediction.branch_probabilities where tenant_id = $1 and domain_id = $2)::int probabilities,
                             (select count(*) from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class like 'scenario.%' and signal_class <> 'scenario.attention')::int items`, [T, D]))[0];
  note(`in the ledgers: ${n.elements} anatomy elements, ${n.links} linked assumptions, ${n.records} records, ${n.suspended} suspended branch(es); ${n.sets} set(s), ${n.checks} plurality checks, ${n.bindings} binding(s), ${n.reviews} portfolio review(s), ${n.relevance} relevance scores, ${n.proposals} proposal(s); ${n.evaluations} quality evaluation(s), ${n.maps} map version(s), ${n.probabilities} probability row(s); ${n.items} B27 attention items`);
  console.log('  the env lines for the walks:');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said: EVERY FIGURE IS SYNTHETIC — the anatomy\'s drivers, actor, mechanism, intervention and impact, the records, the insurer assumption and its invalidation, the portfolio payoffs (EUR k), the frequency map\'s bands, the incident frequency and the expert elicitation are the personas\' own statements for the demonstration, not measurements; the freight-rate series freight-rate:red-sea-container-spot is REGISTERED with no source behind it (no freight-rate provider; its signpost is defined and retired unobserved); the transit signpost rests on the real PortWatch series key but is never evaluated by this act; the set\'s scenario is the every-kind corridor scenario of the earlier acts (its branches by N. Eriksen), not a new one; the recommendation proposed is a FRESH package by L. Brandt on the January Regensburg decision (both standing Regensburg packages are committed and a set does not bind a committed package — the refusal staged); the anatomy scene is LEFT SUSPENDED (the walk reads that stage; the reinstatement is refused while the assumption stays invalidated); the relevance score is the attention agent\'s REAL scheduled tick (waited for, not driven). NOT STAGED (HARNESS-PROVEN): anatomy — element revision and retirement (refused while another rests on it), the claim and indicator conditions, the run refused on a suspended branch (a twin run the demonstration would have to open), the recovery (re-verify → reinstate → item closed → run admitted), a flipped branch suspended by a person returning to flipped, a scenario-wide critical link suspending every live branch, unlink, record supersession (phase6-anatomy-b27 A–E); sets — member removal, the set retirement refused while bound, the unbound package unaffected, the forecast-shift, risk and planning-cycle proposals (the demonstration holds no superseded forecast), relevance signposts notified once per breach (phase6-sets-b27 a–f); quality — collapse, prohibited contradictions, temporal order, the stale signpost (a stated superuser move of last_observation_at), review timeliness, the model method, the map superseded, the sum > 1 and non-owner refusals, withdrawal, the tick\'s re-evaluation (phase6-quality-b27 a–e). Nothing is cleaned: every object stands as a demonstration fact.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
