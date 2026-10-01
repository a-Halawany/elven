#!/usr/bin/env node
/**
 * CP-6 batch B35 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): DECISION ANALYSIS,
 * THE RECOMMENDATION, EXPLANATION AND APPEAL, THE REOPEN AND THE OUTCOME ASSESSMENT (migration 0101; F-P6-01 / F-P6-02 / F-P6-03 / F-P6-06)
 * — exercised by the personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers, and where nothing
 * happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and
 * says "stands — an earlier run" instead of writing it twice. No clock is moved; nothing is planted.
 *
 *   B35-0 THE STATE: 0101 applied; the casting read from identity.role_bindings (no persona created, no role granted); the Decision Agent
 *         (registered in Act VI) and its run session; the attention agent; the inputs (the January decision, the B31 corridor runs, the
 *         objectives, the corridor forecast, act-b34's committed MITIG package).
 *   B35-A ANALYSIS (F-P6-01): L. Brandt's "Second source for bearings (SYNTHETIC)" — three options (keep the single source, dual-source via
 *         Morocco, raise the bearing safety stock); criteria with exposed weights and their value owner (line stops computed from the
 *         cited runs); the Hauptzollamt customs obligation evaluated per option; v2 at the reported flip weight → the ranking moves; the
 *         Decision Agent generates candidates and assembles the package.
 *   B35-R RECOMMENDATION (F-P6-02): the Decision Agent records "dual-source via Morocco"; L. Brandt records her own on another option;
 *         S. Okafor (decision approver, not the author) ACCEPTS the agent's FOR CONSIDERATION; both say what could make them wrong; the
 *         side-by-side read.
 *   B35-E EXPLANATION AND APPEAL (F-P6-03): J. Weber contests the corridor forecast's SOURCE — the explanation generated, the case opened with
 *         a deadline, an adjudicator assigned by L. Brandt (decision authority), PARTLY UPHELD with a correction, closed; the explanation
 *         generated again shows the contested source and the outcome.
 *   B35-P REOPEN AND OUTCOME (F-P6-06): act-b34's committed dual-sourcing decision (MITIG) reopened on conditions_changed ("the corridor
 *         reopens", with evidence); the cited scenario's owner tasked, the scenario re-versioned through the branch route, the request
 *         resolved; the outcome assessment — observed, inferred contribution (method, confidence), counterfactual, changed conditions.
 *   B35-9 THE STATE, the env lines for the walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC. Nothing prints a credential: the Decision Agent's run session is opened through the same identity port the
 * runtime's DecisionAgentSessionService uses, its token held in memory only.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHmac, randomBytes, randomUUID, createHash } from 'node:crypto';
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
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const DC = `${X}/decisions`; const G = `${X}/graph`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 240)}`;
const dbConf = (user, password) => ({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user, password });
const su = new pg.Client(dbConf(env.EYE_DB_MIGRATE_USER ?? 'eye', env.EYE_DB_MIGRATE_PASSWORD));
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t;
const tStart = Date.now();
console.log(`THE B35 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};
const ENV_OUT = {};
/** Run the steps in order; the first refused one is returned (null when every step was accepted). */
const firstFailure = async (steps) => { for (const st of steps) { const r = await st(); if (!r.ok) return r; } return null; };
const num = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(3).replace(/\.?0+$/, ''));

