#!/usr/bin/env node
/**
 * CP-6 batch B31 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): SIMULATION RUN
 * ORCHESTRATION, IMPACT ANALYSIS AND SIMULATION VALIDITY (migration 0099; F-P5-06 / F-P5-07 / F-P5-09) — exercised by the personas through
 * the REAL HTTP path, each scene stating the effect it produced in the ledgers, and where nothing happened, saying so. EVERY OBJECT IS
 * LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and says "stands — an earlier run" instead
 * of writing it twice. No clock is moved; nothing is planted: every row is a persona's governed act or the schedule's (the attention agent's
 * tick, every 60 s on the demonstration — its after-tick hook `simulation-experiments` executes the experiment chunks; the act WAITS for the
 * ticks, it calls no tick route: there is none outside the test runtime).
 *
 *   B31-0 THE STATE: 0099 applied; the casting read from identity.role_bindings (no persona created, no role granted: T. Nakamura holds
 *         twin_owner — every route the act casts him in admits it — not simulation_operator, said); the attention agent and its cadence; the
 *         inputs (the corridor twin and its newest admitted version, the "Bab el-Mandeb … recovery and deterioration" scenario's flipped
 *         Downside and open Baseline, act-b29's links corridor → Regensburg process twin → enterprise twin, the January Regensburg decision,
 *         L. Brandt's B27 Regensburg package, the B27 frequency map).
 *   B31-O ORCHESTRATION (F-P5-06): T. Nakamura declares "Corridor closure — 5,000 paths" (500-path chunks, seed 31, five chunks a tick) on
 *         the flipped Downside with the shock; a budget below the paths REFUSED; his own approval REFUSED (separation of duties); J. Weber
 *         APPROVES the budget by its digest (the request closes); started → the run opened (seeded, 5,000 samples) and bound; the act WAITS
 *         for the tick that runs five chunks (checkpoint 5, 2,500 paths) and PAUSES it ("halfway review"); the next tick runs NOTHING; an
 *         analyst's resumption REFUSED (PDP); RESUMED; the next tick COMPLETES it — ten chained checkpoints, the manifest, the run completed,
 *         SimulationCompleted under the worker's action. THE PARTIAL: a second experiment with a ONE-SECOND wall budget → budget_exceeded →
 *         the run PARTIAL with its declaration, DIAGNOSTIC by the validity read.
 *   B31-I IMPACT (F-P5-07): T. Nakamura's seeded control of the corridor closure (500 samples, the lead-time jitter, the flipped Downside,
 *         90 days); its SENSITIVITY (total_cost ±20 %, the tornado ranked by swing, robustness across seeds 11/12/13); its SECOND-ORDER
 *         effect over act-b29's links (lost line days → the Regensburg plant's and the enterprise's delivery dates, per percentile, with the
 *         timing); L. Brandt's value of information REFUSED while the branches carry no governed probability; N. Eriksen ELICITS the bands
 *         (Baseline 0.55–0.65, Downside 0.30–0.40; the analyst's elicitation REFUSED); L. Brandt's VOI on his Regensburg package — "one more
 *         week of transit data" → WAIT, the item to L. Brandt; N. Eriksen's PROBABILITY STATEMENT of the run's line stop through the active
 *         frequency map.
 *   B31-V VALIDITY (F-P5-09): L. Brandt (the decision authority) sets the domain's DECISION-USE POLICY (require: true) — it applies to the
 *         domain's LATER proposals and commitments (said in the LIMITS); T. Nakamura's corridor control and reroute; his own promotion
 *         REFUSED, J. Weber PROMOTES the control (DECISION-GRADE); L. Brandt's FRESH package recommending the reroute — its proposal REFUSED
 *         (diagnostic_only: the reroute unpromoted) → J. Weber promotes the reroute → PROPOSED; C. Brenner CHALLENGES the reroute (the opener's
 *         decision REFUSED), J. Weber UPHOLDS it → the run INVALIDATED; the package read shows INPUT INVALIDATED; S. Okafor approves; the
 *         commitment REFUSED `run use rejected (refused)`; N. Eriksen BINDS the flipped Downside to the admitted twin version.
 *   B31-9 THE STATE, the env lines for the walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC (NORDWERK's data is the demonstration's; the payoffs, the likelihoods, the elicitation, the budget are the
 * personas' statements). Nothing prints a credential.
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
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const DC = `${X}/decisions`; const W = `${X}/twins`; const S = `${X}/simulations`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 240)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t;
const tStart = Date.now();
console.log(`THE B31 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
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
const JITTER = { 0: 0.5, 3: 0.3, 7: 0.2 };

/* ── B31-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB31-0 THE STATE — 0099, the casting, the attention agent, the inputs');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0099%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0099 is not applied'); process.exit(1); }
}
const CAST = { 't.nakamura': ['twin_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_authority', 'decision_owner'], 'n.eriksen': ['forecast_owner'],
  'm.dvorak': ['executive'], 's.okafor': ['decision_approver'], 'c.brenner': ['strategy_owner'], 'a.hoffmann': ['domain_analyst'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
  const tn = rows.find((r) => r.login_name === 't.nakamura')?.roles ?? [];
  note(`T. Nakamura holds ${tn.join(', ')}${tn.includes('simulation_operator') ? '' : ' and NOT simulation_operator: every route the act casts him in (simulation.run, the experiment\'s declare / start / pause / resume, the sensitivity and the second-order derivation) admits twin_owner — no role granted, no persona created'}`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const nakamura = await who('t.nakamura'); const weber = await who('j.weber'); const brandt = await who('l.brandt'); const eriksen = await who('n.eriksen');
const dvorak = await who('m.dvorak'); const okafor = await who('s.okafor'); const brenner = await who('c.brenner'); const hoffmann = await who('a.hoffmann');
const NAME = { [nakamura.principalId]: 'T. Nakamura', [weber.principalId]: 'J. Weber', [brandt.principalId]: 'L. Brandt', [eriksen.principalId]: 'N. Eriksen', [dvorak.principalId]: 'M. Dvořák',
  [okafor.principalId]: 'S. Okafor', [brenner.principalId]: 'C. Brenner', [hoffmann.principalId]: 'A. Hoffmann', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose, consequence) => (over) => as(s, scope, { purposeId: purpose, consequence, ...over });
const READ = { sideEffect: 'none' };
/** The B31 routes (/simulations/orchestration|impact|validity) and the twin's simulation routes, under the purpose `simulation` as the harnesses issue them. */
const sim = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${S}/${path}`, env_(s, 'simulation', 'C2')({ action, objectType, objectId, ...extra }), payload, s.token);
const twr = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${W}/${path}`, env_(s, 'simulation', 'C2')({ action, objectType, objectId, ...extra }), payload, s.token);
const pd = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${P}/${path}`, env_(s, 'prediction', 'C2')({ action, objectType, objectId, ...extra }), payload, s.token);
const dc = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${DC}/${path}`, env_(s, 'decision', 'C1')({ action, objectType, objectId, ...extra }), payload, s.token);
/** The package's validity read is a decision read (purpose decision, as the harness issues it). */
const pkgValidity = (s, pkg) => call(`${S}/validity/packages/${pkg}`, env_(s, 'decision', 'C2')({ action: 'simulation.validity.read', objectType: 'DPK', objectId: pkg, sideEffect: 'none' }), {}, s.token);
const useOf = (s, runId) => sim(s, `validity/runs/${runId}/use`, 'simulation.validity.read', 'SIM', {}, runId, READ);

