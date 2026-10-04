#!/usr/bin/env node
/**
 * CP-6 batch B91 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): USAGE METERING, THE
 * COST LEDGER, ENTITLEMENTS AND LICENSING (migration 0105; F-P7-F-01 and F-P7-F-02 complete) — exercised by the personas through the REAL
 * HTTP path, each scene stating the effect it produced in the ledgers. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each
 * scene first reads what an earlier run left and says "stands — an earlier run" instead of writing it twice. No clock is moved; nothing is
 * planted: every row is a persona's governed act or the attention agent's real scheduled tick (every 60 s on the demonstration — its steps
 * commercial-licence-lapse (80), the storage sample (81) and commercial-ledger (82) run inside it; the act WAITS for the ticks).
 *
 *   B91-0 THE STATE: 0104 and 0105 applied; the casting read from identity.role_bindings (T. Nakamura twin_owner, M. Dvořák executive,
 *         T. Richter domain_admin, the tenant's auditor E. Lindqvist, A. Hoffmann and L. Ferreira for the inference path); the attention agent
 *         and its ticks; the extraction agent; the promoted corridor control (a completed supply-flow@1 run on actual) the sweep uses.
 *   B91-P THE TWO NEW PERSONAS (the only ones this act creates, through the platform administrator's governed principal routes): the vendor's
 *         COMMERCIAL AUTHORITY C. Marchetti (commercial_authority, PLATFORM) and NORDWERK's TENANT ADMINISTRATOR N. Vogel (tenant_admin,
 *         TENANT). A persona that cannot be created through a governed route STOPS the act — no identity row is ever planted.
 *   B91-A THE ROUTING: M. Dvořák publishes the next version of the corridor domain's attention policy — commercial.usage → the tenant
 *         administrator and the budget owner's role (executive), commercial.entitlement → the tenant administrator; every other class kept.
 *         Only the commercial.entitlement notices are evaluated against it; the commercial.usage notices are routed by their ports.
 *   B91-M F-P7-F-02, while NORDWERK is still UNCONTRACTED (no licence: the availability gate does not apply): the vendor's SYNTHETIC rate
 *         cards (simulation_compute wall_ms, model_inference calls, storage bytes); N. Vogel's month budget (all capabilities, owner
 *         M. Dvořák); MODEL INFERENCE through a real governed path (A. Hoffmann uploads a SYNTHETIC shipment record to the NORDWERK internal
 *         source → the plan → the extraction agent's run → the model gateway, replay mode, its fixture recorded by L. Ferreira); T. Nakamura's
 *         E. Kovács's discrete-event experiment (J. Weber approves its budget; one chunk a tick — its first chunk run by the tick, metered);
 *         T. Nakamura's envelope sweep of the corridor control (metered); N. Vogel's simulation_compute STOP cap (day) at the day's usage and
 *         a model_inference WARN cap; the attention agent's next claim stops the experiment PARTIAL (tenant_cap, the chunk kept); T. Nakamura's
 *         next sweep REFUSED 409 `usage cap rejected (cap)` — the breach recorded and explained; the tick prices the usage; the budget
 *         (sized from the month's priced spend) shows its variance and raises its threshold to M. Dvořák; the commercial.usage item routed by
 *         its port; the vendor's SYNTHETIC invoice of the day's ledger totals imported and reconciled.
 *   B91-L F-P7-F-01: the vendor's package foresight-decision (Foresight, Decision and every non-simulation capability the demonstration uses —
 *         NOT Simulation), its SKU, the licence issued to NORDWERK with a term that ENDS WITHIN THE ACT; T. Nakamura's simulation write REFUSED
 *         403 EYE_ENT_001 (Simulation named, the licence version, what stays available); the controls that stay (M. Dvořák reads the
 *         commercial.usage item, the auditor reads the refusal in the audit ledger, the corridor run reads); the term ends and the tick moves
 *         the licence to GRACE with the last valid entitlement and grace_until; the commercial.entitlement item routed to the tenant
 *         administrator, who ACKNOWLEDGES it; the licence standing shows grace and the last valid entitlement. The offline token is SKIPPED unless an
 *         EYE_LICENCE_SIGNING_KEY_* reference is in the environment (never written).
 *   B91-9 THE STATE, the env lines for the four walks, the LIMITS said.
 *
 *   --restore (run AFTER the walks): the vendor issues a FULL licence (every built capability, Simulation included, no term end); N. Vogel
 *         raises the simulation_compute cap (a new version: warn, generous); T. Nakamura's simulation write is available again. Rerun-safe;
 *         every scene's record kept (history is never deleted).
 *
 * Every figure is SYNTHETIC (the rates, the budget, the caps, the order references, the shipment record). Nothing prints a credential: the
 * personas' passwords are EYE_TEST_ADMIN_PASSWORD from the environment, as every other persona's.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';
import { buildFixtures as supplyFixtures } from '../phase3/build-graph-fixtures.mjs';

// The act may live in a worktree without .eye-local: the RUNTIME root is the tree it runs from (the main tree), the code's own root otherwise.
const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const RESTORE = process.argv.includes('--restore');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const S = `${X}/simulations`; const FB = `${S}/fabric`; const E = `${X}/executive/attention`;
const O = `${X}/observation`; const I = `${X}/intelligence`; const TC = `/v1/tenants/${T}/commercial`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.code ?? ''} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 300)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const num = (v) => (v === null || v === undefined ? null : Number(v));
const tStart = Date.now();
console.log(`THE B91 ACT${RESTORE ? ' --restore' : ''} on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re, code) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? ''))) && (code === undefined || r.body?.code === code)) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${status}${code ? ` ${code}` : ''} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
/** Poll every `every` ms until `done(probe())` or the deadline; the last read answered either way (a note when it timed out). */
async function waitFor(what, probe, done, ms, every = 3000) {
  const until = Date.now() + ms; let last = null;
  while (Date.now() < until) { last = await probe(); if (done(last)) return last; await sleep(every); }
  note(`${what}: not within ${Math.round(ms / 1000)} s (the last read ${JSON.stringify(last).slice(0, 200)})`); return last;
}
const ENV_OUT = {};
// envelopes: the domain's (as()), the tenant's (TENANT scope, no domain), the vendor's (PLATFORM)
const dom = (s, purpose, over) => as(s, scope, { purposeId: purpose, consequence: 'C2', ...over });
const ten = (s, over) => ({ scope: 'TENANT', tenantId: T, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'commercial', consequence: 'C2', ...over });
const plat = (s, over) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'commercial', consequence: 'C2', ...over });
const READ = { sideEffect: 'none' };

/* ── B91-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB91-0 THE STATE — 0104 and 0105, the casting, the attention agent, the corridor run');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0104%' or filename like '0105%' order by 1`);
  if (m.length === 2) ok(`migrations applied: ${m.map((x) => x.filename).join(', ')}`); else { bad(`0104 and 0105 are not both applied (${m.map((x) => x.filename).join(', ') || 'neither'})`); process.exit(1); }
}
const CAST = { 't.nakamura': ['twin_owner'], 'm.dvorak': ['executive'], 't.richter': ['domain_admin'], 'a.hoffmann': ['domain_analyst'], 'l.ferreira': ['extraction_manager'],
  'e.kovacs': ['twin_owner'], 'j.weber': ['strategy_owner'] };
const AUDITOR_LOGIN = 'e.lindqvist';
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')} — no role is granted`); process.exit(1); }
  const aud = (await q(`select p.login_name from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.role_code = 'auditor' and b.scope = 'TENANT' and b.tenant_id = $1 and p.kind = 'human' and p.status = 'active' and p.login_name = $2`, [T, AUDITOR_LOGIN]))[0] ?? null;
  if (aud) ok(`the tenant's auditor: ${AUDITOR_LOGIN} (auditor, TENANT) — the audit read of B91-L`); else note(`no tenant auditor ${AUDITOR_LOGIN} — the audit read falls to the tenant administrator`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const nakamura = await who('t.nakamura'); const dvorak = await who('m.dvorak'); const richter = await who('t.richter'); const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira');
const kovacs = await who('e.kovacs'); const weber = await who('j.weber');
const auditor = await login(AUDITOR_LOGIN, PW);
const NAME = { [nakamura.principalId]: 'T. Nakamura', [dvorak.principalId]: 'M. Dvořák', [richter.principalId]: 'T. Richter', [hoffmann.principalId]: 'A. Hoffmann', [ferreira.principalId]: 'L. Ferreira', [kovacs.principalId]: 'E. Kovács', [weber.principalId]: 'J. Weber', [admin.principalId]: 'the administrator' };
if (auditor) NAME[auditor.principalId] = 'E. Lindqvist';
const nm = (id) => NAME[id] ?? short(id);
// THE ATTENTION AGENT: the tick's host — its scheduled ticks run the licence lapse, the storage sample and the ledger
const ATT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (ATT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
NAME[ATT.principal_id] = 'the attention agent';
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [ATT.agent_id]))[0];
  (last.n > 0 ? ok : bad)(`the attention agent ${short(ATT.agent_id)} — cadence ${ATT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${iso(last.t)})` : ''} — the act waits for its ticks, it calls no tick route`);
}
/** The first attention tick that started after `mark` and finished. */
const tickAfter = async (mark) => (await q(`select run_id::text id, started_at, finished_at, outcome from executive.agent_runs
                                             where agent_id = $1 and task = 'attention_tick' and started_at > $2 and finished_at is not null order by started_at limit 1`, [ATT.agent_id, mark]))[0] ?? null;