/* ── B35-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB35-0 THE STATE — 0101, the casting, the Decision Agent, the attention agent, the inputs');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0101%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0101 is not applied'); process.exit(1); }
}
const CAST = { 'l.brandt': ['decision_authority', 'decision_owner', 'strategy_owner'], 's.okafor': ['decision_approver'], 'j.weber': ['strategy_owner'], 'n.eriksen': ['forecast_owner'],
  'm.dvorak': ['executive'], 'c.brenner': ['decision_owner'], 'a.hoffmann': ['domain_analyst'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
  const auth = await q(`select p.login_name from identity.principals p join identity.role_bindings b on b.principal_id = p.id where b.revoked_at is null and b.domain_id = $1 and b.role_code = 'decision_authority' and p.kind = 'human' order by 1`, [D]);
  note(`the decision authorities of the domain: ${auth.map((a) => a.login_name).join(', ')} — the appeal bench's second member is M. Dvořák (executive: the bench roles are decision authority, executive, domain administrator, auditor); no persona created, no role granted`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const brandt = await who('l.brandt'); const okafor = await who('s.okafor'); const weber = await who('j.weber'); const eriksen = await who('n.eriksen');
const dvorak = await who('m.dvorak'); const brenner = await who('c.brenner'); const hoffmann = await who('a.hoffmann');
const NAME = { [brandt.principalId]: 'L. Brandt', [okafor.principalId]: 'S. Okafor', [weber.principalId]: 'J. Weber', [eriksen.principalId]: 'N. Eriksen', [dvorak.principalId]: 'M. Dvořák',
  [brenner.principalId]: 'C. Brenner', [hoffmann.principalId]: 'A. Hoffmann', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose, consequence) => (over) => as(s, scope, { purposeId: purpose, consequence, ...over });
const READ = { sideEffect: 'none' };
const dc = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${DC}/${path}`, env_(s, 'decision', 'C1')({ action, objectType, objectId, ...extra }), payload, s.token);
const pd = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${P}/${path}`, env_(s, 'prediction', 'C2')({ action, objectType, objectId, ...extra }), payload, s.token);

// THE DECISION AGENT (registered in Act VI): its own RUN SESSION, opened as DecisionAgentSessionService.openRunSession opens it — the identity
// operation context, executive.decision_agent_run_open (the registration must be active, the principal an active agent principal), the
// identity audit event, the access token signed as IdentityService.signAccess signs it. The token stays in this process; nothing prints it.
const AGENT_REG = (await q(`select agent_id::text, principal_id::text, agent_version, status from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'decision' and status = 'active' order by created_at limit 1`, [T, D]))[0] ?? null;
if (AGENT_REG === null) { bad('the Decision Agent is ABSENT — no active decision agent is registered in the domain'); process.exit(1); }
const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
async function openAgentRunSession(agentId) {
  const ic = new pg.Client(dbConf(env.EYE_DB_IDENTITY_USER ?? 'eye_identity', env.EYE_DB_IDENTITY_PASSWORD));
  await ic.connect();
  const sessionId = randomUUID(); const familyId = randomUUID(); const correlationId = randomUUID();
  const refreshToken = `${randomUUID()}.${randomBytes(24).toString('base64url')}`; const contextKey = randomBytes(32).toString('base64url');
  const ttl = Number(env.EYE_IDENTITY_ACCESS_TTL ?? 900);
  const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
  let reg;
  try {
    await ic.query('begin');
    await ic.query(`select ctx.issue_identity_op('identity.session.create', null::uuid, $1::uuid, 60)`, [correlationId]);
    reg = (await ic.query(`select executive.decision_agent_run_open($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid) r`,
      [sessionId, agentId, T, D, sha(refreshToken), sha(contextKey), new Date(Date.now() + Math.max(ttl, 900) * 1000), familyId])).rows[0].r;
    await ic.query(`select audit.commit_identity_event($1::uuid, $2::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', $3::uuid, $4::jsonb)`,
      [reg.principal_id, sessionId, correlationId, JSON.stringify({ agent_id: agentId, agent_version: reg.agent_version, code_digest: reg.code_digest, assurance: 'agent_grant', family: 'executive' })]);
    await ic.query('commit');
  } catch (e) { await ic.query('rollback').catch(() => {}); await ic.end(); throw new Error(`the Decision Agent's run session was refused: ${e.message}`); }
  await ic.end();
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'HS256', kid: env.EYE_IDENTITY_JWT_KID ?? 'local-1' });
  const body = b64u({ sid: sessionId, asr: 'agent_grant', ctxk: contextKey, sub: reg.principal_id, iss: env.EYE_IDENTITY_JWT_ISSUER ?? 'the-eye.local', aud: env.EYE_IDENTITY_JWT_AUDIENCE ?? 'the-eye-api', iat: now, exp: now + ttl });
  const sig = createHmac('sha256', Buffer.from(env.EYE_IDENTITY_JWT_SECRET, 'utf8')).update(`${head}.${body}`).digest('base64url');
  return { token: `${head}.${body}.${sig}`, principalId: reg.principal_id, sessionId, registration: reg };
}
const agent = await openAgentRunSession(AGENT_REG.agent_id);
NAME[agent.principalId] = 'the Decision Agent';
{
  const roles = (await q(`select array_agg(role_code order by role_code) r from identity.role_bindings where principal_id = $1 and revoked_at is null and domain_id = $2`, [agent.principalId, D]))[0].r ?? [];
  const kind = (await q(`select kind from identity.principals where id = $1`, [agent.principalId]))[0]?.kind;
  ((roles.includes('decision_agent') && kind === 'agent') ? ok : bad)(`the Decision Agent ${short(AGENT_REG.agent_id)} (v${AGENT_REG.agent_version}, registered in Act VI; principal ${short(agent.principalId)}, kind ${kind}, roles ${roles.join(', ')}) — its RUN SESSION ${short(agent.sessionId)} opened through the identity port (executive.decision_agent_run_open), the token held in memory only`);
}
// THE ATTENTION AGENT: the tick's host (the appeal deadlines step and the review steps run in it); this act waits for no tick
const ATT = (await q(`select agent_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (ATT === null) bad('the attention agent is ABSENT');
else {
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [ATT.agent_id]))[0];
  (last.n > 0 ? ok : bad)(`the attention agent ${short(ATT.agent_id)} — cadence ${ATT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes (its steps appeal-deadlines, cited-scenario-relevance and review-cadence run there; this act waits for none)`);
}
// THE INPUTS
const JAN = (await q(`select package_id::text pkg, decision_object_id::text dec, state from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const OBJ_REG = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const OBJ_DEL = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'On-time delivery 95%' limit 1`, [T, D]))[0] ?? null;
// the options' runs: the corridor control J. Weber PROMOTED in act-b31 (decision-grade; the single source under the closure) and act-b24's
// "Qualify the second source and reroute" intervention (the second source's flow; its own control on the B24 scenario)
const PAIR = (await q(`select (select run_id::text from simulation.runs_current where tenant_id = $1 and domain_id = $2 and run_kind = 'control' and state = 'completed' and validity = 'valid' and promotion_id is not null
                               and scenario_id is not null order by opened_at desc limit 1) control,
                              (select i.run_id::text from decision.options o cross join lateral jsonb_array_elements(o.consequences) c join simulation.runs_current i on i.run_id = (c ->> 'id')::uuid
                                 join decision.packages_current p on p.package_id = o.package_id
                                where p.tenant_id = $1 and p.domain_id = $2 and p.title like 'B24 — second source for the magnet sets%' and o.key = 'second-source' and c ->> 'kind' = 'run' and i.run_kind = 'intervention' and i.validity = 'valid' limit 1) intervention`, [T, D]))[0];
for (const k of ['control', 'intervention']) if (PAIR?.[k]) PAIR[`${k[0]}_ls`] = (await q(`select (outputs -> 'totals' ->> 'line_stop_days')::numeric v from simulation.runs_current where run_id = $1`, [PAIR[k]]))[0].v;
if (PAIR && (!PAIR.control || !PAIR.intervention)) PAIR.missing = true;
// the corridor forecast: the live Bab el-Mandeb transit forecast the corridor scenarios rest on
const FCT = (await q(`select f.forecast_id::text id, f.series_key, f.horizon_code, f.label from prediction.forecasts_current f where f.tenant_id = $1 and f.domain_id = $2 and f.state = 'issued' and f.series_key like '%chokepoint4:n_total'
                      order by (f.label = 'live') desc, f.issued_at desc limit 1`, [T, D]))[0] ?? null;
const MITIG = (await q(`select package_id::text pkg, state, committed_version cv, current_version v, owner_principal_id::text owner from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'Mitigate the corridor closure — Regensburg line' limit 1`, [T, D]))[0] ?? null;
{
  const have = { JAN: !!JAN, OBJ_REG: !!OBJ_REG, OBJ_DEL: !!OBJ_DEL, PAIR: !!PAIR && !PAIR.missing, FCT: !!FCT, MITIG: !!MITIG };
  if (Object.values(have).some((x) => !x)) { bad(`an input is missing: ${JSON.stringify(have)}`); process.exit(1); }
  ok(`the inputs: the January decision ${short(JAN.dec)}; the objectives "${OBJ_DEL.title}" and "${OBJ_REG.title}"; the PROMOTED corridor control ${short(PAIR.control)} (${num(PAIR.c_ls)} line-stop days) and act-b24's second-source intervention ${short(PAIR.intervention)} (${num(PAIR.i_ls)}); the corridor forecast ${short(FCT.id)} (${FCT.series_key} ${FCT.horizon_code}, ${FCT.label}); act-b34's MITIG package ${short(MITIG.pkg)} (${MITIG.state}, committed v${MITIG.cv}, owner ${nm(MITIG.owner)})`);
}

/* ── B35-A ANALYSIS ──────────────────────────────────────────────────────────────────── */
console.log('\nB35-A ANALYSIS (F-P6-01) — L. Brandt\'s "Second source for bearings": three options scored against the delivery objectives with exposed weights, the customs obligation evaluated, the weight at the flip moves the ranking, the Decision Agent generates candidates and assembles the package');
const A_TITLE = 'Second source for bearings (SYNTHETIC)';
const AN = 'analysis/packages';
const an = (s, path, action, payload = {}, pkg = null, extra = {}) => dc(s, `${AN}/${path}`, action, 'DPK', payload, pkg, extra);
const readAnalysis = async (s, pkg) => { const r = await an(s, `${pkg}/read`, 'decision.analysis.read', {}, pkg, READ); return r.ok ? r.body.analysis : (fail('the analysis read', r), null); };
let APKG = (await q(`select package_id::text id, state, current_version v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3 and owner_principal_id = $4 order by declared_at limit 1`, [T, D, A_TITLE, brandt.principalId]))[0] ?? null;
if (APKG) note(`the package ${short(APKG.id)} "${A_TITLE}" stands (${APKG.state}, v${APKG.v}) — an earlier run`);
else {
  const d = await dc(brandt, 'declare', 'decision.package.declare', 'DPK', { decisionObjectId: JAN.dec, title: A_TITLE, statement: 'whether to qualify a second bearing source for the Regensburg line against the corridor closure (SYNTHETIC)', owner: brandt.principalId });
  if (!d.ok) fail('L. Brandt declares the package', d);
  else {
    const id = d.body.package.packageId;
    const o = await dc(brandt, `${id}/versions/open`, 'decision.package.version', 'DPK', { knownAt: new Date(await dbNow()).toISOString(), observedThrough: null }, id);
    if (!o.ok) fail('L. Brandt opens version 1', o);
    else {
      const v = o.body.version.version;
      const steps = await firstFailure([
        () => dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'status-quo', title: 'Keep the single source', kind: 'status_quo', consequences: [{ kind: 'run', id: PAIR.control, version: 1 }], risks: ['one bearing source behind the corridor stops the line when it closes'], opportunities: [] }, id),
        () => dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'morocco', title: 'Dual-source via Morocco', kind: 'intervention', consequences: [{ kind: 'run', id: PAIR.intervention, version: 1 }],
          reversibility: 'the framework contract is cancellable at 90 days', risks: ['the Moroccan lot must clear customs at Tanger Med and at the Hauptzollamt'], opportunities: ['a second source for every corridor future'] }, id),
        () => dc(brandt, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'buffer', title: 'Raise the bearing safety stock', kind: 'intervention', consequences: [], unsimulatedReason: 'no run models a stock increase on the corridor twin (SYNTHETIC)', risks: ['the stock only delays the stop if the closure lasts'], opportunities: [] }, id),
        () => dc(brandt, `${id}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_DEL.id, OBJ_REG.id], constraints: ['bearings clear customs within five days of arrival (the AEO commitment)'],
          approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 }, monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }],
          reversibility: 'reversible until the framework contract is signed', informationValue: 'the Moroccan supplier\'s first-article inspection is worth waiting for if the corridor holds' }, id),
        ]);
      const b1 = steps;
      if (b1) fail('L. Brandt drafts the package (the drafting stopped at the first refusal)', b1);
      else ok(`L. Brandt DECLARED ${short(id)} "${A_TITLE}" on the January decision and DRAFTED v${v}: keep the single source (the promoted corridor control ${short(PAIR.control)}), dual-source via Morocco (act-b24's second-source run ${short(PAIR.intervention)} stands in for its flow), raise the bearing safety stock (unsimulated, said); the objectives "${OBJ_DEL.title}" and "${OBJ_REG.title}"`);
    }
  }
  APKG = (await q(`select package_id::text id, state, current_version v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3 and owner_principal_id = $4 order by declared_at limit 1`, [T, D, A_TITLE, brandt.principalId]))[0] ?? null;
}
const CRITERIA = (over = {}) => [
  { key: 'line_stop', title: 'Line-stop days over the horizon', objectiveId: OBJ_REG.id, direction: 'min', weight: over.line_stop ?? 5, scale: 'ratio', unit: 'days' },
  { key: 'cost', title: 'Landed cost premium', objectiveId: OBJ_DEL.id, direction: 'min', weight: over.cost ?? 3, scale: 'ratio', unit: 'EUR k' },
  { key: 'customs_days', title: 'Customs clearance lead time', objectiveId: OBJ_DEL.id, direction: 'min', weight: over.customs_days ?? 2, scale: 'ratio', unit: 'days' },
];
const fmtRank = (a) => `${(a?.ranking ?? []).join(' > ')} (scores ${(a?.options ?? []).map((o) => `${o.key} ${num(o.score)}`).join(', ')})`;
if (APKG) {
  const V = APKG.v;
  // THE CRITERIA v1 — exposed weights, the value judgment's owner named; the Decision Agent never sets them (refused at the policy, re-asked on every run)
  expectRefused('the Decision Agent sets the weights', await an(agent, `${APKG.id}/versions/${V}/criteria`, 'decision.analysis.criteria', { criteria: CRITERIA(), valueOwner: brandt.principalId, rationale: 'the agent weighs (SYNTHETIC)', expectedVersion: null }, APKG.id), 403);
  let a = await readAnalysis(brandt, APKG.id);
  if ((a?.criteria_version ?? 0) >= 1) note(`the criteria stand at v${a.criteria_version} (value owner ${nm(a.criteria?.[0]?.value_owner)}) — an earlier run`);
  else {
    const r = await an(brandt, `${APKG.id}/versions/${V}/criteria`, 'decision.analysis.criteria', { criteria: CRITERIA(), valueOwner: brandt.principalId, rationale: 'line stops dominate: the quarter\'s objective is a running line; cost and customs follow (SYNTHETIC)', expectedVersion: null }, APKG.id);
    if (!r.ok) fail('L. Brandt sets the criteria', r);
    else ok(`L. Brandt SET the criteria v${r.body.criteria.criteria_version}: ${CRITERIA().map((c) => `${c.key} (${c.direction}, weight ${c.weight}, ${c.unit})`).join(', ')} — the weights a value judgment owned by ${nm(r.body.criteria.value_owner)}`);
  }
  // THE VALUES: line stops COMPUTED from the runs the options cite; the rest ENTERED with a basis by the analyst
  const nAss = (await q(`select count(*)::int n from decision.option_assessments where package_id = $1 and version = $2`, [APKG.id, V]))[0].n;
  if (nAss > 0) note(`${nAss} option assessment(s) stand — an earlier run`);
  else {
    const steps = [
      ['L. Brandt', await an(brandt, `${APKG.id}/versions/${V}/assess`, 'decision.analysis.assess', { option: 'status-quo', criterion: 'line_stop', cited: { kind: 'run', id: PAIR.control, measure: 'line_stop_days' } }, APKG.id)],
      ['L. Brandt', await an(brandt, `${APKG.id}/versions/${V}/assess`, 'decision.analysis.assess', { option: 'morocco', criterion: 'line_stop', cited: { kind: 'run', id: PAIR.intervention, measure: 'line_stop_days' } }, APKG.id)],
      ['A. Hoffmann', await an(hoffmann, `${APKG.id}/versions/${V}/assess`, 'decision.analysis.assess', { option: 'buffer', criterion: 'line_stop', value: 18, basis: 'six weeks of safety stock bridge eleven of the closure\'s line-stop days (SYNTHETIC)' }, APKG.id)],
    ];
    for (const [o, cost, customs] of [['status-quo', 0, 3], ['morocco', 480, 7], ['buffer', 260, 3]]) {
      steps.push(['A. Hoffmann', await an(hoffmann, `${APKG.id}/versions/${V}/assess`, 'decision.analysis.assess', { option: o, criterion: 'cost', value: cost, basis: 'the sourcing desk\'s landed-cost quote for Q1 (SYNTHETIC)' }, APKG.id)]);
      steps.push(['A. Hoffmann', await an(hoffmann, `${APKG.id}/versions/${V}/assess`, 'decision.analysis.assess', { option: o, criterion: 'customs_days', value: customs, basis: 'the customs broker\'s clearance estimate per lane (SYNTHETIC)' }, APKG.id)]);
    }
    const b1 = steps.find(([, x]) => !x.ok);
    if (b1) fail(`${b1[0]} assesses an option`, b1[1]);
    else ok(`the VALUES: line stops COMPUTED from the cited runs (status quo ${num(steps[0][1].body.assessment.value)}, Morocco ${num(steps[1][1].body.assessment.value)} days) by L. Brandt; the stock increase's line stops (18, no run) and every cost (0 / 480 / 260 k€) and customs lead time (3 / 7 / 3 days) ENTERED with their basis by A. Hoffmann`);
  }
  a = await readAnalysis(brandt, APKG.id);
  if (a) {
    const bases = a.options.map((o) => `${o.key}: ${Object.entries(o.bases ?? {}).map(([k, b]) => `${k} ${b}`).join(', ')}`).join('; ');
    (a.options.every((o) => o.rank !== null) ? ok : bad)(`the SERVER'S scores (criteria v${a.criteria_version}): ${fmtRank(a)}; leader ${a.sensitivity?.leader}; the bases — ${bases}`);
  }
  // THE CUSTOMS OBLIGATION (Hauptzollamt, ≤ 5 days) declared and EVALUATED per option by its rule
  const OB = (await q(`select obligation_id::text id from decision.obligations where package_id = $1 and key = 'customs'`, [APKG.id]))[0] ?? null;
  if (OB) note(`the customs obligation ${short(OB.id)} stands — an earlier run`);
  else {
    const r = await dc(brandt, `analysis/packages/${APKG.id}/obligations`, 'decision.analysis.obligation', 'DPK', { key: 'customs', kind: 'obligation', stakeholder: 'Hauptzollamt Regensburg (SYNTHETIC)',
      statement: 'bearings clear customs within five days of arrival (the AEO commitment)', test: { kind: 'threshold', criterion: 'customs_days', op: '<=', value: 5 }, owner: brandt.principalId }, APKG.id);
    if (!r.ok) fail('L. Brandt declares the customs obligation', r); else ok(`L. Brandt DECLARED the obligation "customs" owed to ${r.body.obligation.stakeholder}: customs_days <= 5 (a rule test), owner ${nm(r.body.obligation.owner_principal_id)}`);
  }
  const nEval = (await q(`select count(*)::int n from decision.obligation_evaluations where package_id = $1 and version = $2`, [APKG.id, V]))[0].n;
  if (nEval > 0) note(`${nEval} obligation evaluation row(s) stand — an earlier run`);
  else {
    const r = await an(brandt, `${APKG.id}/versions/${V}/evaluate`, 'decision.analysis.evaluate', { judgments: [] }, APKG.id);
    if (!r.ok) fail('L. Brandt evaluates the obligations', r);
    else ok(`L. Brandt EVALUATED the obligations: ${r.body.evaluation.results.map((x) => `${x.obligation}/${x.option} ${String(x.result).toUpperCase()}`).join(', ')}; violated ${JSON.stringify(r.body.evaluation.violated.map((x) => `${x.obligation} by ${x.option} (owed to ${x.stakeholder})`))}`);
  }
  // THE WEIGHT SENSITIVITY: the weight at which another option takes the lead — ENACTED as v2 (2 % past the smallest flip)
  a = await readAnalysis(brandt, APKG.id);
  if (a && a.criteria_version >= 2) note(`the criteria stand at v${a.criteria_version}: ${fmtRank(a)} — the history ${a.criteria_history.map((h) => `v${h.criteria_version}`).join(', ')} — an earlier run`);
  else if (a) {
    note(`the sensitivity read at v1: leader ${a.sensitivity.leader}; ${a.sensitivity.criteria.map((c) => `${c.key} weight ${num(c.weight)} → ${c.flip_up ? `up to ${num(c.flip_up.weight)} makes ${c.flip_up.to} lead` : 'no flip up'}; ${c.flip_down ? `down to ${num(c.flip_down.weight)} makes ${c.flip_down.to} lead` : 'no flip down'}`).join(' | ')}; most sensitive: ${a.sensitivity.most_sensitive}`);
    const flips = a.sensitivity.criteria.flatMap((c) => [c.flip_up ? { key: c.key, w: Number(c.weight), f: c.flip_up, up: true } : null, c.flip_down ? { key: c.key, w: Number(c.weight), f: c.flip_down, up: false } : null]).filter(Boolean)
      .sort((x, y) => Math.abs(Number(x.f.weight) - x.w) / x.w - Math.abs(Number(y.f.weight) - y.w) / y.w);
    if (flips.length === 0) bad('no weight changes the lead — the sensitivity scene has nothing to enact');
    else {
      const fl = flips[0]; const target = Math.round(Number(fl.f.weight) * (fl.up ? 1.02 : 0.98) * 1e6) / 1e6;
      const r = await an(brandt, `${APKG.id}/versions/${V}/criteria`, 'decision.analysis.criteria', { criteria: CRITERIA({ [fl.key]: target }), valueOwner: brandt.principalId,
        rationale: `after the corridor review the ${fl.key} weight moves past its reported flip (${num(fl.f.weight)}) to ${target} (SYNTHETIC)`, expectedVersion: a.criteria_version }, APKG.id);
      if (!r.ok) fail('L. Brandt sets the criteria v2', r);
      else {
        const c = r.body.criteria;
        (c.ranking_changed && c.ranking_after[0] === fl.f.to ? ok : bad)(`L. Brandt SET v${c.criteria_version}: ${fl.key} ${num(fl.w)} → ${target} (the reported flip ${num(fl.f.weight)}) — the ranking ${c.ranking_before.join(' > ')} → ${c.ranking_after.join(' > ')}; ${fl.f.to} now leads, as the sensitivity said`);
      }
    }
  }
  // THE CANDIDATES (defer, stage, pilot, hedge, acquire information, exit) and THE ASSEMBLY — the Decision Agent's drafts (decision.options untouched)
  const nCand = (await q(`select count(*)::int n from decision.option_candidates where package_id = $1 and version = $2`, [APKG.id, V]))[0].n;
  if (nCand > 0) note(`${nCand} generated candidate(s) stand — an earlier run`);
  else {
    const before = (await q(`select count(*)::int n from decision.options where package_id = $1`, [APKG.id]))[0].n;
    const r = await an(agent, `${APKG.id}/versions/${V}/generate`, 'decision.analysis.generate', {}, APKG.id);
    if (!r.ok) fail('the Decision Agent generates candidates', r);
    else {
      const g = r.body.generation; const after = (await q(`select count(*)::int n from decision.options where package_id = $1`, [APKG.id]))[0].n;
      ok(`the Decision Agent GENERATED ${g.candidates.length} candidate(s) against the leader ${g.leader}: ${g.candidates.map((x) => `${x.posture} "${x.title}" (${x.rule})`).join('; ')}${g.skipped?.length ? `; skipped ${g.skipped.map((x) => x.key).join(', ')}` : ''} — decision.options ${before} → ${after} (untouched; the owner adopts through the option route)`);
    }
  }
  const asm = (await q(`select assembly_id::text id, counts from decision.package_assemblies where package_id = $1 and version = $2 order by assembled_at desc limit 1`, [APKG.id, V]))[0] ?? null;
  if (asm) note(`the assembly ${short(asm.id)} stands (${JSON.stringify(asm.counts)}) — an earlier run`);
  else {
    const r = await an(agent, `${APKG.id}/versions/${V}/assemble`, 'decision.analysis.assemble', {}, APKG.id);
    if (!r.ok) fail('the Decision Agent assembles the package', r);
    else ok(`the Decision Agent ASSEMBLED the package: ${JSON.stringify(r.body.assembly.counts)} — ${[...new Map(r.body.assembly.items.map((i) => [i.kind, i])).values()].map((i) => `${i.kind}: ${(i.why ?? [])[0] ?? ''}`).join('; ')}`);
  }
  a = await readAnalysis(hoffmann, APKG.id);
  if (a) note(`the analysis read by A. Hoffmann: criteria v${a.criteria_version}, ${fmtRank(a)}; violations ${JSON.stringify((a.violations ?? []).map((x) => `${x.obligation}/${x.option}`))}; trade-offs — not dominated ${JSON.stringify(a.tradeoffs?.non_dominated)}; candidates ${(a.candidates ?? []).length}; second-order ${(a.second_order ?? []).map((s) => `${s.option} ${s.validated ? 'validated' : 'not validated'}`).join(', ')}`);
}
ENV_OUT.EYE_B35_ANALYSIS_TITLE = 'Second source for bearings'; ENV_OUT.EYE_B35_ANALYSIS_OWNER = 'l.brandt'; ENV_OUT.EYE_B35_ANALYSIS_PACKAGE = APKG?.id ?? '—';