// THE ATTENTION AGENT: the tick's host on this runtime — its scheduled ticks run the experiment chunks (the after-tick hook simulation-experiments)
const AGENT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (AGENT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [AGENT.agent_id]))[0];
  (last.n > 0 ? ok : bad)(`the attention agent ${short(AGENT.agent_id)} (registered in B24) — cadence ${AGENT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${new Date(last.t).toISOString().slice(0, 19)}Z)` : ''} — the experiment chunks run in its after-tick hook simulation-experiments`);
}
// THE INPUTS
const TWIN = (await q(`select twin_id::text id, title from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = 'NORDWERK — Ningbo → Regensburg chain' limit 1`, [T, D]))[0] ?? null;
// the newest admitted, complete version on the actual branch with both cut-offs, none of whose elements cites a withdrawn forecast
const VER = TWIN === null ? null : (await q(`select v.version, v.known_at, v.observed_through from twin.twin_versions v where v.twin_id = $1 and v.state = 'admitted' and v.branch_id = 'actual' and v.completeness = 'complete'
     and v.observed_through is not null and not exists (select 1 from twin.state_elements e, jsonb_array_elements(coalesce(e.citations, '[]'::jsonb)) fc join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid
                                                     where e.twin_id = v.twin_id and e.version = v.version and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn')
   order by v.version desc limit 1`, [TWIN.id]))[0] ?? null;
const SCN_PREFIX = 'Bab el-Mandeb over the next quarter — every scenario kind, recovery and deterioration';
const SCN = (await q(`select scenario_id::text id, title, owner_principal_id::text owner from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and state = 'active' and title like $3 || '%' order by declared_at limit 1`, [T, D, SCN_PREFIX]))[0] ?? null;
const branchesOf = async (scenarioId) => q(`select branch_id::text id, name, kind, state, owner_principal_id::text owner from prediction.branches_current where scenario_id = $1 order by added_at, name`, [scenarioId]);
const SB = SCN === null ? [] : await branchesOf(SCN.id);
const DOWN = SB.find((b) => b.name === 'Downside' && b.state === 'flipped') ?? null;
const BASE = SB.find((b) => b.kind === 'baseline' && b.state === 'open') ?? null;
const PROC = (await q(`select twin_id::text id, title from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = 'Regensburg plant — assembly line (process twin)' limit 1`, [T, D]))[0] ?? null;
const ENT = (await q(`select twin_id::text id, title from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = 'Enterprise twin — NORDWERK' limit 1`, [T, D]))[0] ?? null;
const LINKS = TWIN && PROC && ENT ? await q(`select link_id::text id, upstream_twin_id::text up, downstream_twin_id::text down from twin.twin_links where state = 'live' and ((upstream_twin_id = $1 and downstream_twin_id = $2) or (upstream_twin_id = $2 and downstream_twin_id = $3))`, [TWIN.id, PROC.id, ENT.id]) : [];
const JAN = (await q(`select package_id::text pkg, decision_object_id::text dec, state from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const REG_PKG = (await q(`select package_id::text id, state, current_version v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'Regensburg supply — dual-source against the corridor scenarios (SYNTHETIC)' and owner_principal_id = $3 limit 1`, [T, D, brandt.principalId]))[0] ?? null;
const MAP = (await q(`select map_id::text id, name, version from prediction.frequency_probability_maps where tenant_id = $1 and domain_id = $2 and name = 'Corridor incident frequency (SYNTHETIC)' and state = 'active' order by version desc limit 1`, [T, D]))[0] ?? null;
const OBJ_REG = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
{
  const have = { TWIN: !!TWIN, VER: !!VER, SCN: !!SCN, DOWN: !!DOWN, BASE: !!BASE, PROC: !!PROC, ENT: !!ENT, LINKS: LINKS.length === 2, JAN: !!JAN, REG_PKG: !!REG_PKG, MAP: !!MAP, OBJ_REG: !!OBJ_REG };
  if (Object.values(have).some((x) => !x)) { bad(`an input is missing: ${JSON.stringify(have)}`); process.exit(1); }
  ok(`the inputs: the corridor twin ${short(TWIN.id)} "${TWIN.title}" at its newest admitted version v${VER.version} (known ${new Date(VER.known_at).toISOString().slice(0, 19)}Z, observed through ${new Date(VER.observed_through).toISOString().slice(0, 10)}); the scenario ${short(SCN.id)} "${SCN.title.slice(0, 80)}…" (owner ${nm(SCN.owner)}): Downside ${short(DOWN.id)} FLIPPED, Baseline ${short(BASE.id)} open; the links corridor → ${PROC.title} → ${ENT.title} (act-b29, both live); the January Regensburg decision ${short(JAN.dec)}; L. Brandt's Regensburg package ${short(REG_PKG.id)} (${REG_PKG.state}, v${REG_PKG.v}); the frequency map "${MAP.name}" v${MAP.version}`);
}
const corridorRun = (over) => ({ twinId: TWIN.id, twinVersion: VER.version, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90,
  scenarioId: SCN.id, scenarioBranchId: DOWN.id, ...over });
const itemsOf = (cls, subject) => q(`select item_id::text id, state, owner_principal_id::text owner, route_roles, title, details from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = $3 and subject_id = $4 order by created_at`, [T, D, cls, subject]);
const runRow = async (id) => (await q(`select run_id::text id, state, validity, run_kind, samples, seed, stochastic_mode, promotion_id::text promotion, promoted_for, outputs_digest, partial, outputs -> 'totals' totals,
                                         outputs -> 'stochastic' -> 'summary' summary, operator_principal_id::text operator from simulation.runs_current where run_id = $1`, [id]))[0] ?? null;

/* ── B31-O ORCHESTRATION ─────────────────────────────────────────────────────────────── */
console.log('\nB31-O ORCHESTRATION — a 5,000-path corridor experiment under J. Weber\'s approved budget, checkpointed halfway, paused, resumed, completed with its manifest; a one-second budget → a PARTIAL run');
const OR = 'orchestration';
const EXP_TITLE = 'Corridor closure — 5,000 paths (SYNTHETIC)';
const EXP_QUESTION = 'How many line-stop days does the Bab el-Mandeb closure cost Regensburg across lead-time jitter?';
const expRow = async (title) => (await q(`select experiment_id::text id, state, run_id::text run, progress, budget, approved_by::text approved_by from simulation.experiments where tenant_id = $1 and domain_id = $2 and title = $3 order by declared_at desc limit 1`, [T, D, title]))[0] ?? null;
const expEvents = async (id) => (await q(`select event, details, actor_principal_id::text actor, occurred_at from simulation.experiment_events where experiment_id = $1 order by occurred_at, event_id`, [id]));
const readExp = async (s, id) => { const r = await sim(s, `${OR}/${id}/read`, 'simulation.experiment.read', 'SXP', {}, id, READ); return r.ok ? r.body.experiment : null; };
/** The latest attention tick that started after `mark` and finished — the drain of its after-tick hook. */
const tickAfter = async (mark) => (await q(`select run_id::text id, started_at, finished_at, outcome, outputs -> 'after' -> 'simulation-experiments' drain from executive.agent_runs
                                             where agent_id = $1 and task = 'attention_tick' and started_at > $2 and finished_at is not null order by started_at limit 1`, [AGENT.agent_id, mark]))[0] ?? null;
const declaration = (title, paths, chunkSize, budget, pace) => ({ title, question: EXP_QUESTION, run: corridorRun({}), paths, chunkSize, seed: 31, jitter: JITTER,
  measures: ['total_cost', 'line_stop_days'], budget, pace: { chunks_per_tick: pace } });
/** Declared by T. Nakamura (refused first when asked), approved by J. Weber by the digest it read (the declarer's own approval refused), started. */
async function declaredApprovedStarted(title, decl, { showRefusals }) {
  let e = await expRow(title);
  if (e) note(`the experiment ${short(e.id)} "${title}" stands (${e.state}) — an earlier run`);
  else {
    if (showRefusals) expectRefused('T. Nakamura declares the experiment with a budget below its paths', await sim(nakamura, `${OR}/declare`, 'simulation.experiment.declare', 'SXP', { ...decl, budget: { ...decl.budget, max_paths: 500 } }), 422, /^experiment rejected \(budget\)/);
    const r = await sim(nakamura, `${OR}/declare`, 'simulation.experiment.declare', 'SXP', decl);
    if (!r.ok) { fail(`T. Nakamura declares "${title}"`, r); return null; }
    const x = r.body.experiment;
    ok(`T. Nakamura DECLARED ${short(x.experiment_id)} "${title}": ${x.paths} paths in chunks of ${x.chunk_size}, seed ${x.seed}, the jitter ${JSON.stringify(x.jitter)}, the run ${x.run_intake?.runKind ?? 'control'} on v${x.twin_version} with the shock on the flipped Downside; the budget ${JSON.stringify(x.budget)} (digest ${String(x.budget_digest).slice(0, 12)}…), ${x.pace?.chunks_per_tick} chunk(s) a tick → ${x.state}`);
    const req = await itemsOf('simulation.budget', x.experiment_id);
    note(`the approval request: ${req.map((i) => `${short(i.id)} ${i.state}, routed to ${JSON.stringify(i.route_roles)}`).join('; ') || 'NONE'}`);
    e = await expRow(title);
  }
  if (e.state === 'declared') {
    const x = await readExp(nakamura, e.id);
    if (showRefusals) expectRefused('T. Nakamura (the declarer) approves his own budget', await sim(nakamura, `${OR}/${e.id}/approve`, 'simulation.experiment.approve', 'SXP', { budgetDigest: x.budget_digest, note: 'I approve my own budget (SYNTHETIC)' }, e.id), 403, /^experiment rejected \(separation_of_duties\)/);
    const r = await sim(weber, `${OR}/${e.id}/approve`, 'simulation.experiment.approve', 'SXP', { budgetDigest: x.budget_digest, note: 'the corridor experiment is proportionate to the routing question; the budget is approved as read (SYNTHETIC)' }, e.id);
    if (!r.ok) { fail(`J. Weber approves "${title}"`, r); return null; }
    const req = await itemsOf('simulation.budget', e.id);
    ok(`J. Weber APPROVED the budget by its digest ${String(r.body.experiment.approved_budget_digest).slice(0, 12)}… → ${r.body.experiment.state}; the approval request ${req.map((i) => `${short(i.id)} ${i.state}`).join(', ')}`);
    e = await expRow(title);
  } else if (e.approved_by) note(`the budget was approved by ${nm(e.approved_by)} — an earlier run`);
  if (e.state === 'approved') {
    const mark = await dbNow();
    const r = await sim(nakamura, `${OR}/${e.id}/start`, 'simulation.experiment.start', 'SXP', {}, e.id);
    if (!r.ok) { fail(`T. Nakamura starts "${title}"`, r); return null; }
    const x = r.body.experiment; const run = await runRow(x.run_id);
    ok(`T. Nakamura STARTED it: admitted ${JSON.stringify(x.admission).slice(0, 160)}; the run ${short(x.run_id)} opened through the existing path (${run?.stochastic_mode}, seed ${run?.seed}, ${run?.samples} samples) and bound → ${x.state}`);
    const st = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'SimulationStarted' and created_at >= $1 and payload ->> 'run_id' = $2`, [mark, x.run_id]))[0].n;
    (st === 1 ? ok : bad)(`SimulationStarted in the outbox for the run: ${st}`);
    e = await expRow(title);
  }
  return e;
}

let EXP = await declaredApprovedStarted(EXP_TITLE, declaration(EXP_TITLE, 5000, 500, { max_paths: 5000, max_wall_seconds: 900, max_chunks: 14 }, 5), { showRefusals: true });
if (EXP) {
  const done = (e) => Number(e?.progress?.paths_done ?? 0);
  const evs = async () => (await expEvents(EXP.id)).map((x) => x.event);
  if (EXP.state === 'running' && !(await evs()).includes('paused')) {
    // THE FIRST TICK: five chunks (2,500 paths) — the act waits for it, then pauses at once (the next tick is ~60 s away)
    if (done(EXP) < 2500) EXP = await waitFor('the tick that runs the first five chunks', () => expRow(EXP_TITLE), (e) => done(e) >= 2500 || e.state !== 'running', 150_000, 1000);
    if (done(EXP) === 2500 && EXP.state === 'running') {
      const k = await q(`select seq, chunk_index, paths_done, digest from simulation.experiment_checkpoints where experiment_id = $1 order by seq`, [EXP.id]);
      ok(`THE TICK ran five chunks: ${k.length} checkpoints, the fifth at chunk ${k[4]?.chunk_index} — ${k[4]?.paths_done}/5000 paths (chained digest ${String(k[4]?.digest).slice(0, 12)}…)`);
      const r = await sim(nakamura, `${OR}/${EXP.id}/pause`, 'simulation.experiment.pause', 'SXP', { reason: 'halfway review' }, EXP.id);
      if (!r.ok) fail('T. Nakamura pauses at the halfway checkpoint', r); else ok(`T. Nakamura PAUSED it at the fifth checkpoint ("halfway review") → ${r.body.experiment.state}`);
    } else bad(`the pause missed the halfway checkpoint: ${EXP.state}, ${done(EXP)} paths done`);
    EXP = await expRow(EXP_TITLE);
  } else if ((await evs()).includes('paused')) note('the experiment was paused at the halfway checkpoint — an earlier run');
  if (EXP.state === 'paused') {
    // THE IDLE TICK: the next tick after the pause runs nothing for it
    const mark = await dbNow();
    const t = await waitFor('the next tick after the pause', () => tickAfter(mark), (x) => x !== null, 150_000, 2000);
    const mine = (t?.drain?.steps ?? []).filter((s) => s.experiment_id === EXP.id);
    const after = await expRow(EXP_TITLE);
    (t && mine.length === 0 && done(after) === 2500 ? ok : bad)(`THE PAUSED TICK ${t ? `${short(t.id)} at ${new Date(t.started_at).toISOString().slice(11, 19)}Z` : 'ABSENT'}: ${mine.length} step(s) for the experiment (the drain: ${t?.drain?.chunks ?? '?'} chunk(s) across ${t?.drain?.experiments ?? '?'} experiment(s)); still ${done(after)}/5000 paths`);
    expectRefused('A. Hoffmann (domain_analyst) resumes the experiment', await sim(hoffmann, `${OR}/${EXP.id}/resume`, 'simulation.experiment.resume', 'SXP', { reason: 'an analyst resumes' }, EXP.id), 403);
    const r = await sim(nakamura, `${OR}/${EXP.id}/resume`, 'simulation.experiment.resume', 'SXP', { reason: 'halfway review done: the stability indicators hold' }, EXP.id);
    if (!r.ok) fail('T. Nakamura resumes', r); else ok(`T. Nakamura RESUMED it from the last checkpoint → ${r.body.experiment.state}`);
    EXP = await expRow(EXP_TITLE);
  }
  if (EXP.state === 'running') EXP = await waitFor('the tick that completes the experiment', () => expRow(EXP_TITLE), (e) => e.state !== 'running', 150_000, 2000);
  if (EXP.state === 'completed') {
    const x = await readExp(dvorak, EXP.id);
    if (x === null) bad('M. Dvořák reads the experiment');
    else {
      const run = await runRow(x.run.run_id);
      const ks = x.checkpoints ?? []; const ev = (x.events ?? []).map((e) => e.event);
      ok(`THE EXPERIMENT COMPLETED (read by M. Dvořák, the executive): ${x.budget_use.paths.done}/${x.budget_use.paths.declared} paths; ${x.budget_use.chunk_executions.used} of ${x.budget_use.chunk_executions.approved_max} chunk executions; ${x.budget_use.wall_seconds.used} s of ${x.budget_use.wall_seconds.approved_max} s; ${ks.length} chained checkpoints (head seq ${x.manifest?.checkpoint_head?.seq}, ${String(x.manifest?.checkpoint_head?.digest ?? '').slice(0, 12)}…)`);
      note(`the ledger: ${ev.join(' → ')}`);
      const stab = x.indicators?.numerical_stability ?? {};
      note(`the indicators: ${Object.values(stab).map((s) => `${s.measure} ${String(s.state).toUpperCase()} (mean ${s.mean}, ±${s.ci_half_width}, n ${s.n})`).join('; ')}`);
      (run?.state === 'completed' && run.samples === 5000 ? ok : bad)(`the run ${short(x.run.run_id)} ${run?.state} (${run?.samples} samples, outputs ${String(run?.outputs_digest).slice(0, 12)}… = the manifest's ${String(x.manifest?.outputs_digest).slice(0, 12)}…); line-stop days median ${run?.summary?.line_stop_days?.median ?? '—'} (p10 ${run?.summary?.line_stop_days?.p10 ?? '—'}, p90 ${run?.summary?.line_stop_days?.p90 ?? '—'}) — SYNTHETIC`);
      const sc = (await q(`select payload -> 'cause' c from objects.object_outbox where event_type = 'SimulationCompleted' and payload ->> 'run_id' = $1`, [x.run.run_id]));
      (sc.length === 1 && sc[0].c?.action === 'simulation.experiment.execute' && sc[0].c?.experiment_id === EXP.id ? ok : bad)(`SimulationCompleted: ${sc.length} row(s) — cause ${sc[0]?.c?.action ?? '—'} by ${sc[0]?.c?.actor === AGENT.principal_id ? 'the attention agent' : short(sc[0]?.c?.actor)}, the experiment named`);
      const told = await itemsOf('simulation.experiment', EXP.id);
      note(`the declarer told: ${told.map((i) => `${short(i.id)} "${String(i.title).slice(0, 80)}" → ${nm(i.owner)} (${i.state})`).join('; ') || 'NONE'}`);
    }
  } else bad(`the experiment did not complete: ${EXP.state}, ${done(EXP)} paths`);
}
// THE PARTIAL: a one-second wall budget → budget_exceeded → the run PARTIAL with its declaration, DIAGNOSTIC by the validity read
const PART_TITLE = 'Corridor closure — a one-second budget (SYNTHETIC)';
let PART = await declaredApprovedStarted(PART_TITLE, declaration(PART_TITLE, 2000, 250, { max_paths: 2000, max_wall_seconds: 1, max_chunks: 10 }, 8), { showRefusals: false });
if (PART) {
  if (PART.state === 'running') PART = await waitFor('the tick that exhausts the one-second budget', () => expRow(PART_TITLE), (e) => e.state !== 'running', 150_000, 2000);
  const ev = (await expEvents(PART.id)).map((x) => x.event);
  const run = PART.run ? await runRow(PART.run) : null;
  (PART.state === 'partial' && ev.includes('budget_exceeded') && run?.state === 'partial' ? ok : bad)(`THE PARTIAL: "${PART_TITLE}" → ${PART.state} (${ev.join(' → ')}); the run ${short(PART.run)} ${run?.state}: ${run?.partial ? `${run.partial.reason}, ${run.partial.completed_paths} of ${run.partial.declared_paths} paths, missing ${JSON.stringify(run.partial.missing_paths ?? []).slice(0, 80)}; "${run.partial.decision_use}"` : '—'}`);
  if (run) {
    const u = await useOf(hoffmann, run.id);
    if (!u.ok) fail('A. Hoffmann reads the partial run\'s decision use', u);
    else (u.body.use.use === 'diagnostic' && (u.body.use.reasons ?? []).some((x) => x.class === 'partial') ? ok : bad)(`A. Hoffmann READ its decision use: ${u.body.use.label}`);
  }
  const it = await itemsOf('simulation.budget', PART.id);
  note(`the budget notices: ${it.map((i) => `${i.details?.kind ?? '?'} → ${i.owner ? nm(i.owner) : JSON.stringify(i.route_roles)} (${i.state})`).join('; ')}`);
}
ENV_OUT.EYE_B31_OPERATOR = 't.nakamura'; ENV_OUT.EYE_B31_APPROVER = 'j.weber'; ENV_OUT.EYE_B31_EXPERIMENT_TITLE = 'Corridor closure — 5,000 paths';

/* ── B31-I IMPACT ────────────────────────────────────────────────────────────────────── */
console.log('\nB31-I IMPACT — the corridor closure run\'s tornado and robustness, its second-order effect on the Regensburg delivery dates, the elicited futures, the value of one more week of transit data');
const IM = 'impact';
let IRUN = (await q(`select run_id::text id from simulation.runs_current where tenant_id = $1 and domain_id = $2 and twin_id = $3 and scenario_branch_id = $4 and run_kind = 'control' and stochastic_mode = 'seeded'
                      and samples = 500 and seed = 311 and operator_principal_id = $5 and state = 'completed' order by opened_at limit 1`, [T, D, TWIN.id, DOWN.id, nakamura.principalId]))[0]?.id ?? null;
if (IRUN) note(`the seeded corridor closure run ${short(IRUN)} stands — an earlier run`);
else {
  const r = await twr(nakamura, 'simulations/run', 'simulation.run', 'SIM', corridorRun({ stochastic: { mode: 'seeded', seed: 311, samples: 500, jitter: JITTER } }));
  if (!r.ok || r.body.run?.state !== 'completed') fail('T. Nakamura opens the seeded corridor closure run', r);
  else { IRUN = r.body.run.runId; ok(`T. Nakamura RAN the corridor closure ${short(IRUN)}: control, the shock on the flipped Downside, v${VER.version}, 90 days, seeded (seed 311, 500 samples, jitter ${JSON.stringify(JITTER)}) → ${r.body.run.state}`); }
}
if (IRUN) {
  const run = await runRow(IRUN);
  note(`its line-stop days over the samples: median ${run?.summary?.line_stop_days?.median ?? '—'}, p10 ${run?.summary?.line_stop_days?.p10 ?? '—'}, p90 ${run?.summary?.line_stop_days?.p90 ?? '—'}; total cost median ${run?.summary?.total_cost?.median ?? '—'} (SYNTHETIC)`);
  // THE SENSITIVITY (L8-C08): one at a time, ranked by swing; robustness across three seeds
  let SA = (await q(`select analysis_id::text id, factors, robustness, robustness_verdict, base_value, metric from simulation.sensitivity_analyses where run_id = $1 order by analysed_at desc limit 1`, [IRUN]))[0] ?? null;
  if (SA) note(`the sensitivity analysis ${short(SA.id)} stands — an earlier run`);
  else {
    const r = await sim(nakamura, `${IM}/runs/${IRUN}/sensitivity`, 'simulation.impact.sensitivity', 'SIM', { metric: 'total_cost', relative: 0.2, seeds: [11, 12, 13] }, IRUN);
    if (!r.ok) fail('T. Nakamura requests the sensitivity analysis', r);
    else { SA = { id: r.body.analysis.analysis_id, factors: r.body.analysis.factors, robustness: r.body.analysis.robustness, robustness_verdict: r.body.analysis.robustness_verdict, base_value: r.body.analysis.base_value, metric: r.body.analysis.metric };
      ok(`T. Nakamura REQUESTED the sensitivity analysis ${short(SA.id)}: ${SA.factors.length} factors moved ±20 % one at a time on ${SA.metric} (base ${SA.base_value})`); }
  }
  if (SA) {
    console.log('      the tornado (rank · factor · swing · low → high):');
    for (const f of SA.factors.slice(0, 5)) console.log(`      ${String(f.rank).padStart(2)} · ${String(f.key).padEnd(44)} ${String(f.swing).padStart(14)}   ${f.low?.metric} → ${f.high?.metric}`);
    const moved = (SA.robustness?.unstable ?? []).map((u) => u.key);
    ok(`THE ROBUSTNESS across seeds ${Object.keys(SA.robustness?.ranks ?? {}).join(', ')}: ${String(SA.robustness_verdict).toUpperCase()}${moved.length ? ` — the ranks that move: ${moved.join(', ')}` : ' — no rank moves'}`);
  }
  // THE SECOND-ORDER EFFECT (L8-C07) over act-b29's links
  let SO = await q(`select depth, entity_label, metric, "values" v, timing from simulation.second_order_effects where run_id = $1 and derivation_id = (select derivation_id from simulation.second_order_effects where run_id = $1 order by derived_at desc limit 1) order by depth`, [IRUN]);
  if (SO.length > 0) note('the second-order derivation stands — an earlier run');
  else {
    const r = await sim(nakamura, `${IM}/runs/${IRUN}/second-order`, 'simulation.impact.second_order', 'SIM', {}, IRUN);
    if (!r.ok) fail('T. Nakamura derives the second-order effects', r);
    else { SO = r.body.secondOrder.effects.map((e) => ({ depth: e.depth, entity_label: e.entity_label, metric: e.metric, v: e.values, timing: e.timing })); ok(`T. Nakamura DERIVED the second-order effects over ${r.body.secondOrder.links_traversed} live links`); }
  }
  for (const e of SO) console.log(`      depth ${e.depth} · ${String(e.entity_label).padEnd(48)} ${e.metric.padEnd(26)} p10/p50/p90 ${e.v.p10}/${e.v.p50}/${e.v.p90}${e.timing?.first_affected ? ` · first affected ${e.timing.first_affected}` : ''}${e.timing?.back_to_plan ? ` · back on plan ${e.timing.back_to_plan} (headroom ${e.timing.headroom})` : e.timing?.reason ? ` · ${String(e.timing.reason).slice(0, 60)}` : ''}`);
  (SO.some((e) => e.depth >= 1 && /Regensburg plant/.test(e.entity_label) && e.metric === 'delivery_date_shift_days') ? ok : bad)(`THE REGENSBURG DELIVERY DATES: ${SO.filter((e) => e.depth >= 1).map((e) => `${e.entity_label} shift ${e.v.p50} days at p50`).join('; ') || 'NOT derived'}`);
}
// THE GOVERNED PROBABILITIES and THE VALUE OF INFORMATION
const INFO_LABEL = 'one more week of transit data';
const probOf = async (branch) => (await q(`select method, probability_low lo, probability_high hi from prediction.branch_probabilities_current where branch_id = $1`, [branch]))[0] ?? null;
const OPTIONS = [{ key: 'status-quo', title: 'Hold the booked routing and the single magnet source' }, { key: 'dual-source', title: 'Dual-source the magnets and reroute via the Cape' }];
const PAYOFFS = { 'status-quo': { [BASE.id]: 0, [DOWN.id]: -2000 }, 'dual-source': { [BASE.id]: -480, [DOWN.id]: -600 } };
const voiPayload = () => ({ scenarioId: SCN.id, branchIds: [BASE.id, DOWN.id], packageId: REG_PKG.id, options: OPTIONS, payoffs: PAYOFFS, unit: 'k€',
  payoffBasis: 'the corridor closure runs costed per future: the line stop under the Downside, the second source and the Cape premium everywhere (SYNTHETIC)',
  information: { label: INFO_LABEL, delay_days: 7, delay_cost: 40,
    signals: [{ key: 'recover', label: 'transits recover', likelihoods: { [BASE.id]: 0.9, [DOWN.id]: 0.2 } }, { key: 'stay-low', label: 'transits stay low', likelihoods: { [BASE.id]: 0.1, [DOWN.id]: 0.8 } }],
    likelihood_basis: 'a week of daily transit counts separates a recovering corridor from a closed one 9 times in 10 (SYNTHETIC)' } });
let VOI = (await q(`select assessment_id::text id, recommendation, evpi, evsi, net_value, prior_best, posteriors, item_id::text item, branches from simulation.voi_assessments where package_id = $1 and information ->> 'label' = $2 and recommendation = 'wait' order by recorded_at desc limit 1`, [REG_PKG.id, INFO_LABEL]))[0] ?? null;
const elicitation = (question) => ({ elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'], question, elicited_at: '2026-10-01T09:00:00Z', record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)' } });
if (!VOI && (!(await probOf(BASE.id)) || !(await probOf(DOWN.id)))) {
  expectRefused('L. Brandt assesses the value of information while the futures carry no governed probability', await sim(brandt, `${IM}/voi/assess`, 'simulation.impact.voi', 'DPK', voiPayload(), REG_PKG.id), 422, /^value of information rejected \(no_probability\)/);
}
for (const [b, lo, hi, q0] of [[BASE, 0.55, 0.65, 'will the corridor recover over the next 30 days?'], [DOWN, 0.30, 0.40, 'will the corridor stay closed over the next 30 days?']]) {
  const had = await probOf(b.id);
  if (had) { note(`the probability of "${b.name}" stands (${had.method} ${had.lo}–${had.hi}) — an earlier run`); continue; }
  if (b === BASE) expectRefused('A. Hoffmann (domain_analyst) elicits a probability', await pd(hoffmann, `scenarios/quality/branches/${b.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'expert_elicitation', low: lo, high: hi, basis: elicitation(q0) }, b.id), 403);
  const r = await pd(eriksen, `scenarios/quality/branches/${b.id}/probability`, 'prediction.scenario.probability.set', 'BRN', { method: 'expert_elicitation', low: lo, high: hi, basis: elicitation(q0) }, b.id);
  if (!r.ok) fail(`N. Eriksen elicits "${b.name}"`, r); else ok(`N. Eriksen (the scenario's owner) ELICITED "${b.name}" ${lo.toFixed(2)}–${hi.toFixed(2)} (two experts, the recorded session — SYNTHETIC)`);
}
if (VOI) note(`the value-of-information assessment ${short(VOI.id)} stands (${VOI.recommendation}) — an earlier run`);
else {
  const r = await sim(brandt, `${IM}/voi/assess`, 'simulation.impact.voi', 'DPK', voiPayload(), REG_PKG.id);
  if (!r.ok) fail('L. Brandt assesses the value of information', r);
  else { const a = r.body.assessment; VOI = { id: a.assessment_id, recommendation: a.recommendation, evpi: a.evpi, evsi: a.evsi, net_value: a.net_value, prior_best: a.prior_best, posteriors: a.posteriors, item: a.item_id, branches: a.branches };
    ok(`L. Brandt ASSESSED "${INFO_LABEL}" on his Regensburg package ${short(REG_PKG.id)}`); }
}
if (VOI) {
  (VOI.recommendation === 'wait' ? ok : bad)(`THE VALUE OF INFORMATION: ${String(VOI.recommendation).toUpperCase()} — EVPI ${Number(VOI.evpi).toFixed(1)} k€, EVSI ${Number(VOI.evsi).toFixed(1)} k€ against a delay cost of 40 k€ → net ${Number(VOI.net_value).toFixed(1)} k€; acting now: ${(VOI.prior_best ?? []).join(', ')}; after "transits recover" ${(VOI.posteriors ?? []).find((p) => p.key === 'recover')?.best?.join(', ')}, after "transits stay low" ${(VOI.posteriors ?? []).find((p) => p.key === 'stay-low')?.best?.join(', ')} (weights ${(VOI.branches ?? []).map((b) => `${b.name} ${b.method} ${b.weight}`).join(', ')}; SYNTHETIC payoffs)`);
  const it = await itemsOf('simulation.value_of_information', REG_PKG.id);
  const open = it.find((i) => i.state !== 'closed') ?? it.at(-1);
  (open && open.owner === brandt.principalId ? ok : bad)(`THE ITEM: ${open ? `${short(open.id)} "${String(open.title).slice(0, 90)}" → ${nm(open.owner)} (${open.state})` : 'ABSENT'}`);
}
// A SIMULATED FREQUENCY AS A PROBABILITY (AI-50-005): through the ACTIVE map, over the run's own samples
if (IRUN) {
  const had = (await q(`select statement_id::text id, occurrences, samples, per_year, probability_low lo, probability_high hi, band ->> 'frequency_label' label from simulation.probability_statements where run_id = $1 and map_id = $2 order by stated_at desc limit 1`, [IRUN, MAP.id]))[0] ?? null;
  if (had) note(`the probability statement ${short(had.id)} stands (${had.occurrences}/${had.samples} samples, ${had.per_year}/year → ${had.label} ${had.lo}–${had.hi}) — an earlier run`);
  else {
    const r = await sim(eriksen, `${IM}/runs/${IRUN}/probability`, 'simulation.impact.probability', 'SIM', { mapId: MAP.id, event: { metric: 'line_stop_days', op: '>', threshold: 0, label: 'the Regensburg line stops at least one day' } }, IRUN);
    if (!r.ok) fail('N. Eriksen states the run\'s frequency through the map', r);
    else { const s = r.body.statement; ok(`N. Eriksen STATED through "${MAP.name}" v${s.map_version}: ${s.occurrences}/${s.samples} samples stop the line → ${s.per_year} a year → ${s.band?.frequency_label} ${s.probability_low}–${s.probability_high} ("${String(s.caveat ?? '').slice(0, 70)}…")`); }
  }
  const rd = await sim(hoffmann, `${IM}/runs/${IRUN}/read`, 'simulation.impact.read', 'SIM', {}, IRUN, READ);
  if (!rd.ok) fail('A. Hoffmann reads the run\'s impact', rd);
  else ok(`A. Hoffmann READ the run's impact: ${(rd.body.impact.analyses ?? []).length} analysis(es), ${(rd.body.impact.second_order ?? []).length} second-order effect(s), ${(rd.body.impact.probabilities ?? []).length} probability statement(s)`);
}
ENV_OUT.EYE_B31_IMPACT_RUN = IRUN ?? '—'; ENV_OUT.EYE_B31_IMPACT_OPERATOR = 't.nakamura'; ENV_OUT.EYE_B31_IMPACT_DECIDER = 'l.brandt';
ENV_OUT.EYE_B31_IMPACT_DOWNSTREAM = 'Regensburg plant'; ENV_OUT.EYE_B31_IMPACT_INFORMATION = INFO_LABEL;

/* ── B31-V VALIDITY ──────────────────────────────────────────────────────────────────── */
console.log('\nB31-V VALIDITY — the decision-use policy; a promoted control DECISION-GRADE; the reroute recommended, challenged and UPHELD → INPUT INVALIDATED, the commitment refused');
const VA = 'validity';
{
  const cur = await sim(hoffmann, `${VA}/policy/read`, 'simulation.validity.read', 'SIM', {}, null, READ);
  const c = cur.ok ? cur.body.current : null;
  if (c && c.require_decision_use === true) note(`the domain's decision-use policy v${c.version} (require: true, set by ${nm(c.set_by)}) stands — an earlier run`);
  else {
    expectRefused('M. Dvořák (executive) sets the decision-use policy', await sim(dvorak, `${VA}/policy`, 'simulation.validity.policy', 'SIM', { require: true, rationale: 'only promoted results support a commitment (SYNTHETIC)' }), 403);
    const r = await sim(brandt, `${VA}/policy`, 'simulation.validity.policy', 'SIM', { require: true, rationale: 'a recommendation or a commitment of this domain rests only on simulation results a reviewer promoted as fit for the decision (B31)', ...(c ? { expectedVersion: c.version } : {}) });
    if (!r.ok) fail('L. Brandt sets the decision-use policy', r); else ok(`L. Brandt (the decision authority) SET the domain's decision-use policy v${r.body.policy.version}: require ${r.body.policy.require_decision_use} — a DECISION-GRADE result at proposal and commitment, from now on, for this domain`);
  }
}
const V_TITLE = 'Regensburg routing — reroute the magnets via the Cape on the B31 corridor runs (SYNTHETIC)';
let VPKG = (await q(`select package_id::text id, state, current_version v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, V_TITLE]))[0] ?? null;
let CTRL = null; let RR = null;
if (VPKG) {
  const cons = await q(`select o.key, c ->> 'id' run from decision.options o, jsonb_array_elements(o.consequences) c where o.package_id = $1 and o.version = $2 and c ->> 'kind' = 'run'`, [VPKG.id, VPKG.v]);
  CTRL = cons.find((x) => x.key === 'status-quo')?.run ?? null; RR = cons.find((x) => x.key === 'reroute')?.run ?? null;
  note(`the package ${short(VPKG.id)} stands (${VPKG.state}, v${VPKG.v}); its runs: the control ${short(CTRL)}, the reroute ${short(RR)} — an earlier run`);
} else {
  const c = await twr(nakamura, 'simulations/run', 'simulation.run', 'SIM', corridorRun({ stochastic: { mode: 'deterministic' } }));
  if (!c.ok || c.body.run?.state !== 'completed') fail('T. Nakamura runs the corridor control', c);
  else {
    CTRL = c.body.run.runId;
    const i = await twr(nakamura, 'simulations/run', 'simulation.run', 'SIM', corridorRun({ runKind: 'intervention', controlRunId: CTRL, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }], stochastic: { mode: 'deterministic' } }));
    if (!i.ok || i.body.run?.state !== 'completed') fail('T. Nakamura runs the reroute', i);
    else { RR = i.body.run.runId; ok(`T. Nakamura RAN the corridor control ${short(CTRL)} and the reroute of SYN-SHIP-4472 via the Cape ${short(RR)} (deterministic, the shock on the flipped Downside, v${VER.version})`); }
  }
}
const promote = (s, runId, what) => twr(s, `simulations/${runId}/promote`, 'simulation.result.promote', 'SIM', { promotedFor: 'the NORDWERK corridor routing decision (B31, SYNTHETIC)', limitations: ['calendar days', 'synthetic grounding'],
  note: `the ${what} reproduces from its stored contract and its envelope holds; fit for the routing decision it informs (SYNTHETIC)` }, runId);
if (CTRL) {
  const r0 = await runRow(CTRL);
  if (r0.promotion) note(`the control ${short(CTRL)} is promoted ("${r0.promoted_for}") — an earlier run`);
  else {
    const own = await promote(nakamura, CTRL, 'control');
    if (!own.ok && (own.status === 403 || own.status === 409)) ok(`T. Nakamura (the run's operator) promotes his own control REFUSED — ${refusalLine(own)}`); else bad(`the operator's own promotion: ${own.ok ? 'ADMITTED' : refusalLine(own)}`);
    const r = await promote(weber, CTRL, 'control');
    if (!r.ok) fail('J. Weber promotes the control', r); else ok(`J. Weber (a reviewer other than its operator) PROMOTED the control ${short(CTRL)} as fit for "${r.body.promotion?.promoted_for ?? 'the NORDWERK corridor routing decision (B31, SYNTHETIC)'}"`);
  }
  const u = await useOf(nakamura, CTRL);
  if (u.ok) (u.body.use.use === 'decision' ? ok : bad)(`the control's decision use (read by T. Nakamura): ${u.body.use.label}`); else fail('the control\'s decision use', u);
}
if (!VPKG && CTRL && RR) {
  const d = await dc(brandt, 'declare', 'decision.package.declare', 'DPK', { decisionObjectId: JAN.dec, title: V_TITLE, statement: 'whether to reroute the open magnet bookings for the Regensburg line via the Cape, on T. Nakamura\'s corridor runs (SYNTHETIC)', owner: brandt.principalId });
  if (!d.ok) fail('L. Brandt declares the package', d);
  else {
    const id = d.body.package.packageId;
    const o = await dc(brandt, `${id}/versions/open`, 'decision.package.version', 'DPK', { knownAt: new Date(await dbNow()).toISOString(), observedThrough: null }, id);
    if (!o.ok) fail('L. Brandt opens version 1', o);
    else {
      const v = o.body.version.version;
      const steps = [
        await dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'status-quo', title: 'Hold the booked routing', kind: 'status_quo', consequences: [{ kind: 'run', id: CTRL, version: 1 }], risks: [], opportunities: [] }, id),
        await dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'reroute', title: 'Reroute the open magnet bookings via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: RR, version: 1 }], risks: ['the Cape leg adds about two weeks to every sailing'], opportunities: [] }, id),
        await dc(brandt, `${id}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
          monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }], reversibility: 'reversible until the bookings are amended with the carriers', informationValue: 'one more week of transit data is worth waiting for on the sourcing question; the routing rests on the runs' }, id),
        await dc(brandt, `${id}/versions/${v}/choice`, 'decision.package.choice', 'DPK', { option_key: 'reroute', rationale: 'The reroute keeps the Regensburg line supplied under the corridor closure; the Cape premium is smaller than the line stop it avoids (SYNTHETIC).', decision_deadline: '2027-01-15',
          accepted_trade_offs: ['the Cape premium on every rerouted container'], action_owner: brandt.principalId,
          outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TWIN.id, period: { from: '2024-01-11', to: '2024-04-10' } }] }, id),
      ];
      const b1 = steps.find((x) => !x.ok);
      if (b1) fail('L. Brandt drafts the package', b1);
      else { VPKG = { id, state: 'draft', v }; ok(`L. Brandt DECLARED the FRESH package ${short(id)} "${V_TITLE}" on the January Regensburg decision and DRAFTED version ${v}: status-quo (the control ${short(CTRL)}) vs reroute (${short(RR)}), the choice reroute, approver S. Okafor — fresh because the January package is committed (now ${JAN.state}; a committed version is not re-proposed) and B27's Regensburg package recommends dual-sourcing, not the reroute`); }
    }
  }
}
const vstate = async () => (VPKG ? (await q(`select state, version_digest from decision.package_versions where package_id = $1 and version = $2`, [VPKG.id, VPKG.v]))[0] : null);
if (VPKG && RR) {
  // THE GATE AT THE PROPOSAL: the recommended reroute is unpromoted → refused; promoted → proposed
  if ((await vstate())?.state === 'draft') {
    if (!(await runRow(RR)).promotion) {
      expectRefused('L. Brandt proposes the reroute while its run is unpromoted', await dc(brandt, `${VPKG.id}/versions/${VPKG.v}/propose`, 'decision.package.propose', 'DPK', {}, VPKG.id), 409, /^run use rejected \(diagnostic_only\)/);
      const r = await promote(weber, RR, 'reroute');
      if (!r.ok) fail('J. Weber promotes the reroute', r); else ok(`J. Weber PROMOTED the reroute ${short(RR)} — the proposal's recommended option now rests on a decision-grade result`);
    }
    const p = await dc(brandt, `${VPKG.id}/versions/${VPKG.v}/propose`, 'decision.package.propose', 'DPK', {}, VPKG.id);
    if (!p.ok) fail('L. Brandt proposes', p); else ok(`L. Brandt PROPOSED version ${VPKG.v} under the policy — digest ${String(p.body.proposal?.versionDigest).slice(0, 12)}… → ${(await vstate()).state}`);
  } else note(`the version is ${(await vstate())?.state} — an earlier run`);
  // THE CHALLENGE: opened by C. Brenner, UPHELD by J. Weber → the reroute INVALIDATED in the same write
  let CH = (await q(`select challenge_id::text id, state, opened_by::text opened_by, decided_by::text decided_by from simulation.challenges where run_id = $1 order by opened_at desc limit 1`, [RR]))[0] ?? null;
  if (CH && CH.state === 'upheld') note(`the challenge ${short(CH.id)} on the reroute stands (UPHELD by ${nm(CH.decided_by)}) — an earlier run`);
  else {
    if (!CH || !['open', 'rerun_requested'].includes(CH.state)) {
      const o = await twr(brenner, `simulations/${RR}/challenge`, 'simulation.challenge.open', 'SIM', { kind: 'interpretation', statement: 'the reroute saving ignores the Cape congestion surcharge the carriers announced for the quarter (SYNTHETIC)', disputed: ['route.reroute_delay_days'] }, RR);
      if (!o.ok) fail('C. Brenner challenges the reroute', o); else { CH = { id: o.body.challenge.challenge_id, state: o.body.challenge.state }; ok(`C. Brenner (the corridor risk's owner) CHALLENGED the reroute ${short(RR)} → ${CH.state} (interpretation; disputed route.reroute_delay_days)`); }
    }
    if (CH) {
      const u = await useOf(brandt, RR);
      if (u.ok) note(`the reroute while challenged: ${u.body.use.label}`);
      expectRefused('C. Brenner (the opener) decides the challenge', await twr(brenner, `simulations/${RR}/challenges/${CH.id}/decide`, 'simulation.challenge.decide', 'SIM', { decision: 'upheld', note: 'deciding my own challenge (SYNTHETIC)' }, RR), 403, /the decider is the challenge's opener/);
      const d = await twr(weber, `simulations/${RR}/challenges/${CH.id}/decide`, 'simulation.challenge.decide', 'SIM', { decision: 'upheld', note: 'the surcharge was omitted from the reroute\'s cost; the result does not stand (SYNTHETIC)' }, RR);
      if (!d.ok) fail('J. Weber decides the challenge', d);
      else (d.body.challenge?.state === 'upheld' && d.body.invalidation !== null ? ok : bad)(`J. Weber UPHELD the challenge ${short(CH.id)} → the reroute ${short(RR)} INVALIDATED in the same write (${JSON.stringify(d.body.invalidation ?? {}).slice(0, 120)})`);
    }
  }
  const ru = await useOf(brandt, RR);
  if (ru.ok) (ru.body.use.use === 'refused' ? ok : bad)(`the reroute's decision use: ${ru.body.use.label}`); else fail('the reroute\'s decision use', ru);
  // THE PACKAGE READ: INPUT INVALIDATED
  const pr = await pkgValidity(brandt, VPKG.id);
  if (!pr.ok) fail('L. Brandt reads the package\'s inputs', pr);
  else {
    const pk = pr.body.package; const ver = (pk.versions ?? []).find((x) => x.version === VPKG.v) ?? pk.versions?.[0];
    const opt = (ver?.options ?? []).find((o) => o.key === 'reroute'); const sq = (ver?.options ?? []).find((o) => o.key === 'status-quo');
    (pk.input_invalidated === true && opt?.marked === 'input_invalidated' ? ok : bad)(`L. Brandt READ the package's inputs: input invalidated ${pk.input_invalidated}; "reroute" (recommended ${opt?.recommended}) marked ${String(opt?.marked).toUpperCase()}, refused on its next derivation ${opt?.refused_on_next_derivation}, its run ${opt?.runs?.map((x) => `${short(x.run_id)} ${x.validity} → ${x.use}`).join(', ')}; "status-quo" marked ${sq?.marked ?? 'nothing'}`);
  }
  // THE APPROVAL and THE COMMITMENT REFUSED
  const vs = await vstate();
  const approved = (await q(`select count(*)::int n from decision.approvals where package_id = $1 and version = $2 and revoked_at is null and decision = 'approve'`, [VPKG.id, VPKG.v]))[0].n;
  if (approved > 0) note('S. Okafor\'s approval stands — an earlier run');
  else if (vs?.state === 'proposed' || vs?.state === 'under_review') {
    const a = await dc(okafor, `${VPKG.id}/versions/${VPKG.v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: vs.version_digest, rationale: 'The reroute keeps the line running; the premium is acceptable on the runs as cited.' });
    if (!a.ok) fail('S. Okafor approves', a); else ok(`S. Okafor APPROVED version ${VPKG.v} (${a.body.approval?.state ?? 'approved'}; quorum ${a.body.approval?.liveApprovals}/${a.body.approval?.quorum})`);
  } else note(`the version is ${vs?.state}: no approval asked`);
  const vs2 = await vstate();
  const committed = (await q(`select count(*)::int n from decision.commitments where package_id = $1`, [VPKG.id]))[0].n;
  if (committed > 0) bad('the package was COMMITTED — the gate did not hold');
  else {
    const pv = await dc(brandt, `${VPKG.id}/versions/${VPKG.v}/preview`, 'decision.commit.preview', 'DPK', { versionDigest: vs2.version_digest }, VPKG.id);
    if (pv.ok) note(`L. Brandt previewed the commitment: would commit ${pv.body.preview?.preview?.would_commit ?? pv.body.preview?.would_commit ?? '—'}; blockers ${JSON.stringify(pv.body.preview?.preview?.blockers ?? pv.body.preview?.blockers ?? []).slice(0, 160)}`);
    else note(`L. Brandt's preview: ${refusalLine(pv)}`);
    const cm = await dc(brandt, `${VPKG.id}/versions/${VPKG.v}/commit`, 'decision.commit', 'CMT', { versionDigest: vs2.version_digest, previewDigest: pv.ok ? pv.body.preview.preview_digest : '' }, null, { consequence: 'C3' });
    expectRefused(`L. Brandt COMMITS version ${VPKG.v} citing the invalidated reroute`, cm, 409, /^run use rejected \(refused\)/);
    note(`the version stays ${(await vstate()).state}; commitments on the package: ${(await q(`select count(*)::int n from decision.commitments where package_id = $1`, [VPKG.id]))[0].n}`);
  }
}
// THE BRANCH BOUND to its twin state (F-P4-07, AI-49-002): N. Eriksen binds the flipped Downside to the admitted corridor version
{
  const cur = (await q(`select binding_id::text id, version, twin_version, state from prediction.branch_twin_bindings where branch_id = $1 and state = 'active' order by version desc limit 1`, [DOWN.id]))[0] ?? null;
  if (cur) note(`the Downside's binding v${cur.version} to the corridor's v${cur.twin_version} stands — an earlier run`);
  else {
    const r = await sim(eriksen, `${VA}/branches/${DOWN.id}/bind`, 'simulation.validity.bind', 'BRN', { twinId: TWIN.id, twinVersion: VER.version, initialConditions: [{ key: 'route.reroute_delay_days' }, { key: 'shock.corridor_delay_days' }],
      rationale: 'the corridor closure starts from the admitted corridor state the B31 runs read (SYNTHETIC)', assumptionFactors: [] }, DOWN.id);
    if (!r.ok) fail('N. Eriksen binds the Downside', r); else ok(`N. Eriksen (the branch's owner) BOUND the flipped Downside to the corridor's admitted v${r.body.binding.twin_version} (binding v${r.body.binding.version}; initial conditions ${(r.body.binding.initial_conditions ?? []).map((c) => c.key).join(', ')})`);
  }
  const b = await sim(hoffmann, `${VA}/branches/${DOWN.id}/binding`, 'simulation.validity.read', 'BRN', {}, DOWN.id, READ);
  if (b.ok) { const runs = b.body.binding.runs ?? []; note(`the binding read: active v${b.body.binding.active?.version ?? '—'}; ${runs.length} run(s) on the branch, ${runs.filter((x) => x.from_bound_state).length} from the bound state`); }
  else fail('A. Hoffmann reads the binding', b);
}
ENV_OUT.EYE_B31_VALIDITY_PACKAGE = VPKG?.id ?? '—'; ENV_OUT.EYE_B31_VALIDITY_RUN = RR ?? '—'; ENV_OUT.EYE_B31_VALIDITY_PROMOTED_RUN = CTRL ?? '—';
ENV_OUT.EYE_B31_VALIDITY_DECIDER = 'l.brandt'; ENV_OUT.EYE_B31_VALIDITY_OPERATOR = 't.nakamura';

/* ── B31-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB31-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from simulation.experiments where tenant_id = $1 and domain_id = $2)::int experiments,
                             (select count(*) from simulation.experiment_checkpoints k join simulation.experiments e using (experiment_id) where e.tenant_id = $1 and e.domain_id = $2)::int checkpoints,
                             (select count(*) from simulation.sensitivity_analyses where tenant_id = $1 and domain_id = $2)::int analyses,
                             (select count(distinct derivation_id) from simulation.second_order_effects where tenant_id = $1 and domain_id = $2)::int derivations,
                             (select count(*) from simulation.voi_assessments where tenant_id = $1 and domain_id = $2)::int voi,
                             (select count(*) from simulation.probability_statements where tenant_id = $1 and domain_id = $2)::int statements,
                             (select count(*) from simulation.decision_use_policies where tenant_id = $1 and domain_id = $2)::int policies,
                             (select count(*) from prediction.branch_twin_bindings where tenant_id = $1 and domain_id = $2)::int bindings,
                             (select count(*) from simulation.runs_current where tenant_id = $1 and domain_id = $2 and promotion_id is not null)::int promoted,
                             (select count(*) from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class in ('simulation.budget', 'simulation.experiment', 'simulation.validity', 'simulation.value_of_information'))::int items`, [T, D]))[0];
  note(`in the ledgers: ${n.experiments} experiment(s) with ${n.checkpoints} checkpoints; ${n.analyses} sensitivity analysis(es), ${n.derivations} second-order derivation(s), ${n.voi} value-of-information assessment(s), ${n.statements} probability statement(s); ${n.policies} decision-use policy version(s), ${n.bindings} branch binding(s), ${n.promoted} promoted run(s); ${n.items} B31 attention items`);
  console.log('  the env lines for the walks:');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/\s/.test(v) ? `'${v}'` : v}`);
  note('LIMITS said: EVERY FIGURE IS SYNTHETIC — the experiment\'s budget, the jitter, the payoffs (k€), the likelihoods of "one more week of transit data", the delay cost, the elicited bands and the challenge\'s surcharge are the personas\' statements for the demonstration, not measurements; the runs are supply-flow@1 over NORDWERK\'s synthetic grounding. THE POLICY: L. Brandt\'s decision-use policy (require: true) NOW APPLIES TO THE DEMONSTRATION DOMAIN\'S LATER PROPOSALS AND COMMITMENTS — a recommended option citing an unpromoted, challenged, partial or invalidated run is refused at proposal and at commitment from here on (the B27 Regensburg package was proposed before it; its commitment would meet it); the walks and later acts meet it. THE BINDING: runs on the scenario\'s flipped Downside must now start from the bound corridor version (a run from another version is refused, branch_binding) until its owner rebinds or retires it. The executor of the chunks is the attention agent\'s REAL scheduled tick (waited for, not driven); the chunk runs in a separate process on this host. The VOI\'s package is L. Brandt\'s B27 Regensburg package (status quo vs dual-source; it was proposed, so it can be informed); the validity scene\'s package is a FRESH one (the January package is committed and B27\'s recommends dual-sourcing, not the reroute). The commitment refusal is re-asked on every run (a refusal writes nothing). NOT STAGED (HARNESS-PROVEN): orchestration — a crashed chunk retried, chunk executions exhausted, a chunk failed for good, convergence, a worker lost mid-chunk (fenced, reclaimed), capacity and cancellation, the worker\'s authority, the cold reproduction of the completed run (phase6-orchestration-b31 O1–O8); impact — the timing (sequencing) factor of a dated intervention, the forged rankings and reach refused, the map superseded, a portfolio review\'s payoffs, the comparator\'s sensitivity evidence, the method fabric\'s sweeps (phase6-impact-b31 s/o/p/v/c/f/g); validity — the commitment refused while a challenge is live and admitted once dismissed, a partial run cited, the quality gate on runs, promotions and warnings, the ASU → SCN dependency, the claim and indicator conditions, the binding\'s refusals and rebind, the run\'s assumption sensitivity, the reach of an unverified twin version (phase6-validity-b31 U/G/P/Q/A/C/B/S/R). LEFT OUT (named in the parts\' reports): distributed execution across machines (F-P5-08/B110), the Simulation Agent (AG-021), chunking beyond supply-flow@1, SimulationCompleted for a partial run (the contract has no partial state); adversarial sensitivity, convergence and rare-event diagnostics, model discrepancy, map evaluation, VOI on the decision pages; SimulationPromoted@v1, the constraint set enforced at run open. Nothing is cleaned: every object stands as a demonstration fact.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