const XAGENT = (await q(`select agent_id::text, principal_id::text, budgets from intelligence.extraction_agents where tenant_id = $1 and domain_id = $2 and status = 'active' limit 1`, [T, D]))[0] ?? null;
if (XAGENT) { NAME[XAGENT.principal_id] = 'the extraction agent'; ok(`the extraction agent ${short(XAGENT.agent_id)} is active — the plan worker runs an upload's extraction under it (the inference path)`); }
else note('no active extraction agent — the inference path cannot run here (said in the LIMITS)');
// THE CORRIDOR RUN: the promoted corridor control — completed, supply-flow@1, on actual, inside the envelope, never retired
const TWIN_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const CORRIDOR = (await q(`select r.run_id::text id, r.model_ref, r.opened_at, r.twin_version from simulation.runs_current r join twin.twins_current t on t.twin_id = r.twin_id
                             join twin.twin_versions v on v.twin_id = r.twin_id and v.version = r.twin_version and v.branch_id = 'actual'
                            where r.tenant_id = $1 and r.domain_id = $2 and t.title = $3 and r.state = 'completed' and r.run_kind = 'control' and r.model_ref = 'supply-flow@1'
                              and coalesce(r.envelope_state, 'inside') = 'inside' and r.validity = 'valid' and r.retired_at is null
                            order by (r.promotion_id is not null) desc, r.opened_at desc limit 1`, [T, D, TWIN_TITLE]))[0] ?? null;
if (CORRIDOR === null) { bad(`no completed corridor control of "${TWIN_TITLE}" for the envelope sweep`); process.exit(1); }
ok(`the corridor run ${short(CORRIDOR.id)}: a completed ${CORRIDOR.model_ref} control of "${TWIN_TITLE}" on actual v${CORRIDOR.twin_version} (opened ${iso(CORRIDOR.opened_at)}) — the envelope sweep's input`);
ENV_OUT.EYE_B91_CORRIDOR_RUN = CORRIDOR.id;

/* ── B91-P THE TWO NEW PERSONAS ──────────────────────────────────────────────────────── */
console.log('\nB91-P THE TWO NEW PERSONAS — the vendor\'s commercial authority (PLATFORM) and NORDWERK\'s tenant administrator (TENANT), through the governed principal routes');
const VENDOR_LOGIN = 'c.marchetti'; const VENDOR_NAME = 'C. Marchetti — the vendor\'s commercial authority (SYNTHETIC)';
const TADMIN_LOGIN = 'n.vogel'; const TADMIN_NAME = 'N. Vogel — NORDWERK tenant administrator (SYNTHETIC)';
const holds = async (login_, role, sc) => (await q(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                                                    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
                                                      and (b.scope = 'PLATFORM' or b.tenant_id = $4)`, [login_, role, sc, T]))[0].n > 0;
let vendor = null;
if (await holds(VENDOR_LOGIN, 'commercial_authority', 'PLATFORM')) {
  vendor = await login(VENDOR_LOGIN, PW);
  if (vendor === null) { bad(`${VENDOR_LOGIN} holds commercial_authority but its credential does not open its session — not reused by name alone`); process.exit(1); }
  note(`${VENDOR_NAME.split(' — ')[0]} (commercial_authority, PLATFORM) is present — an earlier run`);
} else {
  // A PLATFORM principal: the platform administrator's governed route for one. The tenant route (/v1/tenants/:t/principals) makes TENANT or
  // DOMAIN principals only (identity.enforce_binding_authority refuses a PLATFORM binding to a tenant principal, and the PDP and
  // commercial.cgr_assert_commercial require commercial_authority AT PLATFORM) — so the vendor is created here or NOWHERE.
  const r = await call('/v1/platform/principals', { scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
    action: 'identity.principal.create', objectType: 'PRN' }, { kind: 'human', displayName: VENDOR_NAME, loginName: VENDOR_LOGIN, password: PW, roleCode: 'commercial_authority' }, admin.token);
  if (r.ok || r.status === 409) {
    vendor = await login(VENDOR_LOGIN, PW);
    if (vendor !== null && await holds(VENDOR_LOGIN, 'commercial_authority', 'PLATFORM')) ok(`the administrator ${r.ok ? 'CREATED' : 'found'} ${VENDOR_NAME.split(' — ')[0]} through the governed PLATFORM principal route — role commercial_authority at the PLATFORM`);
    else { bad(`${VENDOR_LOGIN}: the route answered ${r.status} but no session holding commercial_authority at the PLATFORM opens`); process.exit(1); }
  } else {
    bad(`THE VENDOR CANNOT BE CREATED THROUGH A GOVERNED ROUTE: POST /v1/platform/principals answered ${refusalLine(r)}. The only principal route the platform administrator has is POST /v1/tenants/:tenantId/principals, which creates a TENANT or DOMAIN principal (its scope is the request's tenant); a commercial_authority binding must be PLATFORM-scoped (the PDP's commercial.* rules and commercial.cgr_assert_commercial require it, and identity.enforce_binding_authority refuses a PLATFORM binding to a tenant principal). The database port identity.create_principal already admits a PLATFORM principal in a PLATFORM context; no HTTP route reaches it. STOPPED as the brief requires — no identity row is planted, the tenant administrator is NOT created either (nothing half-made).`);
    await su.end(); console.log(`\n${failureCount()} FAILURE(S) · STOPPED at B91-P · ${((Date.now() - tStart) / 1000).toFixed(1)} s`); process.exit(Math.min(failureCount(), 255));
  }
}
NAME[vendor.principalId] = 'C. Marchetti';
let tadmin = null;
{
  const r = await createPersona(admin, T, { displayName: TADMIN_NAME, loginName: TADMIN_LOGIN, password: PW, roleCode: 'tenant_admin' });
  if (r.session === null) { bad(`${TADMIN_NAME} could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (!(await holds(TADMIN_LOGIN, 'tenant_admin', 'TENANT'))) { bad(`${TADMIN_LOGIN} opens a session but holds no tenant_admin at NORDWERK's TENANT scope`); process.exit(1); }
  tadmin = r.session;
  if (r.created) ok(`the administrator CREATED ${TADMIN_NAME.split(' — ')[0]} through the governed principal route — role tenant_admin at the TENANT`); else note(`${TADMIN_NAME.split(' — ')[0]} (tenant_admin, TENANT) is present — an earlier run`);
}
NAME[tadmin.principalId] = 'N. Vogel';
ENV_OUT.EYE_B91_VENDOR = VENDOR_LOGIN; ENV_OUT.EYE_B91_COMMERCIAL = VENDOR_LOGIN; ENV_OUT.EYE_B91_TENANT_ADMIN = TADMIN_LOGIN;
ENV_OUT.EYE_B91_OPERATOR = 't.nakamura'; ENV_OUT.EYE_B91_EXECUTIVE = 'm.dvorak'; ENV_OUT.EYE_B91_READER = 't.richter';

// the licence the tenant is entitled by now (its newest non-superseded version), and the history
const liveLicence = async () => (await q(`select licence_id::text, version, package_key, state, capabilities, limits, effective_from, effective_to, grace_until, last_valid, issued_at
                                           from commercial.licences where tenant_id = $1 and state <> 'superseded' order by issued_at desc, version desc limit 1`, [T]))[0] ?? null;
const FD_PKG = 'foresight-decision'; const FULL_PKG = 'full-platform';
const FD_SKU = 'EYE-FD-12M'; const FULL_SKU = 'EYE-FULL-12M';
const versionOf = async (pkg) => (await q(`select licence_id::text, version, state, issued_at, effective_to, grace_until, last_valid from commercial.licences where tenant_id = $1 and package_key = $2 order by version desc limit 1`, [T, pkg]))[0] ?? null;

if (!RESTORE) {
/* ── B91-A THE ROUTING ───────────────────────────────────────────────────────────────── */
console.log('\nB91-A THE ROUTING — the corridor domain\'s attention policy routes commercial.usage and commercial.entitlement; every other class kept');
{
  const ROUTES = { 'commercial.usage': ['tenant_admin', 'executive'], 'commercial.entitlement': ['tenant_admin'] };
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const routed = (rules) => Object.entries(ROUTES).every(([c, roles]) => JSON.stringify(rules?.classes?.[c]?.route_roles ?? []) === JSON.stringify(roles));
  if (active === null) bad('no active attention policy on the corridor domain (act-b22…b90 publish versions 1–8)');
  else if (routed(active.rules)) note(`attention policy version ${active.version} routes commercial.usage → [${ROUTES['commercial.usage'].join(', ')}] and commercial.entitlement → [${ROUTES['commercial.entitlement'].join(', ')}] — an earlier run`);
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    rules.classes['commercial.usage'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ROUTES['commercial.usage'], ack_within_minutes: 1440, notify: 'in_app' };
    rules.classes['commercial.entitlement'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ROUTES['commercial.entitlement'], ack_within_minutes: 1440, notify: 'in_app' };
    const r = await call(`${E}/policy/publish`, dom(dvorak, 'executive', { action: 'executive.attention.policy.publish', objectType: 'ATP' }), { rules,
      reason: 'B91: the commercial classes — commercial.usage to the tenant administrator and the budget owner (executive), commercial.entitlement to the tenant administrator; every earlier class unchanged (SYNTHETIC).' }, dvorak.token);
    // the published route matters for commercial.entitlement (§GR's notices are evaluated against the policy); the commercial.usage notices
    // of the meters and the ledger are routed by their ports (the named owner and tenant_admin) whatever the policy says — published for the class
    if (!r.ok) fail('M. Dvořák publishes the attention policy', r);
    else {
      const pub = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0];
      const kept = Object.keys(active.rules.classes).filter((c) => JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c]));
      const others = Object.keys(active.rules).filter((k) => k !== 'classes').every((k) => JSON.stringify(pub.rules[k]) === JSON.stringify(active.rules[k]));
      (kept.length === Object.keys(active.rules.classes).length && others && routed(pub.rules) ? ok : bad)(`M. Dvořák PUBLISHED attention policy VERSION ${pub.version} (supersedes ${active.version}): + commercial.usage → [${ROUTES['commercial.usage'].join(', ')}], commercial.entitlement → [${ROUTES['commercial.entitlement'].join(', ')}]; ${kept.length} of ${Object.keys(active.rules.classes).length} earlier classes byte-identical, the other sections ${others ? 'unchanged' : 'CHANGED'}`);
    }
  }
}