/* ── B35-R THE RECOMMENDATION ────────────────────────────────────────────────────────── */
console.log('\nB35-R RECOMMENDATION (F-P6-02) — the Decision Agent records "dual-source via Morocco", L. Brandt her own on the stock increase; S. Okafor accepts the agent\'s FOR CONSIDERATION; both say what could make them wrong; side by side');
const RC = 'recommendations';
const recView = async (s, pkg) => { const r = await dc(s, `${RC}/packages/${pkg}`, 'decision.recommendation.read', 'DPK', {}, pkg, READ); return r.ok ? r.body.package : (fail('the recommendation read', r), null); };
let AGENT_REC = null; let OWNER_REC = null;
if (APKG) {
  const V = APKG.v;
  const live = async (author) => (await q(`select recommendation_id::text id, state, option_key, digest from decision.recommendations where package_id = $1 and version = $2 and author_principal_id = $3 and state in ('proposed', 'accepted_for_consideration') order by recorded_at desc limit 1`, [APKG.id, V, author]))[0] ?? null;
  // THE AGENT'S: what, for whom, by when, the assumptions, what could make it wrong, the four components SEPARATED and sourced
  AGENT_REC = await live(agent.principalId);
  if (AGENT_REC) note(`the Decision Agent's recommendation ${short(AGENT_REC.id)} on ${AGENT_REC.option_key} stands (${AGENT_REC.state}) — an earlier run`);
  else {
    const r = await dc(agent, `${RC}/packages/${APKG.id}/versions/${V}/record`, 'decision.recommendation.record', 'DPK', {
      optionKey: 'morocco', what: 'Dual-source the bearings via Morocco beside the incumbent supplier (SYNTHETIC)', forWhom: 'L. Brandt, the decision owner of the Regensburg line\'s bearing supply', byWhen: '2026-11-16',
      assumptions: [{ statement: 'the Moroccan supplier qualifies its first lot within six weeks (SYNTHETIC)' }],
      whatCouldMakeItWrong: [{ statement: 'customs clearance of the Moroccan lot takes longer than the five days owed to the Hauptzollamt (SYNTHETIC)', signpost: 'the broker\'s first clearance time at Tanger Med' },
        { statement: 'the corridor reopens before the second source is qualified, and the premium buys nothing (SYNTHETIC)', signpost: 'the corridor transit forecast' }],
      missingEvidence: [],
      components: {
        valueJudgments: [{ statement: 'delivery reliability outweighs the landed-cost premium this quarter (SYNTHETIC)', source: { kind: 'principal', ref: brandt.principalId } }],
        policyConstraints: [{ statement: 'every second source carries the customs obligation: clearance within five days (SYNTHETIC)', source: { kind: 'obligation', ref: 'customs' } }],
        analyticalAssumptions: [{ statement: 'the second-source run\'s flow stands for the Moroccan lane (SYNTHETIC)', source: { kind: 'stated', ref: 'the analysis of the package' } }],
        modelOutputs: [{ statement: 'the second-source run halves the line-stop days of the single source under the closure (SYNTHETIC)', source: { kind: 'run', ref: PAIR.intervention } },
          { statement: 'the single source under the closure stops the line for the whole window (SYNTHETIC)', source: { kind: 'run', ref: PAIR.control } }],
      } }, APKG.id);
    if (!r.ok) fail('the Decision Agent records its recommendation', r);
    else { const x = r.body.recommendation; ok(`the Decision Agent RECORDED ${short(x.recommendation_id)} on "${x.option_title}" (author kind ${x.author_kind}, ${x.state}; digest ${String(x.digest).slice(0, 12)}…; flags ${JSON.stringify(x.flags ?? [])}; ${x.coverage?.label ?? 'no coverage'})`); }
    AGENT_REC = await live(agent.principalId);
  }
  // THE OWNER'S OWN, on another option
  OWNER_REC = await live(brandt.principalId);
  if (OWNER_REC) note(`L. Brandt's recommendation ${short(OWNER_REC.id)} on ${OWNER_REC.option_key} stands (${OWNER_REC.state}) — an earlier run`);
  else {
    const r = await dc(brandt, `${RC}/packages/${APKG.id}/versions/${V}/record`, 'decision.recommendation.record', 'DPK', {
      optionKey: 'buffer', what: 'Raise the bearing safety stock to six weeks while the second source is qualified (SYNTHETIC)', forWhom: 'the Regensburg plant\'s supply planning', byWhen: '2026-10-30',
      assumptions: [{ statement: 'the warehouse holds six weeks of bearings without a new lease (SYNTHETIC)' }],
      whatCouldMakeItWrong: [{ statement: 'the closure outlasts six weeks of stock and the line stops anyway (SYNTHETIC)', signpost: 'the corridor transit forecast\'s next issue' }],
      missingEvidence: [],
      components: {
        valueJudgments: [{ statement: 'no line stop is acceptable this quarter, and no new supplier risk either (SYNTHETIC)', source: { kind: 'objective', ref: OBJ_REG.id } }],
        policyConstraints: [{ statement: 'the customs obligation is met: the stock comes through the incumbent lane (SYNTHETIC)', source: { kind: 'obligation', ref: 'customs' } }],
        analyticalAssumptions: [{ statement: 'six weeks of stock bridge eleven of the closure\'s line-stop days (SYNTHETIC)', source: { kind: 'stated', ref: 'A. Hoffmann\'s entered value' } }],
        modelOutputs: [{ statement: 'the single source under the closure stops the line for the whole window (SYNTHETIC)', source: { kind: 'run', ref: PAIR.control } }],
      } }, APKG.id);
    if (!r.ok) fail('L. Brandt records her recommendation', r);
    else { const x = r.body.recommendation; ok(`L. Brandt RECORDED ${short(x.recommendation_id)} on "${x.option_title}" (author kind ${x.author_kind}, ${x.state})`); }
    OWNER_REC = await live(brandt.principalId);
  }
  // THE REVIEW: the agent never reviews (the policy); S. Okafor (decision approver, not the author) ACCEPTS the agent's FOR CONSIDERATION, the comparison read at review
  if (OWNER_REC) expectRefused('the Decision Agent reviews L. Brandt\'s recommendation', await dc(agent, `${RC}/${OWNER_REC.id}/review`, 'decision.recommendation.review', 'REC', { verdict: 'decline', rationale: 'the agent tries to review (SYNTHETIC)' }, OWNER_REC.id), 403);
  if (AGENT_REC && AGENT_REC.state === 'accepted_for_consideration') note(`the agent's recommendation was accepted for consideration — an earlier run`);
  else if (AGENT_REC) {
    const r = await dc(okafor, `${RC}/${AGENT_REC.id}/review`, 'decision.recommendation.review', 'REC', { verdict: 'accept_for_consideration',
      rationale: 'The Morocco source is worth weighing beside the owner\'s stock increase; both say what could make them wrong (SYNTHETIC).', expectedDigest: AGENT_REC.digest }, AGENT_REC.id);
    if (!r.ok) fail('S. Okafor reviews the agent\'s recommendation', r);
    else ok(`S. Okafor ACCEPTED the agent's recommendation FOR CONSIDERATION → ${r.body.review.state} (not a decision); the comparison read at review: ${(r.body.review.comparison ?? []).map((c) => `${short(c.recommendation_id)} ${c.author_kind} on ${c.option_key ?? '?'}`).join(', ')}`);
  }
  const v = await recView(hoffmann, APKG.id);
  if (v) {
    const card = (r) => `${r.author_kind === 'agent' ? 'THE DECISION AGENT' : nm(r.author_principal_id)} on ${r.option_key} — ${r.state}; what could make it wrong: ${(r.what_could_make_it_wrong ?? []).map((w) => `"${w.statement}"`).join('; ')}; components ${Object.entries(r.components ?? {}).map(([k, x]) => `${k} ${x.length}`).join(', ')}; ${r.coverage?.label ?? 'no coverage'}`;
    const live2 = (v.recommendations ?? []).filter((r) => ['proposed', 'accepted_for_consideration'].includes(r.state));
    ((v.side_by_side?.agent?.length ?? 0) > 0 && (v.side_by_side?.human?.length ?? 0) > 0 ? ok : bad)(`SIDE BY SIDE (read by A. Hoffmann, v${v.side_by_side?.version}): ${live2.map(card).join(' ‖ ')}`);
    note(`the completeness of v${V}: ${v.completeness?.mode ?? '—'} (complete ${v.completeness?.complete}); gaps ${JSON.stringify((v.completeness?.gaps ?? []).map((g) => g.key))}; advisories ${JSON.stringify((v.completeness?.advisories ?? []).map((g) => g.category))}`);
  }
}
ENV_OUT.EYE_B35_REC_TITLE = 'Second source for bearings'; ENV_OUT.EYE_B35_REC_OWNER = 'l.brandt'; ENV_OUT.EYE_B35_REC_REVIEWER = 's.okafor';
ENV_OUT.EYE_B35_REC_AGENT = AGENT_REC?.id ?? '—'; ENV_OUT.EYE_B35_REC_OWN = OWNER_REC?.id ?? '—';

/* ── B35-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB35-9 THE STATE and the LIMITS');
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
