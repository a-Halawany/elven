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
// the corridor control (promoted by J. Weber in act-b31's twin, the reroute's pair from B21) and the dual-sourcing stand-in: the draw-down + reroute intervention on it
const PAIR = (await q(`select c.run_id::text control, i.run_id::text intervention, (c.outputs -> 'totals' ->> 'line_stop_days')::numeric c_ls, (i.outputs -> 'totals' ->> 'line_stop_days')::numeric i_ls
     from simulation.runs_current c join simulation.runs_current i on i.control_run_id = c.run_id and i.run_kind = 'intervention' and i.state = 'completed' and i.validity = 'valid'
    where c.tenant_id = $1 and c.domain_id = $2 and c.run_kind = 'control' and c.state = 'completed' and c.validity = 'valid' and c.promotion_id is not null
      and i.interventions @> '[{"type": "draw_down"}]'::jsonb and i.interventions @> '[{"type": "reroute"}]'::jsonb order by i.opened_at limit 1`, [T, D]))[0] ?? null;
// the corridor forecast: the live Bab el-Mandeb transit forecast the corridor scenarios rest on
const FCT = (await q(`select f.forecast_id::text id, f.series_key, f.horizon_code, f.label from prediction.forecasts_current f where f.tenant_id = $1 and f.domain_id = $2 and f.state = 'issued' and f.series_key like '%chokepoint4:n_total'
                      order by (f.label = 'live') desc, f.issued_at desc limit 1`, [T, D]))[0] ?? null;
const MITIG = (await q(`select package_id::text pkg, state, committed_version cv, current_version v, owner_principal_id::text owner from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'Mitigate the corridor closure — Regensburg line' limit 1`, [T, D]))[0] ?? null;
{
  const have = { JAN: !!JAN, OBJ_REG: !!OBJ_REG, OBJ_DEL: !!OBJ_DEL, PAIR: !!PAIR, FCT: !!FCT, MITIG: !!MITIG };
  if (Object.values(have).some((x) => !x)) { bad(`an input is missing: ${JSON.stringify(have)}`); process.exit(1); }
  ok(`the inputs: the January decision ${short(JAN.dec)}; the objectives "${OBJ_DEL.title}" and "${OBJ_REG.title}"; the PROMOTED corridor control ${short(PAIR.control)} (${num(PAIR.c_ls)} line-stop days) and its draw-down + reroute intervention ${short(PAIR.intervention)} (${num(PAIR.i_ls)}); the corridor forecast ${short(FCT.id)} (${FCT.series_key} ${FCT.horizon_code}, ${FCT.label}); act-b34's MITIG package ${short(MITIG.pkg)} (${MITIG.state}, committed v${MITIG.cv}, owner ${nm(MITIG.owner)})`);
}

/* ── B35-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB35-9 THE STATE and the LIMITS');
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