/* ── B91-M (F-P7-F-02) ───────────────────────────────────────────────────────────────── */
console.log('\nB91-M (F-P7-F-02) — the corridor sweep\'s metered compute and model inference against the tenant budget; the cap stops the sweep with a recorded, explained breach');
const RATE_KEYS = { simulation_compute: 'wall_ms', model_inference: 'calls', storage: 'bytes' };
const BUDGET_LABEL = 'NORDWERK — every metered capability, monthly (SYNTHETIC)';
const OR = `${S}/orchestration`;
const EXP_TITLE = 'Regensburg line — bearing shortage at the tenant cap (SYNTHETIC)';
const DES_TITLE = 'Regensburg plant — line 1 and its bearing supply (discrete-event study)';
const expRow = async () => (await q(`select experiment_id::text id, state, run_id::text run, progress, approved_by::text approved_by from simulation.experiments where tenant_id = $1 and domain_id = $2 and title = $3 order by declared_at desc limit 1`, [T, D, EXP_TITLE]))[0] ?? null;
const sweepOf = (s, payload = { gridPoints: 5 }) => call(`${FB}/runs/${CORRIDOR.id}/sweep`, dom(s, 'simulation', { action: 'simulation.sweep.run', objectType: 'SIM', objectId: CORRIDOR.id }), payload, s.token);
const refusedSweep = async () => (await q(`select breach_id::text, cap_id::text, cap_version, kind, cap_limit, used, period_start, subject_kind, details, attention_item_id, occurred_at, correlation_id::text
                                            from commercial.cap_breaches where tenant_id = $1 and dimension = 'simulation_compute' and kind = 'refused' and subject_kind = 'envelope_sweep' order by occurred_at limit 1`, [T]))[0] ?? null;
let REFUSED = await refusedSweep();
const contractedNow = (await liveLicence()) !== null;
if (REFUSED) note(`the refused sweep's breach ${short(REFUSED.breach_id)} stands — an earlier run (${iso(REFUSED.occurred_at)}): the scene's writes are not repeated; its records are asserted below`);
else if (contractedNow) bad('NORDWERK already holds a licence and no B91-M breach stands: the uncontracted scene cannot be staged on this database (it runs before B91-L on a fresh copy)');
else {
  // 1. THE RATE CARDS (the vendor; SYNTHETIC) — in force from the start of the database's month, so this month's usage is priced
  const monthStart = (await q(`select (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') t`))[0].t;
  const RATES = [
    { dimension: 'simulation_compute', unit: 'wall_ms', pricePerUnit: '0.00005', energyKwhPerUnit: '0.0000000833', energyBasis: 'SYNTHETIC: 300 W per compute second, an engineering estimate, not metered', reason: 'the corridor sweep compute price — 0.05 EUR per compute second (SYNTHETIC)' },
    { dimension: 'model_inference', unit: 'calls', pricePerUnit: '0.02', reason: 'model inference per gateway call — tokens are not recorded (SYNTHETIC)' },
    { dimension: 'storage', unit: 'bytes', pricePerUnit: '0.000000001', reason: 'evidence storage per sampled byte — 1 EUR per GB-sample (SYNTHETIC)' },
  ];
  for (const rc of RATES) {
    const cur = (await q(`select version, price_per_unit, effective_from from commercial.rate_cards where rate_key = $1 order by version desc limit 1`, [`${rc.dimension}:${rc.unit}`]))[0] ?? null;
    if (cur) { note(`the rate card ${rc.dimension}:${rc.unit} v${cur.version} (${cur.price_per_unit} EUR per ${rc.unit}, from ${iso(cur.effective_from)}) stands — an earlier run`); continue; }
    const r = await call('/v1/commercial/ledger/rate-cards/set', plat(vendor, { action: 'commercial.rate.set', objectType: 'CRC' }), { ...rc, currency: 'EUR', effectiveFrom: new Date(monthStart).toISOString(), synthetic: true }, vendor.token);
    if (!r.ok) fail(`C. Marchetti sets the ${rc.dimension} rate card`, r);
    else ok(`C. Marchetti (commercial authority) SET the rate card ${r.body.rateCard.rate_key} v${r.body.rateCard.version}: ${r.body.rateCard.price_per_unit} ${r.body.rateCard.currency} per ${rc.unit} from ${iso(r.body.rateCard.effective_from)}${r.body.rateCard.energy_label ? ` (energy ${r.body.rateCard.energy_kwh_per_unit} kWh per unit, an ${r.body.rateCard.energy_label})` : ''} — SYNTHETIC ${r.body.rateCard.synthetic}`);
  }
  // 2. THE BUDGET (the tenant administrator): the month, every capability, owned by M. Dvořák. Its amount is set from what the ledger holds
  // once the attention agent's tick has priced the month's usage so far (the storage samples) — so that its 80 % threshold is reached by
  // the scene's own usage (the phase6-ledger-b91 L3 rule: amount = spent / 0.9). SYNTHETIC.
  const cur = (await q(`select budget_id::text, version, amount from commercial.budgets where tenant_id = $1 and domain_id is null and capability_key = 'all' and period_kind = 'month' order by version desc limit 1`, [T]))[0] ?? null;
  if (cur) note(`the month budget ${short(cur.budget_id)} v${cur.version} (${cur.amount} EUR) stands — an earlier run`);
  else {
    const spentNow = async () => num((await q(`select coalesce(sum(amount), 0) s from commercial.cost_entries where tenant_id = $1 and currency = 'EUR' and occurred_at >= (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC')`, [T]))[0].s);
    let spent = await spentNow();
    if (spent === 0) { note(`waiting for the attention agent's tick to price the month's usage under the new rate cards (the ledger step, every ${ATT.budgets?.tick_every_seconds ?? 60} s)`); spent = await waitFor('the first pricing', spentNow, (x) => x > 0, 180_000, 5000); }
    const amount = spent > 0 ? Math.max(0.01, Math.ceil((spent / 0.9) * 100) / 100) : 1;
    const r = await call(`${TC}/ledger/budgets/set`, ten(tadmin, { action: 'commercial.budget.set', objectType: 'CBG' }), { label: BUDGET_LABEL, capabilityKey: 'all', periodKind: 'month', amount: amount.toFixed(2), currency: 'EUR',
      ownerPrincipalId: dvorak.principalId, reason: 'the tenant\'s monthly budget for metered compute, inference and storage — sized so the demonstration reaches its threshold (SYNTHETIC)' }, tadmin.token);
    if (!r.ok) fail('N. Vogel sets the month budget', r);
    else ok(`N. Vogel (tenant administrator) SET the budget "${r.body.budget.label}" v${r.body.budget.version}: ${r.body.budget.amount} ${r.body.budget.currency} a ${r.body.budget.period_kind} (the month's priced spend ${Number(spent).toFixed(4)} EUR is ${(100 * spent / amount).toFixed(1)} % of it), capability ${r.body.budget.capability_key}, owner ${nm(r.body.budget.owner_principal_id)}, thresholds ${JSON.stringify(r.body.budget.thresholds)} — SYNTHETIC`);
  }
  // 3. MODEL INFERENCE: a real governed path that calls the model gateway — an upload → the plan → the extraction agent's run (replay mode)
  if (XAGENT === null) note('no extraction agent: model inference is not exercised here (said in the LIMITS)');
  else {
    const src = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-internal' order by source_id, contract_version desc`, [T, D]))[0] ?? null;
    const FILE = 'shipments-2024Q1-b91-metering.csv';
    const csv = ['synthetic,shipment_id,component_id,qty,vessel,position_at_window_open,eta_rotterdam,status',
      'true,SYN-SHIP-4491,SYN-PART-BRG,18000,MV Hanse Meridian,Gulf of Aden,2024-02-06,at risk',
      'true,SYN-SHIP-4492,SYN-PART-MAG,7200,MV Nordlicht,Ningbo,2024-03-01,bookable', ''].join('\n');
    const bytes = Buffer.from(csv, 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (src === null || src.lifecycle_state !== 'active') note('the NORDWERK internal upload source is not active — the inference path is not staged');
    else {
      const mark = await dbNow();
      const up = await call(`${O}/upload`, dom(hoffmann, 'observation', { action: 'observation.run.trigger', objectType: 'RUN', consequence: 'C1' }),
        { sourceId: src.source_id, contractVersion: Number(src.contract_version), files: [{ filename: FILE, mediaType: 'text/csv; charset=utf-8', base64: bytes.toString('base64'), documentTime: null }] }, hoffmann.token);
      if (!up.ok) fail('A. Hoffmann uploads the shipment record', up);
      else {
        note(`A. Hoffmann UPLOADED "${FILE}" (a SYNTHETIC shipment record, ${bytes.length} bytes) to the NORDWERK internal source: run ${short(up.body.run?.runId)} ${up.body.run?.state} — ${up.body.run?.admitted} admitted, ${up.body.run?.noop} unchanged`);
        const evd = (await q(`select object_id::text, object_version::int v, payload ->> 'locator' locator, payload ->> 'content_digest' digest from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and payload ->> 'content_digest' = $3 order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
        if (evd === null) bad(`no evidence object carries the upload's digest ${digest.slice(0, 12)}…`);
        else {
          // the replay fixture recorded at once (the B24 precedent): the method's own builder, recorded_from 'fixture' — no model runs here
          const fx = supplyFixtures([{ itemKey: evd.locator, contentDigest: evd.digest, excerpt: bytes.toString('utf8').slice(0, 8000) }]);
          const rec = await call(`${I}/gateway/record`, dom(ferreira, 'intelligence', { action: 'intelligence.gateway.call', objectType: 'GWC' }), { recordings: fx.map((f) => ({ requestDigest: f.request_digest, response: f.response, modelId: f.model_id, runtimeVersion: f.runtime_version })) }, ferreira.token);
          if (rec.ok) note(`L. Ferreira (extraction manager) RECORDED the replay fixture for evidence ${short(evd.object_id)}@${evd.v} (${rec.body.recordings.stored} stored, ${rec.body.recordings.existing} already present) — written by the method's fixture builder: the gateway answers in REPLAY mode, no external model`);
          else fail('L. Ferreira records the replay fixture', rec);
          const calls = await waitFor('the extraction agent\'s gateway call', async () => q(`select g.call_id::text, g.mode, g.outcome, g.latency_ms, g.run_id::text from intelligence.gateway_calls g join intelligence.plan_executions x on x.run_id = g.run_id
                                                                                               where x.evd_object_id = $1 and g.occurred_at > $2`, [evd.object_id, mark]), (x) => x.length > 0, 300_000, 5000);
          if (calls.length > 0) ok(`THE MODEL GATEWAY WAS CALLED by the extraction agent's run ${short(calls[0].run_id)} on that evidence: ${calls.map((c) => `call ${short(c.call_id)} (${c.mode}, ${c.outcome}, ${c.latency_ms} ms)`).join('; ')} — a real gateway call on this deployment (REPLAY: the recorded response, no external provider)`);
          else bad('no gateway call followed the upload within five minutes');
        }
      }
    }
  }
  // 3b. THE EXPERIMENT (E. Kovács's discrete-event study, act-b30's fabric precedent): declared, J. Weber approves its budget, started; one
  // chunk a tick — the act waits for its FIRST chunk (metered), so the cap set below stops the next claim PARTIAL with the chunk kept
  {
    let e = await expRow();
    if (e) note(`the experiment ${short(e.id)} "${EXP_TITLE}" stands (${e.state}) — an earlier run`);
    else {
      const dsv = (await q(`select t.twin_id::text id, (select max(v.version) from twin.twin_versions v where v.twin_id = t.twin_id and v.branch_id = 'actual' and v.state = 'admitted') v from twin.twins_current t where t.tenant_id = $1 and t.domain_id = $2 and t.title = $3 limit 1`, [T, D, DES_TITLE]))[0] ?? null;
      if (dsv === null) bad(`the study twin "${DES_TITLE}" is absent`);
      else {
        const r = await call(`${OR}/declare`, dom(kovacs, 'simulation', { action: 'simulation.experiment.declare', objectType: 'SXP' }), { title: EXP_TITLE, question: 'How many line-stop days does a 21-day bearing shortage cost the Regensburg line — run under the tenant\'s compute cap?',
          run: { twinId: dsv.id, twinVersion: dsv.v, runKind: 'control', controlRunId: null, shock: false, component: 'bearing', interventions: [{ type: 'none' }], horizonDays: 42,
                 modelRef: 'discrete-event@1', params: { start_date: '2026-10-05', shortage: { start_day: 7, days: 21, fraction: 0.4 } } },
          paths: 60, chunkSize: 20, seed: 91, pace: { chunks_per_tick: 1 }, measures: ['line_stop_days'], budget: { max_paths: 60, max_wall_seconds: 600, max_chunks: 6 } }, kovacs.token);
        if (!r.ok) fail(`E. Kovács declares "${EXP_TITLE}"`, r); else ok(`E. Kovács (the study twin's owner) DECLARED ${short(r.body.experiment.experiment_id)} "${EXP_TITLE}": discrete-event@1, 60 paths in chunks of 20, ONE chunk a tick, the budget ${JSON.stringify(r.body.experiment.budget)}`);
        e = await expRow();
      }
    }
    if (e?.state === 'declared') {
      const x = (await call(`${OR}/${e.id}/read`, dom(kovacs, 'simulation', { action: 'simulation.experiment.read', objectType: 'SXP', objectId: e.id, ...READ }), {}, kovacs.token)).body.experiment;
      const r = await call(`${OR}/${e.id}/approve`, dom(weber, 'simulation', { action: 'simulation.experiment.approve', objectType: 'SXP', objectId: e.id }), { budgetDigest: x.budget_digest, note: 'sixty paths answer the line question; the budget is approved as read (SYNTHETIC)' }, weber.token);
      if (!r.ok) fail('J. Weber approves the budget', r); else ok(`J. Weber APPROVED its budget by the digest ${String(r.body.experiment.approved_budget_digest).slice(0, 12)}… → ${r.body.experiment.state}`);
      e = await expRow();
    }
    if (e?.state === 'approved') {
      const r = await call(`${OR}/${e.id}/start`, dom(kovacs, 'simulation', { action: 'simulation.experiment.start', objectType: 'SXP', objectId: e.id }), {}, kovacs.token);
      if (!r.ok) fail('E. Kovács starts the experiment', r); else ok(`E. Kovács STARTED it: the run ${short(r.body.experiment.run_id)} opened → ${r.body.experiment.state}`);
      e = await expRow();
    }
    if (e?.state === 'running') {
      note('waiting for the attention agent\'s tick to run the experiment\'s FIRST chunk (its after-tick hook; one chunk a tick)');
      e = await waitFor('the first chunk', expRow, (x) => Number(x?.progress?.chunks_done ?? 0) >= 1 || x?.state !== 'running', 240_000, 2000);
      const u = await q(`select quantity from commercial.usage_records where tenant_id = $1 and source_kind = 'experiment_chunk' and details ->> 'experiment_id' = $2`, [T, e.id]);
      (Number(e?.progress?.chunks_done ?? 0) >= 1 ? ok : bad)(`THE FIRST CHUNK RAN under the tick: ${e?.progress?.chunks_done} chunk(s), ${e?.progress?.paths_done} paths, ${e?.progress?.wall_ms} wall ms — metered ${u.length} chunk usage record(s) (${u.map((x) => `${x.quantity} wall_ms`).join(', ')})`);
    }
  }
  // 4. THE SWEEP (T. Nakamura): runs and is metered
  const s1 = await sweepOf(nakamura);
  if (!s1.ok) fail('T. Nakamura sweeps the corridor control', s1);
  else ok(`T. Nakamura (twin owner) SWEPT the corridor control ${short(CORRIDOR.id)}: sweep ${short(s1.body.sweep.sweep_id)} — ${s1.body.sweep.grid_points} grid points, ${(s1.body.sweep.factors ?? []).length} factor(s), rule ${s1.body.sweep.rule}`);
  // 5. THE CAPS (the tenant administrator): simulation_compute STOP (day) at the day's usage; model_inference WARN (day) alongside
  const dayUsed = async (dim, unit) => num((await q(`select coalesce(sum(quantity), 0) s from commercial.usage_records where tenant_id = $1 and dimension = $2 and unit = $3 and occurred_at >= (date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC')`, [T, dim, unit]))[0].s);
  const capOf = async (dim) => (await q(`select cap_id::text, version, cap_limit, action, period from commercial.caps where tenant_id = $1 and domain_id is null and dimension = $2 and state = 'active' limit 1`, [T, dim]))[0] ?? null;
  for (const [dim, unit, action] of [['simulation_compute', 'wall_ms', 'stop'], ['model_inference', 'calls', 'warn']]) {
    const c = await capOf(dim);
    if (c) { note(`the ${dim} cap v${c.version} (${c.cap_limit} ${unit} per ${c.period}, ${c.action}) stands — an earlier run`); continue; }
    const used = await dayUsed(dim, unit);
    const limit = Math.max(1, used);
    const r = await call(`${TC}/usage/caps`, ten(tadmin, { action: 'commercial.cap.set', objectType: 'USG' }), { dimension: dim, unit, period: 'day', limit, action,
      reason: action === 'stop' ? 'the day\'s simulation compute is capped at what it has used so far (SYNTHETIC — the demonstration reaches the cap)' : 'model inference warns at the day\'s calls so far (SYNTHETIC)' }, tadmin.token);
    if (!r.ok) fail(`N. Vogel sets the ${dim} cap`, r);
    else ok(`N. Vogel SET the ${dim} cap v${r.body.cap.version}: ${r.body.cap.limit} ${r.body.cap.unit} per ${r.body.cap.period}, ${r.body.cap.action} — the day's usage ${used} ${unit}; reached ${r.body.cap.reached}; ${r.body.cap.licence_bound}`);
  }
  // 5b. THE ATTENTION AGENT'S NEXT CLAIM STOPS THE EXPERIMENT PARTIAL at the tenant cap — the completed chunk kept
  {
    let e = await expRow();
    if (e?.state === 'running') e = await waitFor('the tick that stops the experiment at the cap', expRow, (x) => x?.state !== 'running', 240_000, 3000);
    note(`the experiment ${short(e?.id)} now ${String(e?.state).toUpperCase()}`);
  }
  // 6. THE NEXT SWEEP: refused at admission, the breach recorded and explained. A sweep measured at 0 ms leaves a 1 ms cap unreached: the
  // sweep then runs (metered) and the next one meets the cap — at most three attempts, each said.
  for (let i = 0; i < 3; i += 1) {
    const s2 = await sweepOf(nakamura);
    if (s2.ok) { note(`T. Nakamura's sweep ${short(s2.body.sweep.sweep_id)} RAN — the stop cap was not yet reached (the day's compute below the 1 ms floor); metered, and the next sweep meets the cap`); continue; }
    expectRefused('T. Nakamura\'s next sweep', s2, 409, /^usage cap rejected \(cap\): the tenant's simulation_compute cap \(.+ wall_ms per day, stop\) is reached — .+ used since .+; the sweep did not run \(the breach is recorded; nothing was deleted; the tenant administrator may raise the cap\)$/);
    break;
  }
  REFUSED = await refusedSweep();
}
// 7-8. THE TICK PRICES THE USAGE; THE ASSERTIONS (every run: the records)
{
  const sweepUsage = await q(`select u.usage_id::text, u.quantity, u.source_ref, u.occurred_at, u.details from commercial.usage_records u where u.tenant_id = $1 and u.dimension = 'simulation_compute' and u.source_kind = 'envelope_sweep'
                                 and u.details ->> 'run_id' = $2 order by u.occurred_at limit 1`, [T, CORRIDOR.id]);
  const inf = await q(`select u.usage_id::text, u.quantity, u.details from commercial.usage_records u where u.tenant_id = $1 and u.dimension = 'model_inference' order by u.occurred_at`, [T]);
  if (sweepUsage.length === 0) bad('no envelope_sweep usage record for the corridor run');
  else ok(`THE SWEEP METERED: usage ${short(sweepUsage[0].usage_id)} — simulation_compute ${sweepUsage[0].quantity} wall_ms (measured by ${sweepUsage[0].details?.measured_by}), sweep ${short(sweepUsage[0].source_ref)}`);
  if (inf.length === 0) note('no model_inference usage record — the inference figure is harness-proven only (said in the LIMITS)');
  else ok(`MODEL INFERENCE METERED: ${inf.length} usage record(s), ${inf.reduce((a, u) => a + Number(u.quantity), 0)} call(s) — ${inf.slice(-2).map((u) => `${u.details?.mode} ${u.details?.outcome}, ${u.details?.latency_ms} ms`).join('; ')}; tokens ${inf[0].details?.tokens === null ? 'NOT RECORDED (the gateway records none)' : JSON.stringify(inf[0].details?.tokens)}`);
  // the attention agent's real tick prices them (the ledger step 82)
  const priced = async () => (await q(`select count(*)::int n from commercial.cost_entries c join commercial.usage_records u on u.usage_id = c.usage_id where u.tenant_id = $1
                                         and (u.usage_id = any($2::uuid[]))`, [T, [...sweepUsage.map((u) => u.usage_id), ...inf.map((u) => u.usage_id)]]))[0].n;
  const want = sweepUsage.length + inf.length;
  let n = await priced();
  if (want > 0 && n < want) { const mark = await dbNow(); note(`waiting for the attention agent's tick to price the usage (${n} of ${want} priced; the tick runs every ${ATT.budgets?.tick_every_seconds ?? 60} s)`); await waitFor('the ledger tick', priced, (x) => x >= want, 240_000, 5000); const t = await tickAfter(mark); if (t) note(`the tick ${short(t.id)} (${t.outcome}) at ${iso(t.started_at)}`); n = await priced(); }
  const entries = await q(`select c.dimension, c.unit, count(*)::int lines, sum(c.quantity) qty, sum(c.amount) amount, max(c.rate_version) rv, string_agg(distinct c.rate_key, ',') rk, string_agg(distinct coalesce(c.energy_label, '—'), ',') el
                             from commercial.cost_entries c where c.tenant_id = $1 group by 1, 2 order by 1`, [T]);
  (n >= want && want > 0 ? ok : bad)(`THE TICK PRICED the usage: ${n} of ${want} sweep/inference record(s) carry a cost entry; the tenant's ledger ${entries.map((e) => `${e.dimension} ${Number(e.qty)} ${e.unit} → ${Number(e.amount).toFixed(6)} EUR (${e.lines} line(s), ${e.rk} v${e.rv}${e.el !== '—' ? `, energy ${e.el}` : ''})`).join('; ')} — SYNTHETIC rates`);
  // the budget's variance (read by the tenant administrator through the route)
  const b = (await q(`select budget_id::text from commercial.budgets where tenant_id = $1 and domain_id is null and capability_key = 'all' and period_kind = 'month' order by version desc limit 1`, [T]))[0] ?? null;
  if (b === null) bad('no month budget');
  else {
    const r = await call(`${TC}/ledger/budgets/${b.budget_id}/read`, ten(tadmin, { action: 'commercial.ledger.read', objectType: 'CBG', objectId: b.budget_id, sideEffect: 'none' }), {}, tadmin.token);
    const v = r.ok ? r.body.budget?.variance : null;
    if (!v) fail('N. Vogel reads the budget', r);
    else { (Number(v.spent) > 0 ? ok : bad)(`THE BUDGET'S VARIANCE (N. Vogel's read): "${r.body.budget.label ?? BUDGET_LABEL}" — spent ${Number(v.spent).toFixed(6)} of ${v.amount ?? r.body.budget.amount} EUR (${v.pct} %), variance ${Number(v.variance).toFixed(6)}, forecast ${v.forecast === null ? '—' : Number(v.forecast).toFixed(4)} by ${v.period_end}; complete ${v.complete}${v.unpriced_usage ? ` (unpriced ${v.unpriced_usage})` : ''}; rule ${v.rule} — the metered compute and inference against the budget (SYNTHETIC)`);
      ENV_OUT.EYE_B91_BUDGET_LABEL = r.body.budget.label ?? BUDGET_LABEL; }
  }
  ENV_OUT.EYE_B91_RATE_KEY = 'simulation_compute:wall_ms';
  // the experiment stopped PARTIAL at the tenant cap (the record)
  {
    const e = await expRow();
    if (e === null) bad(`no experiment "${EXP_TITLE}"`);
    else {
      const ev = await q(`select event, details from simulation.experiment_events where experiment_id = $1 order by occurred_at, event_id`, [e.id]);
      const be = ev.find((x) => x.event === 'budget_exceeded');
      const br = (await q(`select breach_id::text, kind, used, cap_limit from commercial.cap_breaches where tenant_id = $1 and subject_kind = 'experiment' and subject_id = $2`, [T, e.id]))[0] ?? null;
      (e.state === 'partial' && /tenant_cap/.test(JSON.stringify(be?.details ?? {})) && br ? ok : bad)(`THE EXPERIMENT STOPPED ${String(e.state).toUpperCase()} at the tenant cap: ${e.progress?.chunks_done} chunk(s) kept (${e.progress?.paths_done} paths); the ledger ${ev.map((x) => x.event).join(' → ')}; budget_exceeded ${JSON.stringify(be?.details ?? {}).slice(0, 160)}; the breach ${short(br?.breach_id)} (${br?.kind}, used ${br?.used} of ${br?.cap_limit} wall_ms)`);
      ENV_OUT.EYE_B91_EXPERIMENT_TITLE = EXP_TITLE;
    }
  }
  // the budget's thresholds raised to its owner (the ledger tick)
  {
    const ev = await q(`select e.threshold, e.attention_item_id::text item, i.state, i.owner_principal_id::text owner, i.title from commercial.budget_events e left join executive.attention_items i on i.item_id = e.attention_item_id
                         where e.tenant_id = $1 and e.event = 'threshold' order by e.threshold`, [T]);
    (ev.length > 0 && ev.every((x) => x.owner === dvorak.principalId) ? ok : bad)(`THE BUDGET'S THRESHOLDS raised by the tick to its owner: ${ev.map((x) => `${x.threshold} % → ${nm(x.owner)} (${x.state}): "${String(x.title).slice(0, 120)}"`).join('; ') || 'none'} — a budget raises; it never stops work`);
  }
  // THE SYNTHETIC INVOICE (the vendor): today's ledger totals as an imported invoice, reconciled — a real billing account closes no clause
  {
    const INV_REF = 'SYN-NORDWERK-B91-1';
    let inv = (await q(`select invoice_id::text, invoice_ref, total, period_start from commercial.invoices where tenant_id = $1 and invoice_ref = $2`, [T, INV_REF]))[0] ?? null;
    if (inv) note(`the SYNTHETIC invoice ${INV_REF} (${inv.total} EUR) stands — an earlier run`);
    else {
      const day = (await q(`select ((clock_timestamp() at time zone 'UTC')::date)::text d`))[0].d;
      const lines = (await q(`select dimension, min(unit) unit, sum(quantity)::float8 quantity, round(sum(amount), 2)::float8 amount from commercial.cost_entries
                               where tenant_id = $1 and currency = 'EUR' and occurred_at >= ($2::date)::timestamp at time zone 'UTC' and occurred_at < (($2::date) + 1)::timestamp at time zone 'UTC'
                               group by dimension order by dimension`, [T, day])).map((l) => ({ dimension: l.dimension, unit: l.unit, quantity: Number(l.quantity), amount: Number(l.amount), description: 'SYNTHETIC invoice line' }));
      const total = (Math.round(lines.reduce((a, l) => a + l.amount * 100, 0)) / 100).toFixed(2);
      const r = await call('/v1/commercial/ledger/invoices/import', plat(vendor, { action: 'commercial.invoice.import', objectType: 'CIN' }), { tenantId: T, invoiceRef: INV_REF, periodStart: day, periodEnd: day, currency: 'EUR', total,
        issuer: 'THE EYE vendor (SYNTHETIC)', synthetic: true, lines }, vendor.token);
      if (!r.ok) fail('C. Marchetti imports the SYNTHETIC invoice', r);
      else ok(`C. Marchetti IMPORTED the SYNTHETIC invoice ${INV_REF} for ${day}: ${total} EUR in ${lines.length} line(s) — ${lines.map((l) => `${l.dimension} ${l.quantity} ${l.unit} ${l.amount.toFixed(2)}`).join('; ')} (the ledger's own totals: no billing account exists)`);
      inv = (await q(`select invoice_id::text, invoice_ref, total from commercial.invoices where tenant_id = $1 and invoice_ref = $2`, [T, INV_REF]))[0] ?? null;
    }
    if (inv) {
      let rec = (await q(`select version, outcome, lines from commercial.reconciliations where invoice_id = $1 order by version desc limit 1`, [inv.invoice_id]))[0] ?? null;
      if (rec) note(`its reconciliation v${rec.version} (${rec.outcome}) stands — an earlier run`);
      else {
        const r = await call(`/v1/commercial/ledger/invoices/${inv.invoice_id}/reconcile`, plat(vendor, { action: 'commercial.invoice.reconcile', objectType: 'CIN', objectId: inv.invoice_id }), { tolerance: '0.01' }, vendor.token);
        if (!r.ok) fail('C. Marchetti reconciles the invoice', r);
        else { rec = r.body.reconciliation; ok(`C. Marchetti RECONCILED it against the ledger: v${rec.version} ${String(rec.outcome).toUpperCase()} (tolerance 0.01) — ${(rec.lines ?? []).map((l) => `${l.dimension}: invoice ${l.invoice_amount ?? l.on_invoice} vs ledger ${l.ledger_amount ?? l.in_ledger}${l.within_tolerance ? ' ✓' : ` Δ ${l.amount_difference ?? '?'}${l.unpriced_usage ? `, ${l.unpriced_usage} unpriced` : ''}`}`).join('; ')} — usage priced after the import shows as a difference, never hidden`); }
      }
      ENV_OUT.EYE_B91_INVOICE_REF = INV_REF;
    }
  }
  // the cap breach and the commercial.usage item routed
  if (REFUSED === null) bad('no refused-sweep breach recorded');
  else {
    const item = (await q(`select item_id::text, state, owner_principal_id::text owner, route_roles, title, cause_event_type from executive.attention_items where tenant_id = $1 and signal_class = 'commercial.usage' and cause_event_id = $2`, [T, REFUSED.breach_id]))[0] ?? null;
    ok(`THE BREACH ${short(REFUSED.breach_id)} (the record): ${REFUSED.kind} — ${REFUSED.subject_kind} of run ${short(REFUSED.details?.run_id)} on cap v${REFUSED.cap_version} (${REFUSED.cap_limit} wall_ms per day, used ${REFUSED.used} since ${iso(REFUSED.period_start)}), at ${iso(REFUSED.occurred_at)}`);
    (item && ['open', 'acknowledged'].includes(item.state) && item.owner === tadmin.principalId && (item.route_roles ?? []).includes('tenant_admin') ? ok : bad)(`commercial.usage ROUTED: item ${short(item?.id ?? item?.item_id)} → ${nm(item?.owner)} + roles [${(item?.route_roles ?? []).join(', ')}] (${item?.state}; cause ${item?.cause_event_type}): "${String(item?.title ?? '—').slice(0, 150)}"`);
    const bItems = await q(`select state, owner_principal_id::text owner, title from executive.attention_items where tenant_id = $1 and signal_class = 'commercial.usage' and subject_kind = 'budget' order by created_at`, [T]);
    if (bItems.length > 0) note(`the budget's own commercial.usage item(s) → ${bItems.map((x) => `${nm(x.owner)} (${x.state}): "${String(x.title).slice(0, 110)}"`).join('; ')}`);
    else note('the budget raised no item: its spend is below its 80 % threshold (a budget raises; it never stops work)');
  }
}

/* ── B91-L (F-P7-F-01) ───────────────────────────────────────────────────────────────── */
console.log('\nB91-L (F-P7-F-01) — the licence covers Foresight and Decision, not Simulation: the refusal explained, the controls that stay, grace with the last valid entitlement');
const TERM_SECONDS = 150;   // the licence's term ends within the act (a version takes effect when issued: §EN refuses a future start)
let FD = await versionOf(FD_PKG);
const FULL = await versionOf(FULL_PKG);
const FD_CAPS = ['foresight', 'decision', 'observation', 'knowledge_memory', 'model_portfolio', 'agent_platform', 'advanced_integration'];
const FD_LIMITS = { simulation_compute: { quantity: 3_600_000, unit: 'wall_ms', period: 'month' }, model_inference: { quantity: 10_000, unit: 'calls', period: 'month' } };
let REFUSAL_CORR = null;
if (FD) note(`the ${FD_PKG} licence v${FD.version} (${FD.state}) stands — an earlier run${FULL ? `; the live licence is the restored ${FULL_PKG} v${FULL.version} (--restore)` : ''}`);
else {
  // 1. THE VENDOR'S CATALOGUE: the package (NOT simulation), the SKU
  const pk = (await q(`select version, status, capabilities from commercial.packages where package_key = $1 and status <> 'superseded'`, [FD_PKG]))[0] ?? null;
  if (pk) note(`the package ${FD_PKG} v${pk.version} (${pk.status}: ${pk.capabilities.join(', ')}) stands — an earlier run`);
  else {
    const r = await call('/v1/commercial/packages/declare', plat(vendor, { action: 'commercial.offer.package', objectType: 'PKG' }), { key: FD_PKG, expectedVersion: 0, title: 'Foresight and Decision (SYNTHETIC)', capabilities: FD_CAPS,
      limits: FD_LIMITS, tier: 'strategic_cell', reason: 'Foresight and Decision with the foundations NORDWERK uses — observation, knowledge and memory, the model portfolio, agents, integration — NOT Simulation (SYNTHETIC)' }, vendor.token);
    if (!r.ok) fail(`C. Marchetti declares the package ${FD_PKG}`, r); else ok(`C. Marchetti DECLARED the package ${r.body.package.package_key} v${r.body.package.version}: ${r.body.package.capabilities.join(', ')} — NOT simulation; limits ${JSON.stringify(r.body.package.limits)} (SYNTHETIC)`);
  }
  const sku = (await q(`select version, status from commercial.skus where sku_code = $1 and status <> 'superseded'`, [FD_SKU]))[0] ?? null;
  if (sku) note(`the SKU ${FD_SKU} v${sku.version} stands — an earlier run`);
  else {
    const r = await call('/v1/commercial/skus/declare', plat(vendor, { action: 'commercial.offer.sku', objectType: 'SKU' }), { code: FD_SKU, expectedVersion: 0, title: 'Foresight and Decision — 12 months (SYNTHETIC)', packageKey: FD_PKG, termMonths: 12,
      reason: 'the Foresight-and-Decision package on a twelve-month term (SYNTHETIC)' }, vendor.token);
    if (!r.ok) fail(`C. Marchetti declares the SKU ${FD_SKU}`, r); else ok(`C. Marchetti DECLARED the SKU ${r.body.sku.sku_code} v${r.body.sku.version}: ${r.body.sku.package_key} v${r.body.sku.package_version}, ${r.body.sku.term_months} months`);
  }
  // the licence: issued now, its term ending within the act
  const until = new Date(new Date(await dbNow()).getTime() + TERM_SECONDS * 1000).toISOString();
  const r = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(vendor, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: FD_SKU, effectiveTo: until,
    orderRef: 'SYNTH-ORDER-NORDWERK-B91-FD', reason: 'NORDWERK licensed for Foresight and Decision, not Simulation — a short demonstration term that ends within the act (SYNTHETIC)' }, vendor.token);
  if (!r.ok) fail('C. Marchetti issues the licence', r);
  else ok(`C. Marchetti ISSUED NORDWERK licence ${short(r.body.licence.licence_id)} v${r.body.licence.version}: ${r.body.licence.package_key} — ${r.body.licence.capabilities.join(', ')}; from ${iso(r.body.licence.effective_from)} to ${iso(r.body.licence.effective_to)} (the term ends within the act); provenance ${r.body.licence.provenance?.sku} v${r.body.licence.provenance?.sku_version}, order ${r.body.licence.provenance?.order_ref}; digest ${String(r.body.licence.digest).slice(0, 12)}…`);
  FD = await versionOf(FD_PKG);
}
const fdLive = FD !== null && FULL === null && ['active', 'grace'].includes((await liveLicence())?.state) && (await liveLicence())?.package_key === FD_PKG;
// 2. THE REFUSAL, EXPLAINED (while the foresight-decision licence is the live one; after --restore the earlier refusal is read from the record)
if (fdLive) {
  const r = await sweepOf(nakamura);
  const re = /^capability unavailable \(entitlement\): simulation is not licensed for this tenant \((active|grace); licence v\d+\) — reads of existing records, corrections and withdrawals, export, audit, identity, warnings and their acknowledgement, and every human decision stay available$/;
  if (expectRefused('T. Nakamura\'s simulation write (the envelope sweep)', r, 403, re, 'EYE-ENT-001')) {   // the body's code is dashed (the error-body rule)
    REFUSAL_CORR = r.correlationId;
    note(`the refusal's entitlement block: capability ${r.body.entitlement?.capability}, state ${r.body.entitlement?.state}, licence v${r.body.entitlement?.licence_version} — nothing ran, nothing was written but the denial (POL + AUD)`);
  }
}
{
  const den = (await q(`select e.correlation_id::text, e.occurred_at, e.result_code, e.action from audit.audit_events e where e.tenant_id = $1 and e.result_code = 'EYE-ENT-001' and e.action = 'simulation.sweep.run' order by e.occurred_at desc limit 1`, [T]))[0] ?? null;
  if (den) { REFUSAL_CORR = REFUSAL_CORR ?? den.correlation_id; ok(`the entitlement refusal is IN THE AUDIT LEDGER: ${den.action} → ${den.result_code} at ${iso(den.occurred_at)} (correlation ${short(den.correlation_id)})`); }
  else bad('no EYE-ENT-001 audit event for simulation.sweep.run');
}
// 3. THE CONTROLS THAT STAY AVAILABLE
{
  // (a) the attention layer (executive.attention.* — never gated): M. Dvořák reads the commercial.usage item of the refused sweep. Its
  // item is routed to the cap's setter (N. Vogel) and the tenant_admin role — not to the executive — so M. Dvořák READS it; the tenant
  // administrator's ACKNOWLEDGEMENT is shown on the commercial.entitlement item in grace (step 4).
  const item = REFUSED === null ? null : (await q(`select item_id::text, state from executive.attention_items where tenant_id = $1 and signal_class = 'commercial.usage' and cause_event_id = $2`, [T, REFUSED.breach_id]))[0] ?? null;
  if (item) {
    const g = await call(`${E}/items/${item.item_id}/get`, dom(dvorak, 'executive', { action: 'executive.attention.read', objectType: 'ATI', objectId: item.item_id, ...READ }), {}, dvorak.token);
    (g.ok ? ok : bad)(`M. Dvořák READ the commercial.usage item ${short(item.item_id)} under the licence (executive.attention.read — never gated): ${g.ok ? `${g.body.item?.state ?? '—'} — "${String(g.body.item?.title ?? '').slice(0, 120)}"` : refusalLine(g)}`);
  } else note('no commercial.usage item of the refused sweep to read');
  // (b) the audit read by the tenant's auditor (or the tenant administrator), by the refusal's correlation
  const reader = auditor ?? tadmin;
  if (REFUSAL_CORR) {
    const r = await call(`/v1/tenants/${T}/audit/query`, ten(reader, { action: 'audit.read', objectType: 'AUD', ...READ }), { correlationId: REFUSAL_CORR, limit: 20 }, reader.token);
    const ev = r.ok ? (r.body.events ?? []).find((e) => String(e.result_code ?? e.resultCode ?? '') === 'EYE-ENT-001') : null;
    (ev ? ok : bad)(`${nm(reader.principalId)} READ THE AUDIT LEDGER under the licence (audit.read — never gated): ${r.ok ? `${(r.body.events ?? []).length} event(s) of the refusal's correlation — ${ev ? `${ev.action} → ${ev.result_code ?? ev.resultCode}` : 'no EYE-ENT-001 event'}` : refusalLine(r)}`);
  }
  // (c) reads of the existing corridor runs
  const rd = await call(`${FB}/runs/${CORRIDOR.id}/read`, dom(nakamura, 'simulation', { action: 'simulation.fabric.read', objectType: 'SIM', objectId: CORRIDOR.id, ...READ }), {}, nakamura.token);
  (rd.ok ? ok : bad)(`T. Nakamura READ the corridor run ${short(CORRIDOR.id)} under the licence (a read of an existing record — never gated): ${rd.ok ? `its sweeps ${(rd.body.run?.sweeps ?? []).length}, reach ${JSON.stringify(rd.body.run?.reach?.counts ?? {})}` : refusalLine(rd)}`);
}
// 4. THE TERM ENDS → THE TICK MOVES THE LICENCE TO GRACE
if (FD) {
  const graceT = async () => (await q(`select transition_id::text, kind, cause, from_state, to_state, grace_until, last_valid, actor_kind, actor_principal_id::text actor, attention_items, occurred_at
                                         from commercial.licence_transitions where licence_id = $1 and version = $2 and kind = 'grace_entered' order by occurred_at limit 1`, [FD.licence_id, FD.version]))[0] ?? null;
  let g = await graceT();
  if (g) note(`the grace transition ${short(g.transition_id)} stands — ${iso(g.occurred_at)} (an earlier run)`);
  else {
    const left = Math.max(0, new Date(FD.effective_to).getTime() - new Date(await dbNow()).getTime());
    note(`the term ends ${iso(FD.effective_to)} (${Math.round(left / 1000)} s from the database's now); the attention agent's tick moves it — waited for, never driven`);
    g = await waitFor('the tick that moves the licence to grace', graceT, (x) => x !== null, left + 240_000, 5000);
  }
  if (g === null) bad('the licence did not enter grace');
  else {
    const lv = g.last_valid ?? {};
    (g.to_state === 'grace' && g.cause === 'term_ended' && g.actor_kind === 'tick' && Array.isArray(lv.capabilities) && !lv.capabilities.includes('simulation') ? ok : bad)(`THE TICK MOVED THE LICENCE TO GRACE: ${g.from_state} → ${g.to_state} (${g.cause}) by ${nm(g.actor)} at ${iso(g.occurred_at)}; grace until ${iso(g.grace_until)}; the LAST VALID ENTITLEMENT v${lv.version} — ${(lv.capabilities ?? []).join(', ')}; limits ${JSON.stringify(lv.limits)}; term end ${lv.term_end}`);
    const items = await q(`select item_id::text, domain_id::text, state, owner_principal_id::text owner, route_roles, policy_version, title from executive.attention_items where item_id = any($1::uuid[])`, [g.attention_items ?? []]);
    const here = items.find((x) => x.domain_id === D) ?? null;
    (here && ['open', 'acknowledged'].includes(here.state) && (here.route_roles ?? []).includes('tenant_admin') ? ok : bad)(`commercial.entitlement ROUTED in the corridor domain: item ${short(here?.item_id)} — ${here?.state}, roles [${(here?.route_roles ?? []).join(', ')}] under policy v${here?.policy_version}, owner ${nm(here?.owner)}: "${String(here?.title ?? '—').slice(0, 170)}"${items.length > 1 ? `; ${items.length - 1} more in the tenant's other domain(s): ${items.filter((x) => x !== here).map((x) => x.state).join(', ')}` : ''}`);
    const holders = (await q(`select count(*)::int n from identity.role_bindings b where b.role_code = 'tenant_admin' and b.scope = 'TENANT' and b.tenant_id = $1 and b.revoked_at is null and b.principal_id = $2`, [T, tadmin.principalId]))[0].n;
    note(`the tenant administrator N. Vogel holds the routed role (${holders > 0 ? 'yes' : 'NO'}) — the item reaches him by role`);
    // the tenant administrator ACKNOWLEDGES the routed item (a mandatory control: executive.attention.* is never gated)
    if (here) {
      const acked = (await q(`select count(*)::int n from executive.attention_item_events where item_id = $1 and event = 'item.acknowledged'`, [here.item_id]))[0].n;
      if (acked > 0) note(`N. Vogel's acknowledgement of ${short(here.item_id)} stands — an earlier run`);
      else {
        const a = await call(`${E}/items/${here.item_id}/acknowledge`, dom(tadmin, 'executive', { action: 'executive.attention.item.acknowledge', objectType: 'ATI', objectId: here.item_id }), { note: 'seen: the licence is in grace; renewal is with the vendor (SYNTHETIC)' }, tadmin.token);
        const ev = (await q(`select count(*)::int n from executive.attention_item_events where item_id = $1 and event = 'item.acknowledged' and actor_principal_id = $2`, [here.item_id, tadmin.principalId]))[0].n;
        (a.ok && ev === 1 ? ok : bad)(`N. Vogel (tenant administrator) ACKNOWLEDGED the commercial.entitlement item ${short(here.item_id)} in grace — ${a.ok ? `item.acknowledged recorded by him (receipt, never agreement)` : refusalLine(a)}`);
      }
    }
  }
  // the licence standing (N. Vogel's surface)
  const st = await call(`${TC}/grace/standing`, ten(tadmin, { action: 'commercial.grace.read', objectType: 'LIC', ...READ }), {}, tadmin.token);
  if (!st.ok) fail('N. Vogel reads the licence standing', st);
  else {
    const c = st.body.standing.current; const gr = st.body.standing.grace;
    if (fdLive || c.licence?.package_key === FD_PKG) (c.state === 'grace' && gr.last_valid?.version === FD.version ? ok : bad)(`THE STANDING (N. Vogel): ${String(c.state).toUpperCase()} — "${String(c.explanation).slice(0, 260)}"; last valid v${gr.last_valid?.version} (${(gr.last_valid?.capabilities ?? []).join(', ')}); grace until ${iso(gr.grace_until)}; ${st.body.standing.renewal_and_continuity.transitions.length} transition(s)`);
    else note(`THE STANDING (N. Vogel) now: ${String(c.state).toUpperCase()} — "${String(c.explanation).slice(0, 200)}" (the ${FD_PKG} grace stands in the history: ${st.body.standing.renewal_and_continuity.transitions.filter((t) => t.kind === 'grace_entered').length} grace transition(s))`);
  }
  ENV_OUT.EYE_B91_LICENCE_VERSION = String((await liveLicence())?.version ?? FD.version);
  ENV_OUT.EYE_B91_GRACE = (await liveLicence())?.state === 'grace' ? '1' : '0';
  ENV_OUT.EYE_B91_LICENCE_COMPUTE_LIMIT_MS = String(FD_LIMITS.simulation_compute.quantity);
  // the licensed capability list exactly as the record holds it (the package's ∪ core, sorted) — the walks read it, never a list of their own
  const fdRow = (await q(`select capabilities from commercial.licences where licence_id = $1 and version = $2`, [FD.licence_id, FD.version]))[0];
  ENV_OUT.EYE_B91_LICENSED = (fdRow?.capabilities ?? []).join(', ');
}
// 5. THE OFFLINE TOKEN — only with a signing key reference in the environment (never written)
{
  const refs = Object.keys(process.env).filter((k) => /^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$/.test(k));
  if (refs.length === 0) note('the offline licence token is NOT issued: no EYE_LICENCE_SIGNING_KEY_* reference in the environment (.eye-local/env has none; the act never writes it) — the token and scripts/commercial/verify-licence.mjs are harness-proven (phase6-grace-b91)');
  else note(`a signing key reference is present (${refs.length}); the token scene is not staged by this act — the issue and the offline verification are harness-proven (phase6-grace-b91)`);
}
}

/* ── --restore ───────────────────────────────────────────────────────────────────────── */
if (RESTORE) {
  console.log('\nB91-R --restore — the full licence (every built capability, Simulation included, no term end); the simulation_compute cap raised; Simulation available again');
  const built = (await q(`select capability_key from commercial.capabilities where status = 'active' and built and not core order by capability_key`)).map((x) => x.capability_key);
  const pk = (await q(`select version, capabilities from commercial.packages where package_key = $1 and status <> 'superseded'`, [FULL_PKG]))[0] ?? null;
  if (pk) note(`the package ${FULL_PKG} v${pk.version} (${pk.capabilities.length} capabilities) stands — an earlier run`);
  else {
    const r = await call('/v1/commercial/packages/declare', plat(vendor, { action: 'commercial.offer.package', objectType: 'PKG' }), { key: FULL_PKG, expectedVersion: 0, title: 'The full platform (SYNTHETIC)', capabilities: built,
      limits: {}, tier: 'multi_domain', reason: 'every built capability, Simulation included — the demonstration restored for the later stages (SYNTHETIC)' }, vendor.token);
    if (!r.ok) fail(`C. Marchetti declares the package ${FULL_PKG}`, r); else ok(`C. Marchetti DECLARED the package ${FULL_PKG} v${r.body.package.version}: ${r.body.package.capabilities.join(', ')} — no limits (SYNTHETIC)`);
  }
  const sku = (await q(`select version from commercial.skus where sku_code = $1 and status <> 'superseded'`, [FULL_SKU]))[0] ?? null;
  if (sku) note(`the SKU ${FULL_SKU} v${sku.version} stands — an earlier run`);
  else {
    const r = await call('/v1/commercial/skus/declare', plat(vendor, { action: 'commercial.offer.sku', objectType: 'SKU' }), { code: FULL_SKU, expectedVersion: 0, title: 'The full platform — 12 months (SYNTHETIC)', packageKey: FULL_PKG, termMonths: 12,
      reason: 'the full platform on a twelve-month term (SYNTHETIC)' }, vendor.token);
    if (!r.ok) fail(`C. Marchetti declares the SKU ${FULL_SKU}`, r); else ok(`C. Marchetti DECLARED the SKU ${FULL_SKU} v${r.body.sku.version}`);
  }
  let live = await liveLicence();
  if (live?.package_key === FULL_PKG && live.state === 'active' && live.effective_to === null) note(`the full licence v${live.version} is live — an earlier run`);
  else {
    const r = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(vendor, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: FULL_SKU,
      orderRef: 'SYNTH-ORDER-NORDWERK-B91-FULL', reason: 'the demonstration restored: every built capability, Simulation included, no term end (SYNTHETIC)' }, vendor.token);
    if (!r.ok) fail('C. Marchetti issues the full licence', r);
    else ok(`C. Marchetti ISSUED NORDWERK licence v${r.body.licence.version}: ${r.body.licence.package_key} — ${r.body.licence.capabilities.length} capabilities incl. simulation; no term end; supersedes v${r.body.licence.provenance?.supersedes} (kept in the history)`);
    live = await liveLicence();
  }
  // the cap raised: a new version, warn, generous
  const cap = (await q(`select cap_id::text, version, cap_limit, action from commercial.caps where tenant_id = $1 and domain_id is null and dimension = 'simulation_compute' and unit = 'wall_ms' and period = 'day' and state = 'active' limit 1`, [T]))[0] ?? null;
  const GENEROUS = 3_600_000;
  if (cap && cap.action === 'warn' && Number(cap.cap_limit) >= GENEROUS) note(`the simulation_compute cap v${cap.version} (${cap.cap_limit} wall_ms per day, warn) stands — an earlier run`);
  else {
    const r = await call(`${TC}/usage/caps`, ten(tadmin, { action: 'commercial.cap.set', objectType: 'USG' }), { dimension: 'simulation_compute', unit: 'wall_ms', period: 'day', limit: GENEROUS, action: 'warn',
      reason: 'the demonstration restored: an hour of compute a day, a warning only (SYNTHETIC)' }, tadmin.token);
    if (!r.ok) fail('N. Vogel raises the simulation_compute cap', r); else ok(`N. Vogel RAISED the simulation_compute cap: v${r.body.cap.version} (supersedes v${r.body.cap.supersedes}) — ${r.body.cap.limit} wall_ms per day, ${r.body.cap.action}; ${r.body.cap.licence_bound}`);
  }
  // Simulation available again: T. Nakamura's simulation write (the envelope sweep) — once per restored licence version
  const since = (await q(`select issued_at from commercial.licences where tenant_id = $1 and package_key = $2 order by version desc limit 1`, [T, FULL_PKG]))[0]?.issued_at ?? null;
  const after = since === null ? null : (await q(`select sweep_id::text, swept_at from simulation.envelope_sweeps where tenant_id = $1 and domain_id = $2 and run_id = $3 and requested_by = $4 and swept_at > $5 order by swept_at limit 1`, [T, D, CORRIDOR.id, nakamura.principalId, since]))[0] ?? null;
  if (after) ok(`T. Nakamura's simulation write stands available — his sweep ${short(after.sweep_id)} at ${iso(after.swept_at)} under the full licence (an earlier run)`);
  else {
    const r = await sweepOf(nakamura);
    (r.ok ? ok : bad)(`T. Nakamura's simulation write is AVAILABLE AGAIN: ${r.ok ? `sweep ${short(r.body.sweep.sweep_id)} ran and was metered` : refusalLine(r)}`);
  }
  const av = await call(`${X}/commercial/entitlement/availability`, dom(nakamura, 'commercial', { action: 'commercial.read', objectType: 'LIC', ...READ }), { actions: ['simulation.sweep.run', 'simulation.run', 'twin.version'] }, nakamura.token);
  if (av.ok) note(`the gate now (T. Nakamura's read): ${JSON.stringify(av.body.availability ?? av.body).slice(0, 300)}`); else note(`the availability read: ${refusalLine(av)}`);
  const hist = await q(`select version, package_key, state from commercial.licences where tenant_id = $1 order by version`, [T]);
  note(`the licence history is kept: ${hist.map((h) => `v${h.version} ${h.package_key} (${h.state})`).join(', ')}`);
}

/* ── B91-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB91-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from commercial.usage_records where tenant_id = $1)::int usage, (select count(*) from commercial.cost_entries where tenant_id = $1)::int costs,
                             (select count(*) from commercial.rate_cards)::int rates, (select count(*) from commercial.budgets where tenant_id = $1)::int budgets,
                             (select count(*) from commercial.caps where tenant_id = $1)::int caps, (select count(*) from commercial.cap_breaches where tenant_id = $1)::int breaches,
                             (select count(*) from commercial.licences where tenant_id = $1)::int licences, (select count(*) from commercial.licence_transitions where tenant_id = $1)::int transitions,
                             (select count(*) from executive.attention_items where tenant_id = $1 and signal_class in ('commercial.usage', 'commercial.entitlement'))::int items`, [T]))[0];
  note(`in the ledgers: ${n.usage} usage record(s), ${n.costs} cost entr(ies), ${n.rates} rate card version(s), ${n.budgets} budget version(s), ${n.caps} cap version(s), ${n.breaches} breach(es), ${n.licences} licence version(s), ${n.transitions} transition(s), ${n.items} commercial attention item(s)`);
  const live = await liveLicence();
  note(`NORDWERK's licence now: ${live ? `v${live.version} ${live.package_key} — ${String(live.state).toUpperCase()}${live.grace_until ? ` until ${iso(live.grace_until)}` : ''}` : 'UNCONTRACTED'}`);
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/\s/.test(v) ? `'${v}'` : v}`);
  note('LIMITS said: EVERY FIGURE IS SYNTHETIC — the rate cards (0.05 EUR per compute second, 0.02 EUR per inference call, 1 EUR per GB-sample of evidence storage, the energy coefficient an ESTIMATE), the month budget (sized from the month\'s priced spend), the caps (set at the day\'s usage so the demonstration reaches them), the licence limits, the order references and the shipment record. NO REAL BILLING ACCOUNT: the invoice C. Marchetti imports is SYNTHETIC — the ledger\'s own totals for the day, reconciled against the ledger; a real billing account closes the clause and none exists (a reconciliation shows usage priced after the import as a difference). THE BUDGET: its amount is sized from the month\'s priced spend when it is set (spent / 0.9) so the demonstration reaches its 80 % threshold. MODEL INFERENCE: the extraction agent\'s run calls the model gateway in REPLAY mode on this local deployment — the recorded response is the method\'s fixture (recorded_from fixture), no external provider is called; inference is metered in CALLS (the gateway records no tokens). THE CAPS: the stop cap is enforced at admission for simulation_compute (the sweep and the experiment chunk claim — E. Kovács\'s discrete-event experiment is stopped PARTIAL at the cap by the attention agent\'s next claim, its first chunk kept); model inference warns only. THE ROUTING: commercial.entitlement items are evaluated against the published policy (routed to the tenant administrator); the commercial.usage items of a cap or a budget are NOT policy-routed — their ports route them, material, to the named owner (the cap\'s setter, the budget\'s owner) and the tenant_admin role whatever the policy says; the policy\'s commercial.usage route is published for the class only. THE LICENCE: a version takes effect when issued (§EN refuses a future start), so the term is set to end within the act and the attention agent\'s real tick moves it to GRACE (14 days, the DEFAULT grace policy: read and preserve, finish running work, no new work); the offline token is not issued (no signing key reference in the environment). THE ACKNOWLEDGEMENT: the tenant administrator acknowledges the routed commercial.entitlement item (tenant_admin was admitted to executive.attention.item.acknowledge by the integrator after the first rehearsal); M. Dvořák reads the cap\'s commercial.usage item. HARNESS-PROVEN ONLY: the entitlement matrix\'s suspended and lapsed cells, the indeterminate entitlement, renewal/suspension/reinstatement, the contract scope, the offline token and its verifier, allocation keys, the matched/differences reconciliation cases, the optimisation boundary, the anomaly rule, B90\'s product-consumption counters. Nothing is cleaned: every record stands as a demonstration fact.');
}

/* ── THE END ── */
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
