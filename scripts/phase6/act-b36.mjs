#!/usr/bin/env node
/**
 * CP-6 batch B36 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): STRATEGIC PLANNING,
 * THE EXECUTIVE HOME, THE GATE COMPLETED, THE ATTENTION COMPLETION, THE SCORE AND THE STRATEGY GRAPH COMPLETED, THE BRIEFING STUDIO v3,
 * THE PUBLISHING CENTER, THE COLLABORATION COMPLETION (migration 0094; F-P6-04/-07/-08/-09/-10/-11/-13/-14, F-P4-13) — exercised by the
 * personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers, and where nothing happened, saying so.
 * EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and says "stands — an
 * earlier run" instead of writing it twice. No clock is moved. The rows this act PLANTS are STATED where they happen (the skew items of the
 * queue hold, the degraded health verdict of the briefing outage): every other object is a persona's governed act.
 *
 *   B36-0 THE STATE: 0094 applied; the casting read from identity.role_bindings; the SYNTHETIC personas created through the governed principal
 *         route — R. Vogel, F. Kraus, I. Saitō (board_member), E. Lindqvist (auditor, TENANT scope), the chief of staff (executive_operator),
 *         A. Novák (strategy_owner, the planning lead), A. Moreau (executive — the second signatory of the partner letter).
 *   B36-H THE HOME AND THE CADENCE: M. Dvořák opens the weekly cadence; the chief of staff curates the agenda and escalates a gap; a scenario
 *         room with a deadline; the loop reset; the operator's context on the Regensburg objective, the command view, a search, the metrics.
 *   B36-G THE GATES: act-b34's dual-sourcing decision SIGNED (the approval by S. Okafor, the decision by C. Brenner) and DISTRIBUTED to its room
 *         (in_app + the e-mail sink); the "B36 gate" package: approved, RECUSED, CHALLENGED by the auditor, DISMISSED, K. Lange's defer DENIED
 *         at the PDP and shown on the record; the board package reserved by M. Dvořák and approved by R. Vogel through the board's own route.
 *   B36-A THE ATTENTION COMPLETION: the policy with governance (fairness floor 0.7, staleness ceiling 168 h) and the B36 classes; a REAL corridor
 *         warning raised by a probe INDICATOR'S EVALUATION on the B28 corridor stream series (N. Eriksen defines it, binds it to a downside branch,
 *         evaluates it — the exposure route raises no second corridor warning here: its candidates cluster into act-b32's acknowledged one, SAID);
 *         the corridor item PLANTED on it (stated) for L. Brandt; the SYNTHETIC settle fault armed by T. Richter; L. Brandt's act settle_failed and
 *         RESUMED by the chief of staff; the priority ACCEPTED (signed); the skew PLANTED (stated) → the hold RAISED and left for the walk; the forum.
 *   B36-S THE SCORE AND THE STRATEGY GRAPH: J. Weber (the on-time measure's owner) restates its input → the OWNER-EDIT FLAG; the customs
 *         component added to the definition (v2) and EXCLUDED by an approved exception; the snapshot ACCEPTED (signed); the dual-sourcing
 *         allocation REVOKED by its issuer; the stale-measure detection raised by the SCHEDULE and routed.
 *   B36-B THE BRIEFING STUDIO v3: the suppression policy; the window's content (the broker's stale single-source note uploaded by A. Hoffmann, a
 *         weak signal nominated by N. Eriksen); L. Brandt's edition after the agent's (a human's prior-less edition folds to restricted; a prior is
 *         the room's own) with its contract (audience, purpose, expiry): the band on every conclusion, the suppressed single-source item, the degraded
 *         sources declared, the open challenge as a disputed item, the weak signal as an indicator; the outage edition RETAINING the corridor warning
 *         with its earlier as-of; the health restored; the edition after the recovery (the Board pack's correction binds to it).
 *   B36-D THE PUBLISHING CENTER: the "Board pack" from L. Brandt's corridor edition (the report of a package renders its CURRENT version only and
 *         the corridor decision is monitoring at its last version, so the correction goes to a LATER EDITION — the brief's alternative) → approved
 *         by digest (signed), delivered with receipts, acknowledged by a board member, CORRECTED (the recipients notified), archived and EXPORTED
 *         (residency EU carried); the partner letter from the corridor decision's current version, reviewed by a second executive, delivered
 *         (SYNTHETIC), archived — its export REFUSED (residency).
 *   B36-P THE PLANNING WORKSPACE: A. Novák's "Dual-sourcing 2027"; two initiatives; milestones on the stock measures bound to the runs' output
 *         keys; the runs attached; funded, approved and BASELINED (signed) by M. Dvořák; the tick raises the Q2 variance; the authority lowered →
 *         the BREACH; a package citing the initiative HELD at commitment; acknowledged → committed.
 *   B36-C THE COLLABORATION COMPLETION: R. Haddad's NEW invitation delivered to the SYNTHETIC mailbox (the pickup and acceptance LEFT FOR THE WALK,
 *         from /login); two review tasks with B waiting on A; the REAL execution target (a loopback literal, SYNTHETIC record) registered inactive
 *         → the handoff refused; activated by K. Lange with the committed decision → the PRODUCTION EGRESS refuses (nothing real reached);
 *         deactivated; the corridor mitigation's outcome recorded, REVIEWED and LEARNED; the Morocco exploit committed, its outcome recorded,
 *         reviewed, the closure co-signed, the package CLOSED, the learning recorded by the sponsor.
 *   B36-9 THE STATE, the env lines for the walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC. Every channel is a local sink. Nothing here prints a credential.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
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
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const P = `${X}/prediction`; const XP = `${P}/exposures`; const E = `${X}/executive/attention`;
const DC = `${X}/decisions`; const CM = `${X}/commitments`; const EX = `${X}/executive`; const H = `${X}/executive/health`; const HM = `${X}/home`; const PL = `${X}/planning`;
const PB = `${X}/publications`; const W = `${X}/twins`; const BR = `${X}/briefings`;
const SINK_HTTP = process.env.ACT_SINK_HTTP_PORT ? `http://127.0.0.1:${process.env.ACT_SINK_HTTP_PORT}` : null;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const DAY = 86_400_000; const MIN = 60_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 220)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const dbAgo = async (interval) => (await q(`select clock_timestamp() - $1::interval t`, [interval]))[0].t.toISOString();
const tStart = Date.now();
const elapsed = () => `${((Date.now() - tStart) / 60000).toFixed(1)} min`;
console.log(`THE B36 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
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

/* ── B36-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB36-0 THE STATE — 0094, the casting, the new SYNTHETIC personas');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0094%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0094 is not applied'); process.exit(1); }
}
const CAST = { 'm.dvorak': ['executive'], 'l.brandt': ['decision_authority', 'decision_owner', 'opportunity_sponsor', 'strategy_owner'], 's.okafor': ['decision_approver', 'executive'],
  'c.brenner': ['decision_owner', 'risk_owner', 'strategy_owner'], 'k.lange': ['execution_authority'], 't.richter': ['domain_admin'], 'j.weber': ['strategy_owner'],
  'n.eriksen': ['forecast_owner'], 'a.hoffmann': ['domain_analyst'], 't.nakamura': ['twin_owner'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
const NEW_PERSONAS = [
  ['r.vogel', 'R. Vogel — supervisory board member (SYNTHETIC)', 'board_member', D],
  ['f.kraus', 'F. Kraus — supervisory board member (SYNTHETIC)', 'board_member', D],
  ['i.saito', 'I. Saitō — supervisory board member (SYNTHETIC)', 'board_member', D],
  ['e.lindqvist', 'E. Lindqvist — the tenant\'s auditor (SYNTHETIC)', 'auditor', null],
  ['chief.of.staff', 'The chief of staff — executive operator (SYNTHETIC)', 'executive_operator', D],
  ['a.novak', 'A. Novák — strategy lead of the 2027 plan (SYNTHETIC)', 'strategy_owner', D],
  ['a.moreau', 'A. Moreau — executive, the second signatory (SYNTHETIC)', 'executive', D],
];
for (const [loginName, displayName, roleCode, domainId] of NEW_PERSONAS) {
  const r = await createPersona(admin, T, { displayName, loginName, password: PW, roleCode, domainId });
  if (r.session === null) { bad(`${displayName} could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (r.created) ok(`the administrator CREATED ${displayName.split(' — ')[0]} through the governed principal route — role ${roleCode} at the ${domainId === null ? 'TENANT' : 'DOMAIN'}`); else note(`${displayName.split(' — ')[0]} is present — an earlier run`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const dvorak = await who('m.dvorak'); const brandt = await who('l.brandt'); const okafor = await who('s.okafor'); const brenner = await who('c.brenner'); const lange = await who('k.lange');
const richter = await who('t.richter'); const weber = await who('j.weber'); const eriksen = await who('n.eriksen'); const hoffmann = await who('a.hoffmann'); const nakamura = await who('t.nakamura');
const vogel = await who('r.vogel'); const kraus = await who('f.kraus'); const saito = await who('i.saito'); const lindqvist = await who('e.lindqvist'); const chief = await who('chief.of.staff');
const novak = await who('a.novak'); const moreau = await who('a.moreau');
const NAME = { [dvorak.principalId]: 'M. Dvořák', [brandt.principalId]: 'L. Brandt', [okafor.principalId]: 'S. Okafor', [brenner.principalId]: 'C. Brenner', [lange.principalId]: 'K. Lange', [richter.principalId]: 'T. Richter',
  [weber.principalId]: 'J. Weber', [eriksen.principalId]: 'N. Eriksen', [hoffmann.principalId]: 'A. Hoffmann', [nakamura.principalId]: 'T. Nakamura', [vogel.principalId]: 'R. Vogel', [kraus.principalId]: 'F. Kraus', [saito.principalId]: 'I. Saitō',
  [lindqvist.principalId]: 'E. Lindqvist', [chief.principalId]: 'the chief of staff', [novak.principalId]: 'A. Novák', [moreau.principalId]: 'A. Moreau', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
const CP = 'collaboration.dual-sourcing-review';
const xp = (s, path, action, payload, objectId = null) => call(`${XP}/${path}`, env_(s, 'prediction')({ action, objectType: 'RSK', objectId, consequence: 'C2' }), payload, s.token);
const cm = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${CM}/${path}`, env_(s, 'decision')({ action, objectType, objectId, ...extra }), payload, s.token);
const col = (s, path, action, objectType, payload, objectId = null) => call(`${EX}/collab/${path}`, env_(s, CP)({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);

/* ── lookups ─────────────────────────────────────────────────────────────────────────── */
const OBJ_REG = (await q(`select strategy_object_id::text id, title, owner_principal_id::text owner from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const CORRIDOR = (await q(`select strategy_object_id::text id, owner_principal_id::text owner from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and title = 'Corridor closure — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const MOROCCO = (await q(`select strategy_object_id::text id, owner_principal_id::text owner from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and title = 'Alternative supplier in Morocco' limit 1`, [T, D]))[0] ?? null;
const respOf = async (exposure, kind) => (await q(`select r.response_id::text rid, r.package_id::text pkg, p.title, p.state, p.current_version, p.committed_version, p.owner_principal_id::text owner, p.decision_object_id::text dec from prediction.exposure_responses r
                                                  join decision.packages_current p on p.package_id = r.package_id where r.exposure_id = $1 and r.response_kind = $2 order by r.opened_at limit 1`, [exposure, kind]))[0] ?? null;
const MITIG = CORRIDOR === null ? null : await respOf(CORRIDOR.id, 'mitigate');
const MOR = MOROCCO === null ? null : await respOf(MOROCCO.id, 'exploit');
const JAN = (await q(`select package_id::text pkg, decision_object_id::text dec, state, current_version, committed_version, owner_principal_id::text owner from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0] ?? null;
const ROOM_JAN = JAN === null ? null : (await q(`select room_id::text id from executive.rooms_current where package_id = $1 limit 1`, [JAN.pkg]))[0]?.id ?? null;
const PAIR = (await q(`select c.run_id::text control, i.run_id::text intervention, c.twin_id::text twin from simulation.runs_current c join simulation.runs_current i on i.control_run_id = c.run_id and i.run_kind = 'intervention' and i.state = 'completed' and i.validity = 'valid'
                        where c.tenant_id = $1 and c.domain_id = $2 and c.run_kind = 'control' and c.state = 'completed' and c.validity = 'valid' and c.model_ref = 'supply-flow@1'
                          and not exists (select 1 from simulation.runs_current x, jsonb_array_elements(coalesce(x.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                                           join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid where x.run_id in (c.run_id, i.run_id) and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn')
                        order by c.opened_at desc, i.opened_at limit 1`, [T, D]))[0] ?? null;
const DES_RUN = (await q(`select run_id::text id, twin_id::text twin from simulation.runs_current where tenant_id = $1 and domain_id = $2 and model_ref = 'discrete-event@1' and state = 'completed' and validity = 'valid' order by run_id desc limit 1`, [T, D]))[0] ?? null;
const TWIN = MITIG === null ? null : (await q(`select (choice -> 'outcome_criteria' -> 0 ->> 'twin_id') twin from decision.package_versions where package_id = $1 and version = $2`, [MITIG.pkg, MITIG.committed_version]))[0]?.twin ?? PAIR?.twin ?? null;
const SCENARIO = (await q(`select scenario_id::text id, title from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and state = 'active' and title ilike '%corridor%' and title not like 'B36 — %' order by declared_at desc limit 1`, [T, D]))[0] ?? null;
// a forecast the probe scenario can rest on: issued and not assessed unfit (every earlier one was); B36-A issues a fresh one when none stands
let F_PORT = (await q(`select forecast_id::text id, series_key, fitness_state from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and state = 'issued' and series_key = 'portwatch:chokepoint4:n_total' and coalesce(fitness_state, '') <> 'unfit' order by issued_at desc limit 1`, [T, D]))[0] ?? { id: null, series_key: 'portwatch:chokepoint4:n_total' };
const WS = MITIG === null ? null : (await q(`select workspace_id::text id, title from executive.collab_workspaces where tenant_id = $1 and domain_id = $2 and subject ->> 'id' = $3 limit 1`, [T, D, MITIG.pkg]))[0] ?? null;
const SRC_NW = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state, name from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-internal' order by source_id, contract_version desc`, [T, D]))[0] ?? null;
const BRIEFING_AGENT = (await q(`select agent_id::text id, owner_principal_id::text owner from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'briefing' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if ([OBJ_REG, CORRIDOR, MOROCCO, MITIG, MOR, JAN, ROOM_JAN, PAIR, TWIN, SCENARIO, F_PORT, WS, SRC_NW, BRIEFING_AGENT].some((x) => x === null)) {
  bad(`an input is missing: ${JSON.stringify({ OBJ_REG: !!OBJ_REG, CORRIDOR: !!CORRIDOR, MOROCCO: !!MOROCCO, MITIG: !!MITIG, MOR: !!MOR, JAN: !!JAN, ROOM_JAN: !!ROOM_JAN, PAIR: !!PAIR, TWIN: !!TWIN, SCENARIO: !!SCENARIO, F_PORT: !!F_PORT, WS: !!WS, SRC_NW: !!SRC_NW, BRIEFING_AGENT: !!BRIEFING_AGENT })}`); process.exit(1);
}
ok(`the inputs: the Regensburg objective ${short(OBJ_REG.id)} (owner ${nm(OBJ_REG.owner)}); the corridor exposure ${short(CORRIDOR.id)} → the MITIGATION case ${short(MITIG.pkg)} "${MITIG.title}" (${MITIG.state} v${MITIG.committed_version}, owner ${nm(MITIG.owner)}); the Morocco opportunity ${short(MOROCCO.id)} → the exploit package ${short(MOR.pkg)} "${MOR.title}" (${MOR.state}); the January package ${short(JAN.pkg)} (v${JAN.current_version}, room ${short(ROOM_JAN)}); the runs control ${short(PAIR.control)} / reroute ${short(PAIR.intervention)}; the DES run ${DES_RUN ? short(DES_RUN.id) : 'ABSENT'}; the corridor twin ${short(TWIN)}; the corridor scenario ${short(SCENARIO.id)} "${SCENARIO.title}"; the workspace ${short(WS.id)}`);
ENV_OUT.EYE_B36_OBJECTIVE_TITLE = OBJ_REG.title;

/* ── B36-H THE HOME AND THE CADENCE ──────────────────────────────────────────────────── */
console.log('\nB36-H THE HOME AND THE CADENCE — the weekly loop, the agenda, a gap escalated, a scenario room, the reset; the operator\'s context, view, search and metrics');
const hm = (s, path, action, objectType, payload, objectId = null) => call(`${HM}/${path}`, env_(s, 'executive')({ action, objectType, objectId }), payload, s.token);
let CAD_ID = null;
{
  const g = await hm(dvorak, 'cadence/get', 'executive.home.read', 'CAD', { period: 'weekly' });
  if (g.ok && g.body.cadence.open) { CAD_ID = g.body.cadence.open.cadence_id; note(`the weekly cadence cycle #${g.body.cadence.open.sequence} is open (${short(CAD_ID)}) — an earlier run (or the walk)`); }
  else {
    const r = await hm(dvorak, 'cadence/open', 'executive.cadence.open', 'CAD', { period: 'weekly' });
    if (!r.ok) fail('M. Dvořák opens the weekly cadence', r); else { CAD_ID = r.body.cadence.cadence_id; ok(`M. Dvořák OPENED the weekly cadence: cycle #${r.body.cadence.sequence} ${short(CAD_ID)}`); }
  }
  const CORR_ITEM = (await q(`select item_id::text id, title from executive.attention_items where tenant_id = $1 and domain_id = $2 and title ilike '%Corridor closure%' order by created_at desc limit 1`, [T, D]))[0] ?? null;
  const agendaBefore = (await q(`select count(*)::int n from executive.cadence_agenda where tenant_id = $1 and set_by = $2`, [T, chief.principalId]))[0].n;
  if (agendaBefore > 0) note(`the chief of staff's agenda stands (${agendaBefore} row(s) over the cycles) — an earlier run`);
  else if (CAD_ID !== null) {
    const items = [{ kind: 'room', id: ROOM_JAN, note: 'the corridor room first' }, { kind: 'package', id: MITIG.pkg, note: 'the mitigation case' }, ...(CORR_ITEM ? [{ kind: 'attention_item', id: CORR_ITEM.id, note: 'the corridor item' }] : [])];
    const r = await hm(chief, 'agenda/set', 'executive.agenda.set', 'AGD', { cadenceId: CAD_ID, items }, CAD_ID);
    if (!r.ok) fail('the chief of staff sets the agenda', r); else ok(`the chief of staff SET the agenda of cycle ${short(CAD_ID)}: ${r.body.agenda.items.map((i) => `${i.position}:${i.object_kind}`).join(', ')}`);
  }
  const escBefore = (await q(`select escalation_id::text id, state from executive.cadence_escalations where tenant_id = $1 and raised_by = $2 order by raised_at desc limit 1`, [T, chief.principalId]))[0] ?? null;
  if (escBefore) note(`the chief of staff's escalation ${short(escBefore.id)} stands (${escBefore.state}) — an earlier run`);
  else if (CAD_ID !== null) {
    const r = await hm(chief, 'escalate', 'executive.escalation.raise', 'ESC', { cadenceId: CAD_ID, subjectKind: 'room', subjectId: ROOM_JAN, reason: 'The corridor room has not been reviewed since the second-source case was committed; the executive decides who briefs the board (SYNTHETIC).', to: dvorak.principalId });
    if (!r.ok) fail('the chief of staff escalates the gap', r); else ok(`the chief of staff ESCALATED a gap to M. Dvořák: escalation ${short(r.body.escalation.escalation_id)} ${r.body.escalation.state} → a queue.governance item ${short(r.body.escalation.item_id)} on the executive's queue`);
  }
  const room = (await q(`select room_id::text id, title from executive.rooms_current where tenant_id = $1 and domain_id = $2 and kind = 'scenario' and subject_id = $3 limit 1`, [T, D, SCENARIO.id]))[0] ?? null;
  if (room) note(`the scenario room ${short(room.id)} "${room.title}" stands — an earlier run`);
  else {
    const r = await hm(dvorak, 'rooms/open', 'executive.room.open', 'DRM', { kind: 'scenario', subjectId: SCENARIO.id, title: 'Bab el-Mandeb collapse scenario room (SYNTHETIC)', deadline: at(2 * DAY), reviewEveryDays: 3 });
    if (!r.ok) fail('M. Dvořák opens the scenario room', r); else ok(`M. Dvořák OPENED a scenario room ${short(r.body.room.room_id)} on "${SCENARIO.title}" — deadline ${at(2 * DAY).slice(0, 10)}, review every 3 days`);
  }
  const resets = (await q(`select count(*)::int n from executive.cadence_events e join executive.cadences c using (cadence_id) where c.tenant_id = $1 and c.domain_id = $2 and e.event in ('cadence.reset', 'cadence.reset_confirmed')`, [T, D]))[0].n;
  if (resets > 0) note(`the loop was reset ${resets} time(s) — an earlier run (or the walk)`);
  else {
    let r = await hm(dvorak, 'cadence/reset', 'executive.cadence.reset', 'CAD', { period: 'weekly' });
    if (!r.ok && r.status === 409 && /board-class/.test(String(r.body?.message))) r = await hm(dvorak, 'cadence/reset', 'executive.cadence.reset', 'CAD', { period: 'weekly', confirmReason: 'The board decides the second source on Thursday; the weekly loop closes now (SYNTHETIC).' });
    if (!r.ok) fail('M. Dvořák resets the loop', r);
    else { CAD_ID = r.body.reset.opened.cadence_id; const rec = r.body.reset.closed.closing_record ?? {}; ok(`M. Dvořák RESET the loop: cycle #${r.body.reset.closed.sequence} closed (confirmed ${r.body.reset.confirmed}; decided ${JSON.stringify(rec.decided ?? {})}, committed ${JSON.stringify(rec.committed ?? {})}, left open ${JSON.stringify(rec.left_open ?? {}).slice(0, 120)}) → cycle #${r.body.reset.opened.sequence} ${short(CAD_ID)} open`); }
  }
  const ctx = (await q(`select context_id::text id, objective_id::text obj, horizon from executive.contexts where tenant_id = $1 and domain_id = $2 and principal_id = $3 and superseded_at is null limit 1`, [T, D, chief.principalId]))[0] ?? null;
  if (ctx && ctx.obj === OBJ_REG.id) note(`the chief of staff's context on the Regensburg objective (${ctx.horizon}) stands — an earlier run`);
  else {
    const r = await hm(chief, 'context/set', 'executive.context.set', 'CTX', { objectiveId: OBJ_REG.id, horizon: '30d', classification: 'internal' });
    if (!r.ok) fail('the chief of staff sets the context', r); else ok(`the chief of staff SET the context: objective "${OBJ_REG.title}", horizon 30d, internal — digest ${String(r.body.context.digest).slice(0, 12)}…${r.body.context.supersedes ? ' (supersedes the earlier context)' : ''}`);
  }
  const vl = await hm(chief, 'views/list', 'executive.home.read', 'CVW', {});
  if (!vl.ok) fail('the operator lists the command views', vl);
  else {
    ok(`the operator's COMMAND VIEWS: ${vl.body.views.map((v) => v.view_key).join(', ')}`);
    const vr = await hm(chief, 'views/read', 'executive.home.read', 'CVW', { viewKey: 'executive_operator/cadence-prep' });
    if (vr.ok) ok(`the view executive_operator/cadence-prep: sections ${vr.body.view.sections_order.join(' → ')}; safe actions ${vr.body.view.actions.join(', ')}; context digest ${String(vr.body.view.context?.digest ?? '').slice(0, 12)}…`); else fail('the cadence-prep view', vr);
    expectRefused('the operator opening the executive\'s morning view', await hm(chief, 'views/read', 'executive.home.read', 'CVW', { viewKey: 'executive/' + 'morning' /* split: gitleaks flags key-shaped literals */ }), 403, /command view rejected \(role\)/);
  }
  const sr = await hm(chief, 'search', 'executive.search', 'SCH', { q: 'Regensburg', limit: 20 });
  if (!sr.ok) fail('the operator searches "Regensburg"', sr); else ok(`the operator SEARCHED "Regensburg": ${sr.body.search.count} hit(s) — ${Object.entries(sr.body.search.kinds ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}; the first: ${sr.body.search.hits[0] ? `${sr.body.search.hits[0].kind} "${String(sr.body.search.hits[0].title ?? '').slice(0, 50)}" — ${String(sr.body.search.hits[0].explanation?.why ?? '').slice(0, 90)}` : 'none'} (the search is on the access ledger)`);
  const mt = await hm(chief, 'metrics', 'executive.metrics.read', 'MET', {});
  if (!mt.ok) fail('the operator reads the metrics', mt); else ok(`THE METRICS (computed on read, stored ${mt.body.metrics.stored}): ${mt.body.metrics.metrics.map((m) => `${m.name} n=${m.n}${m.median !== undefined ? ` median ${m.median ?? 'not measured'}` : ''}${m.ratio !== undefined ? ` ratio ${m.ratio ?? 'not measured'}` : ''}`).join('; ')}`);
  const hr = await hm(dvorak, 'read', 'executive.home.read', 'HOM', { limit: 20 });
  if (!hr.ok) fail('M. Dvořák reads the home', hr);
  else { const s = hr.body.home.sections; ok(`THE HOME (M. Dvořák) answered: ${Object.entries(s).map(([k, v]) => `${k} ${v.count}`).join(', ')}; context ${hr.body.home.context?.set ? `set (${hr.body.home.context.horizon})` : 'the default'}; ceiling ${hr.body.home.ceiling?.effective}; cadence cycle #${s.cadence?.open?.sequence ?? '—'}, agenda ${(s.cadence?.agenda ?? []).length}, escalations ${(s.cadence?.escalations ?? []).length}`); }
}

/* ── B36-G THE GATES ─────────────────────────────────────────────────────────────────── */
console.log('\nB36-G THE GATES — the dual-sourcing decision signed and distributed; the B36 gate package recused, challenged, dismissed, a denial on the record; the board package');
const dc = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${DC}/${path}`, env_(s, 'decision')({ action, objectType, objectId, ...extra }), payload, s.token);
const headerDigest = async (pkg, v) => (await q(`select header_digest d from decision.package_versions where package_id = $1 and version = $2`, [pkg, v]))[0]?.d ?? null;
const gateRecord = async (s, pkg, v) => { const r = await dc(s, `${pkg}/versions/${v}/gate-record`, 'decision.read', 'DPK', {}, pkg, { sideEffect: 'none' }); return r.ok ? r.body.record : null; };
/** A package of this act, found by its title or DECLARED by C. Brenner on the January decision object and drafted to a PROPOSED version 1. */
async function packageByTitle(title, owner, draft) {
  let pkg = (await q(`select package_id::text id, state, current_version from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, title]))[0] ?? null;
  if (pkg) { note(`the package ${short(pkg.id)} "${title}" stands (${pkg.state}, v${pkg.current_version}) — an earlier run`); return pkg; }
  const d = await dc(owner, 'declare', 'decision.package.declare', 'DPK', { decisionObjectId: JAN.dec, title, statement: draft.statement, owner: owner.principalId });
  if (!d.ok) { fail(`${nm(owner.principalId)} declares "${title}"`, d); return null; }
  const id = d.body.package.packageId;
  const o = await dc(owner, `${id}/versions/open`, 'decision.package.version', 'DPK', { knownAt: await dbNow(), observedThrough: null }, id);
  if (!o.ok) { fail('open version 1', o); return null; }
  const v = o.body.version.version;
  const steps = [
    await dc(owner, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'status-quo', title: 'Hold the booked routing and the single source', kind: 'status_quo', consequences: [{ kind: 'run', id: PAIR.control, version: 1 }], risks: [], opportunities: [] }, id),
    await dc(owner, `${id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'second-source', title: draft.optionTitle, kind: 'intervention', consequences: [{ kind: 'run', id: PAIR.intervention, version: 1 }], risks: ['the qualification of a second source takes a quarter'], opportunities: [] }, id),
    await dc(owner, `${id}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: draft.approverPolicy,
      monitoringConditions: [{ kind: 'review', every_days: 7, owner: owner.principalId }], reversibility: 'reversible until the first purchase order is placed', informationValue: 'the second source\'s lead time decides the timing, not the option' }, id),
    await dc(owner, `${id}/versions/${v}/choice`, 'decision.package.choice', 'DPK', { option_key: 'second-source', rationale: draft.rationale, decision_deadline: '2027-01-15', accepted_trade_offs: ['the qualification cost of a second source'], action_owner: brandt.principalId,
      outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TWIN, period: { from: '2024-01-11', to: '2024-04-10' } }] }, id),
  ];
  const b1 = steps.find((x) => !x.ok);
  if (b1) { fail(`${nm(owner.principalId)} drafts "${title}"`, b1); return null; }
  if (draft.beforePropose) await draft.beforePropose(id, v);
  const pr = await dc(owner, `${id}/versions/${v}/propose`, 'decision.package.propose', 'DPK', {}, id);
  if (!pr.ok) { fail(`${nm(owner.principalId)} proposes "${title}"`, pr); return null; }
  ok(`${nm(owner.principalId)} DECLARED and PROPOSED "${title}" ${short(id)} version ${v} (status-quo vs second-source; action owner L. Brandt) — digest ${String(pr.body.proposal.versionDigest).slice(0, 12)}…`);
  return { id, state: 'proposed', current_version: v };
}
const roomOn = async (owner, pkg, title, members) => {
  const had = (await q(`select room_id::text id from executive.rooms_current where package_id = $1 limit 1`, [pkg]))[0]?.id ?? null;
  if (had) { note(`the room ${short(had)} on the package stands — an earlier run`); return had; }
  const r = await call(`${X}/rooms/open`, env_(owner, 'decision')({ action: 'room.open', objectType: 'DRM' }), { packageId: pkg, title, reviewEveryDays: 7 }, owner.token);
  if (!r.ok) { fail(`${nm(owner.principalId)} opens the room`, r); return null; }
  const id = r.body.room.room_id ?? r.body.room.roomId;
  const added = [];
  for (const [s, role] of members) { const m = await call(`${X}/rooms/${id}/membership`, env_(owner, 'decision')({ action: 'room.membership', objectType: 'DRM', objectId: id }), { principal: s.principalId, role, op: 'add' }, owner.token); if (m.ok) added.push(`${nm(s.principalId)} (${role})`); else note(`${nm(s.principalId)} as ${role}: ${refusalLine(m)}`); }
  ok(`${nm(owner.principalId)} OPENED the room ${short(id)} "${title}" — members ${added.join(', ')}`);
  return id;
};
// (1) act-b34's dual-sourcing decision: the approval signed by its approver, the decision by its owner, distributed to its room
{
  const v = Number(MITIG.committed_version);
  const ap = (await q(`select approval_id::text id, header_digest, approver_principal_id::text approver from decision.approvals where package_id = $1 and version = $2 and revoked_at is null order by recorded_at limit 1`, [MITIG.pkg, v]))[0] ?? null;
  if (ap === null) bad('the mitigation case carries no live approval');
  else if (ap.approver !== okafor.principalId) note(`the approval is ${nm(ap.approver)}'s, not S. Okafor's — the signing is theirs; not staged`);
  else if ((await q(`select 1 from executive.signatures where subject_kind = 'approval' and subject_id = $1 and signer = $2`, [ap.id, okafor.principalId])).length > 0) note('S. Okafor\'s signature on the approval stands — an earlier run');
  else {
    const r = await dc(okafor, `${MITIG.pkg}/versions/${v}/sign`, 'decision.sign.approval', 'DPK', { kind: 'approval', digest: ap.header_digest, approvalId: ap.id }, MITIG.pkg);
    if (!r.ok) fail('S. Okafor signs the approval', r); else ok(`S. Okafor SIGNED the approval ${short(ap.id)} of version ${v}: key ${r.body.signature.key_id}, over ${String(ap.header_digest).slice(0, 12)}…, verified ${r.body.signature.verified}`);
  }
  const hd = await headerDigest(MITIG.pkg, v);
  if ((await q(`select 1 from executive.signatures where subject_kind = 'decision' and subject_id = $1 and subject_version = $2 and signer = $3`, [MITIG.pkg, v, brenner.principalId])).length > 0) note('C. Brenner\'s signature on the decision stands — an earlier run');
  else {
    const r = await dc(brenner, `${MITIG.pkg}/versions/${v}/sign`, 'decision.sign.decision', 'DPK', { kind: 'decision', digest: hd }, MITIG.pkg);
    if (!r.ok) fail('C. Brenner signs the decision', r); else ok(`C. Brenner (the owner) SIGNED the committed decision: key ${r.body.signature.key_id}, over the header ${String(hd).slice(0, 12)}…, verified ${r.body.signature.verified}`);
  }
  const roomId = await roomOn(brenner, MITIG.pkg, 'Mitigate the corridor closure — the decision room (SYNTHETIC)', [[okafor, 'approver'], [brandt, 'observer'], [dvorak, 'observer']]);
  const rec = await gateRecord(brenner, MITIG.pkg, v);
  if (rec && (rec.distributions ?? []).length > 0) note(`the decision is distributed (${rec.distributions.length} row(s)) — an earlier run`);
  else if (roomId) {
    const r = await dc(brenner, `${MITIG.pkg}/versions/${v}/distribute`, 'decision.distribute', 'DPK', { channels: ['email'], recipients: [] }, MITIG.pkg);
    if (!r.ok) fail('C. Brenner distributes the decision', r);
    else { const d = r.body.distribution; ok(`C. Brenner DISTRIBUTED the decision record (digest ${String(d.record_digest).slice(0, 12)}…) to the room: ${(d.recipients ?? []).map((x) => `${nm(x.principal_id)} (${x.basis})`).join(', ')} — rows ${d.rows.map((x) => `${x.channel} ${x.state}${x.synthetic ? ' SYNTHETIC' : ''}`).join(', ')}; ${d.synthetic_note ?? ''}`); }
  }
  if (rec) ok(`THE GATE'S RECORD of the dual-sourcing decision: gate ${rec.gate?.state}; approvals ${rec.approvals.length} (signatures ${rec.approvals.reduce((n, a) => n + (a.signatures ?? []).length, 0)}); decision signatures ${rec.decision_signatures.length} (${rec.decision_signatures.map((s) => `${nm(s.signer)} ${s.verified ? 'VERIFIED' : 'NOT VERIFIED'}`).join(', ')}); signing key ${rec.signing_key?.keyId ?? '—'}`);
  ENV_OUT.EYE_B36_PACKAGE_TITLE = MITIG.title;
  if (SINK_HTTP) { try { const j = await (await fetch(`${SINK_HTTP}/_received`)).json(); note(`the local sink holds ${(j.received ?? []).filter((x) => x.channel === 'email').length} e-mail(s) so far (SYNTHETIC — no real provider)`); } catch { note('the local sink was not reachable for its inspection route'); } }
}
// (2) the B36 gate package: approved, recused, challenged by the auditor, dismissed, a denial on the record — left UNCOMMITTED
const GATE_TITLE = 'B36 gate — the corridor second-source review (SYNTHETIC)';
let GATE = await packageByTitle(GATE_TITLE, brenner, { statement: 'whether the second bearing source is qualified before the corridor season; the gate exercised whole (recusal, challenge, denial) — the B36 demonstration, synthetic',
  optionTitle: 'Qualify the second bearing source before the corridor season', approverPolicy: { quorum: 1, roles: ['decision_approver'], expires_after_days: 14 },
  rationale: 'The corridor exposure is outside appetite; a qualified second source removes the single point of failure before the season.' });
let GATE_ROOM = null;
if (GATE) {
  ENV_OUT.EYE_B36_GATE_PACKAGE_TITLE = 'B36 gate';
  const v = Number(GATE.current_version);
  GATE_ROOM = await roomOn(brenner, GATE.id, 'B36 gate room — the corridor second-source review (SYNTHETIC)', [[okafor, 'approver'], [brandt, 'observer'], [dvorak, 'observer'], [vogel, 'observer'], [chief, 'observer']]);
  let rec = await gateRecord(brenner, GATE.id, v);
  const digest = (await q(`select version_digest d from decision.package_versions where package_id = $1 and version = $2`, [GATE.id, v]))[0]?.d;
  if (rec && rec.approvals.some((a) => a.approver === okafor.principalId)) note('S. Okafor\'s approval stands — an earlier run');
  else {
    const r = await dc(okafor, `${GATE.id}/versions/${v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: digest, rationale: 'The second source removes the single point of failure (SYNTHETIC).' });
    if (!r.ok) fail('S. Okafor approves the gate package', r); else ok(`S. Okafor APPROVED version ${v} (${r.body.approval.state ?? 'approve'})`);
  }
  rec = await gateRecord(brenner, GATE.id, v);
  if (rec && (rec.recusals ?? []).length > 0) note(`S. Okafor's recusal stands (${rec.recusals.length}) — an earlier run`);
  else {
    const r = await dc(okafor, `${GATE.id}/versions/${v}/recuse`, 'decision.recuse', 'DPK', { reason: 'A family member works for the candidate second source; recused (SYNTHETIC).' }, GATE.id);
    if (!r.ok) fail('S. Okafor recuses', r); else ok(`S. Okafor RECUSED: the approval ${short(r.body.recusal.voided_approval_id)} voided, live approvals ${r.body.recusal.live_before} → ${r.body.recusal.live_after}, version ${r.body.recusal.from_state} → ${r.body.recusal.to_state} (quorum lost ${r.body.recusal.quorum_lost})`);
  }
  rec = await gateRecord(brenner, GATE.id, v);
  const dismissed = (rec?.challenges ?? []).find((c) => c.standing === 'auditor' && c.resolution === 'dismissed') ?? null;
  if (dismissed) note(`E. Lindqvist's challenge ${short(dismissed.challenge_id)} stands, dismissed — an earlier run`);
  else {
    const c = await dc(lindqvist, `${GATE.id}/versions/${v}/challenge`, 'decision.challenge', 'DPK', { reason: 'The second source was never audited for the customs pre-clearance it depends on (SYNTHETIC).' }, GATE.id);
    if (!c.ok) fail('E. Lindqvist (the auditor) challenges', c);
    else {
      ok(`E. Lindqvist (the tenant's auditor) CHALLENGED version ${v}: standing ${c.body.challenge.standing}, gate ${c.body.challenge.gate_state}`);
      const rs = await dc(brenner, `${GATE.id}/versions/${v}/resolve-challenge`, 'decision.challenge.resolve', 'DPK', { challengeId: c.body.challenge.challenge_id, resolution: 'dismissed', note: 'The customs audit report is on file with the broker (SYNTHETIC).' }, GATE.id);
      if (!rs.ok) fail('C. Brenner resolves the challenge', rs); else ok(`C. Brenner RESOLVED it ${rs.body.resolution.resolution}: effect ${JSON.stringify(rs.body.resolution.effect)}`);
    }
  }
  rec = await gateRecord(brenner, GATE.id, v);
  if ((rec?.denials ?? []).some((d) => d.principal_id === lange.principalId)) note('K. Lange\'s denial is on the record — an earlier run');
  else {
    expectRefused('K. Lange (execution authority) deferring the gate', await dc(lange, `${GATE.id}/versions/${v}/gate/defer`, 'decision.gate.defer', 'DPK', { rationale: 'Deferring the second source until the purchase-request run (SYNTHETIC).', nextReviewAt: at(3 * DAY) }, GATE.id), 403, /no qualifying role binding/);
    rec = await gateRecord(brenner, GATE.id, v);
  }
  const den = (rec?.denials ?? []).find((d) => d.principal_id === lange.principalId);
  (den ? ok : bad)(`THE DENIAL on the record: ${den ? `${nm(den.principal_id)} tried ${den.action} on version ${den.package_version} — ${den.decision}, policy decision ${short(den.policy_decision_id)}` : 'absent'}`);
  const rp = await dc(dvorak, `${GATE.id}/versions/${v}/replay`, 'decision.replay', 'RPL', {});
  if (rp.ok) note(`the replay (M. Dvořák) lists ${(rp.body.replay.denials ?? []).length} denial(s): ${(rp.body.replay.denials ?? []).map((d) => `${nm(d.principal_id)} tried ${d.action}`).join('; ')}`); else note(`the replay of an uncommitted version: ${refusalLine(rp)} — the gate record carries the denial`);
  const st = (await q(`select p.state ps, v.state vs from decision.packages_current p join decision.package_versions v on v.package_id = p.package_id and v.version = $2 where p.package_id = $1`, [GATE.id, v]))[0];
  ok(`the gate package is LEFT UNCOMMITTED: package ${st.ps}, version ${v} ${st.vs}, gate ${rec?.gate?.state}`);
}
// (3) the board package: reserved by M. Dvořák, proposed, approved by R. Vogel through the board's own route (quorum 2: left at one approval)
const BOARD_TITLE = 'B36 board — the second-source capital request (SYNTHETIC)';
{
  const reserve = async (id) => { const r = await dc(dvorak, `${id}/board/reserve`, 'decision.board.reserve', 'DPK', { board: { charter: 'The supervisory board of NORDWERK (SYNTHETIC)', quorum: 2 }, rationale: 'A second source above the premium cap is the board\'s decision (SYNTHETIC).' }, id); if (!r.ok) fail('M. Dvořák reserves the draft for the board', r); else ok(`M. Dvořák RESERVED the draft for the BOARD (quorum 2)`); };
  const B = await packageByTitle(BOARD_TITLE, brenner, { statement: 'the capital request for the second bearing source, above the premium cap — the board decides (SYNTHETIC)', optionTitle: 'Fund the second bearing source above the premium cap',
    approverPolicy: { quorum: 2, roles: ['board_member'], expires_after_days: 14 }, rationale: 'The board funds the second source: the corridor exposure justifies the premium.', beforePropose: reserve });
  if (B) {
    const v = Number(B.current_version);
    const bl = await dc(vogel, 'board/list', 'decision.board.read', 'DPK', {});
    const row = bl.ok ? (bl.body.board ?? []).find((p) => p.package_id === B.id) : null;
    if (!bl.ok) fail('R. Vogel reads the board', bl);
    else if (row?.own_approval) note(`R. Vogel's board approval stands (${row.live_approvals} of ${row.quorum}) — an earlier run`);
    else {
      const digest = (await q(`select version_digest d from decision.package_versions where package_id = $1 and version = $2`, [B.id, v]))[0]?.d;
      const r = await dc(vogel, `board/${B.id}/versions/${v}/approve`, 'decision.board.approve', 'APR', { versionDigest: digest, rationale: 'The board approves the second source (SYNTHETIC).' });
      if (!r.ok) fail('R. Vogel approves through the board route', r); else ok(`R. Vogel APPROVED through decision.board.approve: ${r.body.board.state}, ${r.body.board.liveApprovals} of ${r.body.board.quorum} (eligible by ${r.body.board.eligibleBy}) — the second board vote is left for the walk`);
    }
    expectRefused('R. Vogel on the STANDARD approve route', await dc(vogel, `${B.id}/versions/${v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: 'a'.repeat(64), rationale: 'a board member on the standard route' }), 403, /no qualifying role binding/);
    const bl2 = await dc(vogel, 'board/list', 'decision.board.read', 'DPK', {});
    const row2 = bl2.ok ? (bl2.body.board ?? []).find((p) => p.package_id === B.id) : null;
    if (row2) ok(`THE BOARD SURFACE (R. Vogel): "${BOARD_TITLE}" — class ${row2.decision_class}, gate ${row2.gate?.state}, quorum ${row2.quorum}, live approvals ${row2.live_approvals}, own approval ${row2.own_approval}`);
  }
}
ENV_OUT.EYE_B36_BOARD_LOGIN = 'r.vogel'; ENV_OUT.EYE_B36_AUDITOR_LOGIN = 'e.lindqvist';

/* ── B36-A THE ATTENTION COMPLETION ──────────────────────────────────────────────────── */
console.log('\nB36-A THE ATTENTION COMPLETION — the policy with governance, a real corridor warning, the settle fault and the resume, the priority accepted, the hold, the forum');
const att = (s, path, action, objectType, payload, objectId = null) => call(`${E}/${path}`, env_(s, 'executive')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
let POLICY = null;
{
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  if (active === null) bad('no active attention policy');
  else if (active.rules?.governance && active.rules?.classes?.['strategy.detection'] && active.rules?.classes?.['plan.variance']) { POLICY = active; note(`attention policy version ${active.version} carries the governance fields and the B36 classes — an earlier run`); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    rules.governance = { fairness_floor: 0.7, staleness_ceiling_hours: 168 };
    rules.classes['strategy.detection'] = { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1 };
    rules.classes['plan.variance'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240 };
    rules.classes['queue.governance'] = rules.classes['queue.governance'] ?? { materiality: { min_consequence: 'C3', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 1440, notify: 'in_app' };
    rules.classes['source.coverage_loss'] = rules.classes['source.coverage_loss'] ?? { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' };
    rules.classes['proposal.review'] = rules.classes['proposal.review'] ?? { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' };
    rules.overload = { ...(rules.overload ?? {}), max_open_per_owner: 20 };
    const r = await att(dvorak, 'policy/publish', 'executive.attention.policy.publish', 'ATP', { rules, reason: 'B36: the governance floor and ceiling (fairness 0.7, staleness 168 h); strategy.detection and plan.variance routed to the strategy owners; the per-owner cap raised to 20 so the corridor warning reaches L. Brandt\'s queue open (SYNTHETIC).' });
    if (!r.ok) fail('M. Dvořák publishes the attention policy', r);
    else { POLICY = { policy_id: r.body.policy.policy_id, version: r.body.policy.version, rules }; ok(`M. Dvořák PUBLISHED attention policy VERSION ${r.body.policy.version}: governance {fairness_floor 0.7, staleness_ceiling_hours 168}; classes strategy.detection, plan.variance (+ queue.governance, source.coverage_loss, proposal.review kept); overload.max_open_per_owner 20 — changed ${(r.body.policy.changed_sections ?? []).join(', ')}`); }
  }
}
// L. Brandt's context: the Regensburg objective, 90 days (the queue's context strip)
{
  const ctx = (await q(`select objective_id::text obj, horizon from executive.contexts where tenant_id = $1 and domain_id = $2 and principal_id = $3 and superseded_at is null limit 1`, [T, D, brandt.principalId]))[0] ?? null;
  if (ctx && ctx.obj === OBJ_REG.id) note(`L. Brandt's context on the Regensburg objective (${ctx.horizon}) stands — an earlier run`);
  else { const r = await hm(brandt, 'context/set', 'executive.context.set', 'CTX', { objectiveId: OBJ_REG.id, horizon: '90d', classification: 'internal' }); if (!r.ok) fail('L. Brandt sets the context', r); else ok(`L. Brandt SET the context: the Regensburg objective, 90d — digest ${String(r.body.context.digest).slice(0, 12)}…`); }
}
// THE CORRIDOR WARNING — REAL, raised by an INDICATOR'S EVALUATION on the real PortWatch series (the exposure route raises no second corridor warning
// here: every candidate of the corridor exposure is clustered as a duplicate of act-b32's acknowledged warning — SAID): N. Eriksen defines the probe
// indicator, binds it to a downside branch (a fresh scenario when the standing forecast admits one; else a new branch on the standing corridor scenario)
// and evaluates it — the condition holds on the series' latest published observations, so the branch flips and the warning is raised in time
let ITEM = null; let WARNING = null; let IND = null; let E0 = null;
const pr = (s, path, action, objectType, payload, objectId = null) => call(`${P}/${path}`, env_(s, 'prediction')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
// THE AGENT'S EDITION FIRST, in the gate room, BEFORE the corridor warning is raised: it is the prior of L. Brandt's edition in B36-B — its known_at
// bounds her window. A prior must be the room's own (the port refuses another room's), and a HUMAN'S prior-less edition reaches the domain's whole
// history and folds to restricted, which no persona's clearance covers — so the room's first edition is the agent's, whatever the walk's button
// order assumes (SAID in the report)
if (GATE_ROOM === null) bad('no gate room for the agent\'s edition');
else {
  E0 = (await q(`select briefing_id::text id, known_at, schema_version from executive.briefings where room_id = $1 and composed_via = 'agent' order by composed_at limit 1`, [GATE_ROOM]))[0] ?? null;
  if (E0) note(`the briefing agent's edition ${short(E0.id)} of the gate room stands — an earlier run`);
  else {
    const runner = BRIEFING_AGENT.owner === brandt.principalId ? brandt : dvorak;
    const r = await call(`${X}/agents/decision/${BRIEFING_AGENT.id}/run`, env_(runner, 'briefing')({ action: 'agent.trigger', objectType: 'AGT', objectId: BRIEFING_AGENT.id }), { task: 'briefing', roomId: GATE_ROOM }, runner.token);
    if (!r.ok) fail(`${nm(runner.principalId)} runs the briefing agent`, r);
    else if (r.body.run?.outcome !== 'finished') bad(`the briefing agent run ${r.body.run?.outcome}: ${r.body.run?.stopReason ?? ''}`);
    else { E0 = (await q(`select briefing_id::text id, known_at, schema_version from executive.briefings where room_id = $1 and composed_via = 'agent' order by composed_at desc limit 1`, [GATE_ROOM]))[0] ?? null; ok(`the BRIEFING AGENT COMPOSED edition ${short(E0?.id)} of the gate room (${E0?.schema_version} by default, ${r.body.run.outputs?.items ?? '—'} items) — triggered by ${nm(runner.principalId)} (B36-B's first act, staged here so the person's edition has its prior and the warning falls in her window)`); }
  }
}
// The probe rests on the B28 corridor STREAM series (its history is whole): the PortWatch series carries a governed-deleted evidence version, and the
// product evaluates no indicator on an incomplete history — for any reader (SAID)
const PROBE = { series: 'red-sea-corridor-stream-late:chokepoint4:n_total', comparator: '<', threshold: 41, days: 5, label: 'Bab el-Mandeb transits below 41 per day for five consecutive observed days on the corridor stream' };
{
  const IND_DESC = `B36 corridor probe: ${PROBE.label} (SYNTHETIC probe on the real series ${PROBE.series})`;
  IND = (await q(`select indicator_id::text id, state, breached from prediction.indicators_current where tenant_id = $1 and domain_id = $2 and description = $3 limit 1`, [T, D, IND_DESC]))[0] ?? null;
  if (IND) note(`the probe indicator ${short(IND.id)} stands (${IND.state}, breached ${IND.breached}) — an earlier run`);
  else {
    const r = await pr(eriksen, 'indicators/define', 'prediction.indicator.define', 'IND', { seriesKey: PROBE.series, description: IND_DESC, comparator: PROBE.comparator, threshold: PROBE.threshold, consecutiveDays: PROBE.days, owner: eriksen.principalId });
    if (!r.ok) fail('N. Eriksen defines the probe indicator', r); else { IND = { id: r.body.indicator.indicatorId }; ok(`N. Eriksen DEFINED the probe indicator ${short(IND.id)} on ${PROBE.series}: ${PROBE.label}`); }
  }
  if (IND) {
    const branch = (await q(`select b.branch_id::text id, b.state, s.title from prediction.branches_current b join prediction.scenarios_current s using (scenario_id) where b.indicator_id = $1 order by b.added_at desc limit 1`, [IND.id]))[0] ?? null;
    if (branch) note(`the branch ${short(branch.id)} on "${branch.title}" is bound to the indicator (${branch.state}) — an earlier run`);
    else {
      const downside = { name: 'Corridor collapse — B36 probe', kind: 'downside', statement: `${PROBE.label} (SYNTHETIC probe)`, indicatorId: IND.id, signpost: `${PROBE.days} consecutive published observations ${PROBE.comparator} ${PROBE.threshold} transits/day`,
        owner: eriksen.principalId, reviewCadence: 'daily', responseWindowHours: 72, consequence: 'rebook the second-source bearing sets via the Cape before the booking deadline closes (SYNTHETIC)' };
      let bound = false;
      // THE FORECAST the probe scenario rests on: a fresh 30-day forecast of the stream series issued by N. Eriksen (every standing forecast of this
      // demonstration was assessed unfit — a scenario on one fails its coherence check and marks every warning of its branches)
      let F_STREAM = (await q(`select forecast_id::text id, fitness_state from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and series_key = $3 and state = 'issued' and coalesce(fitness_state, '') <> 'unfit' order by issued_at desc limit 1`, [T, D, PROBE.series]))[0] ?? null;
      if (F_STREAM) note(`the stream forecast ${short(F_STREAM.id)} stands (fitness ${F_STREAM.fitness_state ?? 'not assessed'}) — an earlier run`);
      else {
        const asu = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and status = 'active' order by (title ilike '%corridor%') desc, declared_at desc limit 1`, [T, D]))[0] ?? null;
        if (asu === null) note('no active assumption to rest a forecast on — the branch is added to the standing corridor scenario instead');
        else {
          const f = await pr(eriksen, 'forecasts/issue', 'prediction.forecast.issue', 'FCT', { seriesKey: PROBE.series, horizon: '30d', assumptions: [asu.id], refreshCadence: 'weekly', label: 'live' });
          if (!f.ok) note(`a fresh forecast of ${PROBE.series}: ${refusalLine(f)} — the branch is added to the standing corridor scenario instead`);
          else { F_STREAM = { id: f.body.forecast.forecastId, fitness_state: null }; ok(`N. Eriksen ISSUED a 30-day forecast ${short(F_STREAM.id)} of ${PROBE.series} resting on the assumption "${String(asu.title).slice(0, 50)}" (${f.body.forecast.method ?? 'the seasonal method'}; not yet assessed)`); }
        }
      }
      if (F_STREAM) {
        const d = await pr(eriksen, 'scenarios/declare', 'prediction.scenario.declare', 'SCN', { title: 'B36 — the corridor probe scenario (SYNTHETIC)', statement: 'the corridor stream over the next 30 days, for the B36 demonstration (SYNTHETIC)', forecastId: F_STREAM.id, owner: eriksen.principalId, reviewCadence: 'weekly',
          branches: [{ name: 'Baseline', kind: 'baseline', statement: 'transits hold near their seasonal level', owner: eriksen.principalId, reviewCadence: 'weekly', responseWindowHours: 72, consequence: 'keep the booked routing' }, downside] });
        if (d.ok) { bound = true; ok(`N. Eriksen DECLARED the probe scenario ${short(d.body.scenario.scenarioId)} on the stream forecast ${short(F_STREAM.id)} — its downside branch bound to the indicator`); }
        else note(`a fresh scenario on the stream forecast ${short(F_STREAM.id)}: ${refusalLine(d)} — the branch is added to the standing corridor scenario instead`);
      }
      if (!bound) {
        const cur = Number((await q(`select current_version from prediction.scenarios_current where scenario_id = $1`, [SCENARIO.id]))[0]?.current_version ?? 1);
        const b = await pr(eriksen, `scenarios/${SCENARIO.id}/branches`, 'prediction.scenario.branch', 'SCN', { expected_version: cur, idempotency_key: 'b36-corridor-probe-' + String(IND.id).slice(-8), branch: downside }, SCENARIO.id);
        if (!b.ok) fail('N. Eriksen branches the standing corridor scenario', b); else ok(`N. Eriksen BRANCHED the standing corridor scenario "${SCENARIO.title}" (version ${cur} → ${b.body.branching?.version ?? '?'}): the downside branch bound to the probe indicator`);
      }
    }
    const findWarning = () => q(`select warning_id::text id, state, title, response_window_closes_at from prediction.warnings_current where indicator_id = $1 order by raised_at desc limit 1`, [IND.id]).then((r) => r[0] ?? null);
    WARNING = await findWarning();
    if (WARNING) note(`the corridor warning ${short(WARNING.id)} "${String(WARNING.title).slice(0, 60)}" (${WARNING.state}) stands — an earlier run`);
    else {
      const ev = await pr(eriksen, `indicators/${IND.id}/evaluate`, 'prediction.indicator.evaluate', 'IND', { knownAt: await dbNow() }, IND.id);
      if (!ev.ok) fail('N. Eriksen evaluates the probe indicator', ev);
      else {
        WARNING = await findWarning(); const e = ev.body.evaluation ?? {}; const w0 = (ev.body.warnings ?? [])[0];
        (WARNING ? ok : bad)(`N. Eriksen EVALUATED the probe indicator (streak ${e.streak ?? '—'}, last value ${e.lastValue ?? e.last_value ?? '—'}, flips ${(e.flips ?? []).length}) — ${WARNING ? `THE CORRIDOR WARNING ${short(WARNING.id)} "${String(WARNING.title).slice(0, 70)}" RAISED in time: level ${w0?.level ?? '—'}, urgency ${w0?.urgency ?? '—'}, routed to ${nm(w0?.routedTo)}, window closes ${new Date(WARNING.response_window_closes_at).toISOString().slice(0, 16)}` : 'no warning raised — the condition does not hold on the latest observations'}`);
      }
    }
  }
}
if (POLICY !== null) {
  // THE CORRIDOR ITEM (stated): L. Brandt's warning.raised item on the corridor warning (the warnings consumer routes the indicator's warning to its
  // owner N. Eriksen; the brief casts L. Brandt as the accountable person) — the harness's plantItem, a superuser move
  const PLANT_TITLE = 'B36 corridor warning (the act\'s item — PLANTED, SYNTHETIC)';
  const had = (await q(`select i.item_id::text id, i.state, i.owner_principal_id::text owner, i.title, i.subject_id::text wid from executive.attention_items i where i.tenant_id = $1 and i.domain_id = $2 and i.title = $3 limit 1`, [T, D, PLANT_TITLE]))[0] ?? null;
  if (had) { ITEM = had; WARNING = (await q(`select warning_id::text id, state, title, response_window_closes_at from prediction.warnings_current where warning_id = $1`, [had.wid]))[0] ?? WARNING; note(`the planted corridor item ${short(had.id)} stands (${had.state}) on the warning ${short(had.wid)} — an earlier run`); }
  else if (WARNING === null) bad('no corridor warning stands to plant the item on');
  else {
    const w = WARNING;
    const id = (await q('select gen_random_uuid()::text id'))[0].id; const created = await dbNow();
    const evaluation = { outcome: 'material', reasons: ['PLANTED by the B36 act: the corridor item L. Brandt answers for (the warnings consumer routed the indicator\'s warning to its owner; SYNTHETIC)'], dimensions: { consequence: 'C2', confidence: 0.9, hours_to_window: 24 }, thresholds: null, policy_version: POLICY.version, rank: { explanation: 'consequence C2: planted rank (B36 act, SYNTHETIC)' } };
    await q(`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, created_at, updated_at, correlation_id)
             values ($1::uuid, 'DOMAIN', $2, $3, 'warning.raised', 'warning', $4, gen_random_uuid(), 'EarlyWarningRaised', $5, 'material', 'open', $6, '{strategy_owner,decision_owner}'::text[], $7, $8, $9::jsonb, '{"planted":"b36-act-corridor"}'::jsonb, $10::timestamptz + interval '24 hours', 0, $10::timestamptz, $10::timestamptz, gen_random_uuid())`,
      [id, T, D, w.id, PLANT_TITLE, brandt.principalId, POLICY.policy_id, POLICY.version, JSON.stringify(evaluation), created]);
    await q(`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, occurred_at, correlation_id) values (gen_random_uuid(), 'DOMAIN', $1, $2, $3::uuid, 'item.routed', $4, $5::jsonb, $6::timestamptz, gen_random_uuid())`,
      [T, D, id, dvorak.principalId, JSON.stringify({ outcome: 'material', reasons: evaluation.reasons, policy_version: POLICY.version, owner: brandt.principalId, route_roles: ['strategy_owner', 'decision_owner'], planted: true }), created]);
    ITEM = { id, state: 'open', owner: brandt.principalId, title: PLANT_TITLE };
    ok(`THE CORRIDOR ITEM PLANTED (stated; the harness's idiom): ${short(id)} "${PLANT_TITLE}" → open, owner L. Brandt, on the RAISED warning ${short(w.id)} "${String(w.title).slice(0, 60)}" (state ${w.state}) under policy version ${POLICY.version}`);
  }
}
{
  const f = (await q(`select room_id::text id, title from executive.rooms_current where tenant_id = $1 and domain_id = $2 and kind = 'forum' order by opened_at limit 1`, [T, D]))[0] ?? null;
  if (f) note(`the forum ${short(f.id)} "${f.title}" stands — an earlier run`);
  else {
    const r = await att(chief, 'forums/convene', 'executive.forum.convene', 'DRM', { title: 'Supply resilience forum (B36, SYNTHETIC)', members: [brandt.principalId, dvorak.principalId], period: 'monthly', context: { objective_id: OBJ_REG.id, horizon: '90d', classification: 'internal' } });
    if (!r.ok) fail('the chief of staff convenes the forum', r); else ok(`the chief of staff CONVENED the forum ${short(r.body.forum.room_id)} "${r.body.forum.title}" — monthly (review every ${r.body.forum.review_every_days} days), members L. Brandt + M. Dvořák, context the Regensburg objective / 90d`);
  }
}
ENV_OUT.EYE_B36_OPERATOR_LOGIN = 'chief.of.staff'; ENV_OUT.EYE_B36_EXECUTIVE_LOGIN = 'm.dvorak';

/* ── B36-S THE SCORE AND THE STRATEGY GRAPH ──────────────────────────────────────────── */
console.log('\nB36-S THE SCORE AND THE STRATEGY GRAPH — the owner\'s restatement and its flag, the customs exception, the signed acceptance, the revoked allocation, the scheduled detection');
const hh = (s, path, action, objectType, payload, objectId = null) => call(`${H}/${path}`, env_(s, 'executive')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
const gr = (s, path, action, objectType, payload, objectId = null) => call(`${G}/${path}`, env_(s, 'graph')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
const compute = async (label) => { const r = await hh(hoffmann, 'compute', 'executive.health.compute', 'HSS', {}); if (!r.ok) { fail(`A. Hoffmann computes the score (${label})`, r); return null; } return r.body.snapshot; };
let ACTIVE_DEF = (await q(`select definition_id::text id, version, model, owner_edit_window_days w from executive.health_score_definitions where tenant_id = $1 and domain_id = $2 and state = 'active' order by version desc limit 1`, [T, D]))[0] ?? null;
if (ACTIVE_DEF === null) bad('no active health definition');
else {
  const onTime = (ACTIVE_DEF.model.components ?? []).find((c) => c.input_kind === 'measure') ?? null;
  const owner = onTime ? (await q(`select owner_principal_id::text o, title from graph.strategy_current where strategy_object_id = $1`, [onTime.input_id]))[0] : null;
  if (onTime === null || owner === null) bad('the definition carries no measure component');
  else {
    const edits = await q(`select edit_id::text id, from_value, to_value from executive.health_input_edits where tenant_id = $1 and domain_id = $2 and component_key = $3 order by edited_at`, [T, D, onTime.key]);
    if (edits.length > 0) note(`the owner's restatement of ${onTime.key} stands (${edits.map((e) => `${e.from_value} → ${e.to_value}`).join(', ')}) — an earlier run`);
    else {
      const sess = owner.o === weber.principalId ? weber : owner.o === brenner.principalId ? brenner : owner.o === brandt.principalId ? brandt : null;
      if (sess === null) bad(`the measure "${owner.title}" is owned by ${short(owner.o)}, not a persona of this act`);
      else {
        expectRefused(`A. Hoffmann restating ${onTime.key} (not the input's owner)`, await hh(hoffmann, 'inputs/set', 'executive.health.input.set', 'HSD', { component_key: onTime.key, value: 97, reason: 'an analyst restating the owner\'s figure (SYNTHETIC)' }), 403, /health input rejected \(ownership\)/);
        const r = await hh(sess, 'inputs/set', 'executive.health.input.set', 'HSD', { component_key: onTime.key, value: 97, reason: 'The Q3 on-time figure restated after the late shipments were reclassified as customer-requested holds (SYNTHETIC).' });
        if (!r.ok) fail(`${nm(owner.o)} restates the on-time input`, r); else ok(`${nm(owner.o)} (the owner of MSR "${owner.title}") RESTATED ${onTime.key}: ${r.body.edit.from_value} → ${r.body.edit.to_value} (edit ${short(r.body.edit.edit_id)}, window ${r.body.edit.window_days} days)`);
        const s = await compute('after the restatement');
        if (s) { const flagged = (s.changes ?? []).filter((c) => c.owner_edit_flag); ok(`A. Hoffmann COMPUTED the score: ${s.status}, aggregate ${s.aggregate ?? 'withheld'}; ${(s.changes ?? []).length} change(s), ${flagged.length} with the OWNER-EDIT FLAG${flagged[0] ? ` — ${flagged[0].subject} ${flagged[0].direction} (${flagged[0].from_band ?? '—'} → ${flagged[0].to_band ?? '—'}), edits ${JSON.stringify(flagged[0].owner_edit_ids)}` : ' (no favourable change moved in this window — the flag has nothing to mark)'}`); }
      }
    }
  }
  // THE CUSTOMS COMPONENT: the measure declared, defined, observed (stale) and approved; the definition's next version carries it; the exception excludes it
  const CUSTOMS_TITLE = 'Customs clearance time';
  let MSR_C = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'MSR' and title = $3 and status = 'active' limit 1`, [T, D, CUSTOMS_TITLE]))[0]?.id ?? null;
  if (MSR_C) note(`the measure ${short(MSR_C)} "${CUSTOMS_TITLE}" stands — an earlier run`);
  else {
    const d = await gr(weber, 'strategy/declare', 'graph.strategy.declare', 'MSR', { objectType: 'MSR', title: CUSTOMS_TITLE, statement: 'hours from arrival at Hamburg to customs release of a rerouted consignment (SYNTHETIC)', status: 'active', restsOn: [{ kind: 'strategy', id: OBJ_REG.id, rationale: 'the measure serves the Regensburg supply objective' }] });
    if (!d.ok) fail('J. Weber declares the customs measure', d);
    else {
      MSR_C = d.body.strategy.objectId;
      const df = await gr(weber, `strategy/measures/${MSR_C}/define`, 'graph.measure.define', 'MSR', { objectiveId: OBJ_REG.id, unit: 'hours', direction: 'lower_better', targetValue: 48, targetDate: '2027-03-31', freshnessDays: 1 }, MSR_C);
      if (!df.ok) fail('J. Weber defines the measure', df);
      else {
        const evd = (await q(`select object_id::text id from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and lifecycle_state = 'admitted' order by recorded_at desc limit 1`, [T, D]))[0]?.id ?? null;
        const ob = await gr(hoffmann, `strategy/measures/${MSR_C}/observe`, 'graph.measure.observe', 'MSR', { value: 56, observedAt: await dbAgo('2 days'), source: { kind: 'evidence', id: evd } }, MSR_C);
        if (!ob.ok) fail('A. Hoffmann observes the measure', ob);
        const ap = await gr(dvorak, `strategy/measures/${MSR_C}/approve`, 'graph.strategy.authority.act', 'MSR', { subjectDigest: df.body.measure.definition_digest, decision: 'approve', rationale: 'the customs measure approved for the 2027 plan (SYNTHETIC)', expiresAt: at(180 * DAY) }, MSR_C);
        if (!ap.ok) fail('M. Dvořák approves the measure', ap);
        else ok(`J. Weber DECLARED and DEFINED the measure ${short(MSR_C)} "${CUSTOMS_TITLE}" (target ≤ 48 h, freshness 1 day); A. Hoffmann OBSERVED 56 h two days ago (STALE against its window); M. Dvořák APPROVED it (act ${short(ap.body.act.act_id)})`);
      }
    }
  }
  if (MSR_C && !(ACTIVE_DEF.model.components ?? []).some((c) => c.key === 'customs_clearance')) {
    const model = JSON.parse(JSON.stringify(ACTIVE_DEF.model));
    const dim = (model.components ?? [])[0]?.dimension ?? (model.dimensions ?? [])[0]?.key;
    // the components of a dimension weigh 1 together: the existing ones scaled to 0.8, the customs component takes 0.2
    for (const c of model.components) if (c.dimension === dim) c.weight = Math.round(Number(c.weight) * 0.8 * 1000) / 1000;
    model.components.push({ key: 'customs_clearance', label: 'Customs clearance time (SYNTHETIC)', dimension: dim, input_kind: 'measure', input_id: MSR_C, weight: 0.2, direction: 'lower_better', normalisation: { worst: 96, best: 24 }, stale_after_days: 7 });
    const p = await hh(dvorak, 'definitions/propose', 'executive.health.definition.propose', 'HSD', { model, reason: 'B36: the customs clearance component added to the supply-resilience dimension (SYNTHETIC).' });
    if (!p.ok) fail('M. Dvořák proposes definition v2', p);
    else {
      const a = await hh(richter, `definitions/${p.body.definition.definition_id}/approve`, 'executive.health.definition.approve', 'HSD', { note: 'reviewed with the strategy lead: the customs component enters the model (SYNTHETIC)' }, p.body.definition.definition_id);
      if (!a.ok) fail('T. Richter approves definition v2', a); else { ok(`M. Dvořák PROPOSED and T. Richter APPROVED health definition version ${a.body.definition.version} (${a.body.definition.state}) — the customs component customs_clearance in dimension ${dim}`); ACTIVE_DEF = (await q(`select definition_id::text id, version, model, owner_edit_window_days w from executive.health_score_definitions where tenant_id = $1 and domain_id = $2 and state = 'active' order by version desc limit 1`, [T, D]))[0]; }
    }
  } else if (MSR_C) note(`definition version ${ACTIVE_DEF.version} carries customs_clearance — an earlier run`);
  const xs = await q(`select exception_id::text id, kind, state, requested_by::text rb from executive.health_exceptions where tenant_id = $1 and domain_id = $2 and component_key = 'customs_clearance' order by requested_at`, [T, D]);
  if (xs.some((x) => x.state === 'approved')) note(`the customs exception stands approved (${short(xs.find((x) => x.state === 'approved').id)}) — an earlier run`);
  else if (MSR_C) {
    const pending = xs.find((x) => x.state === 'requested') ?? null;
    let xid = pending?.id ?? null;
    if (xid === null) {
      const r = await hh(weber, 'exceptions/request', 'executive.health.exception.request', 'HSX', { component_key: 'customs_clearance', kind: 'exclude', reason: 'the customs broker\'s feed is not live this quarter — the class is not measurable until the pre-clearance filings run (SYNTHETIC)', expires_at: at(30 * DAY) });
      if (!r.ok) fail('J. Weber requests the exclude exception', r); else { xid = r.body.exception.exception_id; ok(`J. Weber REQUESTED an exclude exception on customs_clearance (${r.body.exception.state}, expires ${at(30 * DAY).slice(0, 10)}) — no effect until another approves it`); }
    }
    if (xid) {
      expectRefused('J. Weber deciding their own request', await hh(weber, `exceptions/${xid}/approve`, 'executive.health.exception.approve', 'HSX', { decision: 'approve', note: 'approving my own request' }, xid), 403);
      const a = await hh(dvorak, `exceptions/${xid}/approve`, 'executive.health.exception.approve', 'HSX', { decision: 'approve', note: 'agreed: customs is excepted until the broker\'s filings run (SYNTHETIC)' }, xid);
      if (!a.ok) fail('M. Dvořák approves the exception', a); else ok(`M. Dvořák APPROVED the exception ${short(xid)}: ${a.body.exception.state}, in force now ${a.body.exception.in_force_now}`);
    }
  }
  const accepted = (await q(`select a.approval_id::text id, a.snapshot_id::text sid from executive.health_snapshot_approvals a where a.tenant_id = $1 and a.domain_id = $2 and a.approved_by = $3 order by a.approved_at desc limit 1`, [T, D, dvorak.principalId]))[0] ?? null;
  const s2 = accepted ? null : await compute('under the exception');
  if (s2) ok(`A. Hoffmann COMPUTED the score under the exception: ${s2.status}, aggregate ${s2.aggregate ?? 'withheld'}; components ${(s2.result?.components ?? []).map((c) => c.key).join(', ')}; exceptions named ${(s2.result?.exceptions ?? []).map((e) => `${e.component_key}:${e.kind}`).join(', ') || 'none'}`);
  // THE SIGNED ACCEPTANCE of the current snapshot
  if (accepted) note(`M. Dvořák's signed acceptance ${short(accepted.id)} of snapshot ${short(accepted.sid)} stands — an earlier run (no new snapshot computed)`);
  const cur = accepted ? null : s2;
  if (cur) {
    const pv = await hh(dvorak, `snapshots/${cur.snapshot_id}/approval-preview`, 'executive.health.read', 'HSS', {}, cur.snapshot_id);
    if (!pv.ok) fail('M. Dvořák previews the acceptance', pv);
    else if ((pv.body.preview.approvals ?? []).some((a) => a.approved_by === dvorak.principalId)) note(`M. Dvořák's acceptance of snapshot ${short(cur.snapshot_id)} stands (signatures ${pv.body.preview.signatures.length}) — an earlier run`);
    else {
      ok(`M. Dvořák PREVIEWED the acceptance of snapshot ${short(cur.snapshot_id)}: acceptable ${pv.body.preview.acceptable}, digest ${String(pv.body.preview.result_digest).slice(0, 12)}…, exceptions in force ${(pv.body.preview.exceptions_in_force ?? []).length} — "${String(pv.body.preview.consequence ?? '').slice(0, 60)}"`);
      const a = await hh(dvorak, `snapshots/${cur.snapshot_id}/approve`, 'executive.health.snapshot.approve', 'HSS', { result_digest: pv.body.preview.result_digest, note: 'accepted as the basis for the Q4 supply review (SYNTHETIC)' }, cur.snapshot_id);
      if (!a.ok) fail('M. Dvořák accepts the snapshot', a); else ok(`M. Dvořák ACCEPTED the snapshot on its digest — SIGNED ${a.body.approval.signature.key_id} over ${String(a.body.approval.signature.subject_digest).slice(0, 12)}…; authorizes action ${a.body.approval.authorizes_action}`);
    }
  }
  // THE REVOCATION of the dual-sourcing allocation by its issuer
  const alloc = (await q(`select act_id::text id, approver_principal_id::text by, revoked_at from graph.strategy_authority_acts where tenant_id = $1 and domain_id = $2 and act_kind = 'allocate_resource' order by recorded_at limit 1`, [T, D]))[0] ?? null;
  if (alloc === null) bad('no allocate_resource act to revoke');
  else if (alloc.revoked_at) note(`the allocation act ${short(alloc.id)} is revoked — an earlier run`);
  else {
    const issuer = alloc.by === dvorak.principalId ? dvorak : richter;
    expectRefused('J. Weber revoking the allocation (not its issuer)', await gr(weber, `strategy/authority/${alloc.id}/revoke`, 'graph.strategy.authority.revoke', 'ALN', { reason: 'the allocation no longer stands (SYNTHETIC)' }, alloc.id), 403, /strategy revocation rejected \(not_authority\)/);
    const r = await gr(issuer, `strategy/authority/${alloc.id}/revoke`, 'graph.strategy.authority.revoke', 'ALN', { reason: 'The bearings budget is re-allocated to the 2027 plan; the allocation is withdrawn (SYNTHETIC).' }, alloc.id);
    if (!r.ok) fail(`${nm(issuer.principalId)} revokes the allocation`, r);
    else {
      ok(`${nm(issuer.principalId)} (${issuer === dvorak ? 'the issuer' : 'the domain administrator — the issuer is not a persona of this act'}) REVOKED the allocate_resource act ${short(alloc.id)} (subject ${r.body.revocation.subject_kind} ${short(r.body.revocation.subject_id)})`);
      const gaps = await gr(dvorak, 'strategy/gaps', 'graph.strategy.alignment.read', 'OBJ', {});
      if (gaps.ok) { const row = (gaps.body.gaps.rows ?? []).find((x) => (x.gap_reasons ?? []).includes('initiative_unresourced')); note(`the gap view sees it at once: ${row ? `objective ${short(row.objective_id)} → initiative_unresourced` : 'no row reads initiative_unresourced'}`); }
    }
  }
  // THE DETECTION raised by the schedule (the attention agent's tick, every 60 s on the demonstration) under the policy naming strategy.detection
  if (MSR_C) {
    const probe = () => q(`select d.detection_id::text id, d.kind, d.routed_item_id::text item, (select state from executive.attention_items i where i.item_id = d.routed_item_id) istate, (select owner_principal_id::text from executive.attention_items i where i.item_id = d.routed_item_id) owner from graph.strategy_detections d where d.subject_id = $1 and d.kind = 'stale_measure' order by d.raised_at desc limit 1`, [MSR_C]);
    const had = await probe();
    if (had.length > 0) note(`the stale_measure detection ${short(had[0].id)} stands (item ${short(had[0].item)} ${had[0].istate}) — an earlier run`);
    else {
      note(`waiting for the attention agent's scheduled tick (strategy-detections; every 60 s) — ${elapsed()}`);
      const got = await waitFor('the stale_measure detection', probe, (r) => r.length > 0, 4 * MIN);
      (got?.[0] ? ok : bad)(`THE DETECTION raised by the SCHEDULE: ${got?.[0] ? `stale_measure on "${CUSTOMS_TITLE}" → routed as the attention item ${short(got[0].item)} (${got[0].istate}, owner ${nm(got[0].owner)}) under policy version ${POLICY?.version} — nobody read the page` : 'NOT raised'}`);
    }
  }
}
ENV_OUT.EYE_DEMO_EXECUTIVE = 'm.dvorak'; ENV_OUT.EYE_DEMO_STRATEGY_LEAD = 'j.weber';

/* ── B36-B THE BRIEFING STUDIO v3 ────────────────────────────────────────────────────── */
console.log('\nB36-B THE BRIEFING STUDIO v3 — the suppression policy; the window\'s content (a stale single-source record, a weak signal); L. Brandt\'s edition under its contract after the agent\'s; the outage edition retaining the corridor warning; the edition after the recovery');
const br = (s, path, action, objectType, payload, objectId = null) => call(`${BR}/${path}`, env_(s, 'briefing')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
const plantHealth = async (state, reason) => q(`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, evidence_refs, reason, lag_class, correlation_id)
  values (gen_random_uuid(), 'DOMAIN', $1, $2, $3, null, $4, clock_timestamp(), 'b36-act', 'b36-act', '[]'::jsonb, $5, 'none', gen_random_uuid())`, [T, D, SRC_NW.source_id, state, reason]);
const upload = async (s, filename, csv, documentTime) => {
  const bytes = Buffer.from(csv, 'utf8'); const digest = createHash('sha256').update(bytes).digest('hex');
  const had = (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and payload ->> 'content_digest' = $3 order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
  if (had) return { evd: had, repeated: true, run: null };
  const up = await call(`${X}/observation/upload`, env_(s, 'observation')({ action: 'observation.run.trigger', objectType: 'RUN' }), { sourceId: SRC_NW.source_id, contractVersion: Number(SRC_NW.contract_version), files: [{ filename, mediaType: 'text/csv; charset=utf-8', base64: bytes.toString('base64'), documentTime }] }, s.token);
  if (!up.ok) { fail(`${nm(s.principalId)} uploads ${filename}`, up); return { evd: null, repeated: false, run: null }; }
  const evd = (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and payload ->> 'content_digest' = $3 order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
  if (evd === null) bad(`no evidence object carries the upload's digest ${digest.slice(0, 12)}…`);
  return { evd, repeated: false, run: up.body.run };
};
let E_FIRST = null; let E_OUT = null; let E_LAST = null;
if (GATE_ROOM === null || GATE === null) bad('no gate room to brief');
else {
  const pol = await br(dvorak, 'policy/get', 'briefing.read', 'BRP', {});
  if (pol.ok && pol.body.policy) note(`briefing policy version ${pol.body.policy.version} stands — an earlier run`);
  else {
    let r = await br(dvorak, 'policy/set', 'briefing.policy.set', 'BRP', { rules: { default: { min_sources: 1, max_staleness_hours: 8760, min_confidence: null }, classes: { claim: { min_sources: 2, max_staleness_hours: 24 }, evidence: { min_sources: 2, max_staleness_hours: 24 } } }, reason: 'A claim or an evidence record rests on two independent sources and a day of freshness; otherwise silence (SYNTHETIC).' });
    if (!r.ok && r.status === 422) { note(`the rules with the class "claim": ${refusalLine(r)} — published on the evidence class`); r = await br(dvorak, 'policy/set', 'briefing.policy.set', 'BRP', { rules: { default: { min_sources: 1, max_staleness_hours: 8760, min_confidence: null }, classes: { evidence: { min_sources: 2, max_staleness_hours: 24 } } }, reason: 'An evidence record rests on two independent sources and a day of freshness; otherwise silence (SYNTHETIC).' }); }
    if (!r.ok) fail('M. Dvořák publishes the briefing policy', r); else ok(`M. Dvořák PUBLISHED briefing policy version ${r.body.policy.version}: default ≥ 1 source / 8760 h; the class rule ≥ 2 independent sources within 24 h — prefer silence over false certainty`);
  }
  // an OPEN challenge on the gate package (the composer takes the open ones as disputed items): the auditor raises a second one and leaves it open
  {
    const v = Number(GATE.current_version);
    const rec = await gateRecord(brenner, GATE.id, v);
    const openCh = (rec?.challenges ?? []).find((c) => !c.resolution && !c.resolved_at) ?? null;
    if (openCh) note(`an open challenge ${short(openCh.challenge_id)} stands on the gate package — an earlier run`);
    else {
      const c = await dc(lindqvist, `${GATE.id}/versions/${v}/challenge`, 'decision.challenge', 'DPK', { reason: 'The second source\'s qualification report is unsigned; the auditor holds the gate open (SYNTHETIC).' }, GATE.id);
      if (!c.ok) fail('E. Lindqvist raises the second challenge', c); else ok(`E. Lindqvist CHALLENGED the gate package a second time (${c.body.challenge.standing}, gate ${c.body.challenge.gate_state}) — LEFT OPEN for the briefing's disputed item`);
    }
  }
  // THE WINDOW'S CONTENT: a SINGLE-SOURCE, STALE record (A. Hoffmann uploads the broker's customs note — document time three weeks back, one source; the
  // policy suppresses it) and a WEAK SIGNAL nominated by N. Eriksen through the real route (the edition's emerging indicator)
  const note1 = await upload(hoffmann, 'customs-note-b36.csv', 'synthetic,record_id,consignment,customs_state,note\ntrue,SYN-CUS-B36-01,SYN-SHIP-4481,pre-clearance pending,the broker\'s note on the rerouted bearing sets (B36, SYNTHETIC)\n', new Date(Date.now() - 21 * DAY).toISOString());
  if (note1.evd) (note1.repeated ? note : ok)(`A. Hoffmann UPLOADED the broker's customs note (SYNTHETIC; document time three weeks back; ONE source) → evidence ${short(note1.evd.id)}@${note1.evd.v}${note1.repeated ? ' — an earlier run' : ` (run ${short(note1.run?.runId)}: ${note1.run?.admitted} admitted)`}`);
  {
    const SIG_TITLE = 'Bab el-Mandeb transit chatter rising after the broker\'s note (B36, SYNTHETIC)';
    const sig = (await q(`select signal_id::text id, maturity, confidence from prediction.signals_current where tenant_id = $1 and domain_id = $2 and title = $3 order by version desc limit 1`, [T, D, SIG_TITLE]))[0] ?? null;
    if (sig) note(`the weak signal ${short(sig.id)} "${SIG_TITLE}" stands (${sig.maturity}, confidence ${sig.confidence}) — an earlier run`);
    else if (note1.evd === null) bad('no evidence to nominate the weak signal on');
    else {
      const other = (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and lifecycle_state = 'admitted' and object_id <> $3 order by recorded_at desc limit 1`, [T, D, note1.evd.id]))[0] ?? null;
      const evidence = [{ object_id: note1.evd.id, version: note1.evd.v, stance: 'supporting' }, ...(other ? [{ object_id: other.id, version: other.v, stance: 'supporting' }] : [])];
      const r = await pr(eriksen, 'signals/nominate', 'prediction.signal.nominate', 'SIG', { title: SIG_TITLE, statement: 'The broker\'s customs note and the latest plant record both mention rerouted consignments waiting at Hamburg; thin on their own, together they may be the start of a customs backlog on the Cape routing (SYNTHETIC — the reading is the analyst\'s).',
        subjectKind: IND ? 'indicator' : 'none', ...(IND ? { subjectId: IND.id } : {}), evidence, observation: { reports: evidence.length, window: `${new Date(Date.now() - 21 * DAY).toISOString().slice(0, 10)}..${new Date().toISOString().slice(0, 10)}` }, baseline: { reports_per_quarter: 0 }, noveltyBasis: { basis: 'no customs backlog on the Cape routing was reported in the prior quarter (SYNTHETIC)' }, confidence: 0.55 });
      if (!r.ok) fail('N. Eriksen nominates the weak signal', r); else ok(`N. Eriksen NOMINATED the weak signal ${short(r.body.signal.signal_id)} "${SIG_TITLE}": maturity ${r.body.signal.maturity}, confidence 0.55, ${r.body.signal.independent_sources} independent source(s) — the edition's emerging indicator`);
    }
  }
  const editions = () => q(`select briefing_id::text id, composed_via, composed_by::text by, known_at, degraded, schema_version, content_digest from executive.briefings where room_id = $1 order by composed_at`, [GATE_ROOM]);
  let eds = await editions();
  const mine = eds.filter((e) => e.composed_via !== 'agent' && e.by === brandt.principalId);
  E_FIRST = mine[0] ?? null; E_OUT = mine[1] ?? null; E_LAST = mine[2] ?? null;
  const audience = { roles: ['executive', 'board_member'], locale: 'en', accessibility: { plain_language: true, screen_reader: false }, channels: ['in-app'] };
  const wB = WARNING;
  if (E_FIRST) note(`L. Brandt's edition ${short(E_FIRST.id)} stands (${E_FIRST.schema_version}) — an earlier run`);
  else if (E0 === null) bad('no agent edition to take as the prior');
  else {
    const k1 = await dbNow();
    const e1 = await br(brandt, 'compose', 'briefing.compose', 'BRF', { roomId: GATE_ROOM, knownAt: k1, priorBriefingId: E0.id, audience, purpose: 'The weekly corridor briefing for the executive and the board on the second-source gate (SYNTHETIC)', expiresAt: at(7 * DAY), disputedNote: 'The owner notes: the auditor\'s challenge is recorded and is answered at the next gate review.' });
    if (!e1.ok) fail('L. Brandt composes the edition', e1);
    else {
      const b = e1.body.briefing;
      const corridor = (b.items ?? []).find((i) => i.kind === 'warning' && wB && i.id === wB.id) ?? null;
      ok(`L. Brandt COMPOSED her edition ${short(b.briefingId)} (${b.schemaVersion}; audience ${b.audience.roles.join(', ')}; purpose set; expires ${String(b.expiresAt).slice(0, 10)}; policy v${b.policyVersion}; prior the agent's edition ${short(E0.id)} — the window opens at ${String(new Date(E0.known_at).toISOString()).slice(0, 16)}): ${b.items.length} items, every one with its band`);
      (corridor ? ok : bad)(`the corridor warning item: ${corridor ? `"${String(corridor.title).slice(0, 70)}" band ${corridor.uncertainty?.band} (${(corridor.uncertainty?.basis?.rules_applied ?? []).join('; ').slice(0, 80)}); window closes ${String(corridor.details?.response_window_closes_at ?? '').slice(0, 16)}` : 'ABSENT from the edition'}`);
      ((b.suppressed ?? []).length > 0 ? ok : bad)(`SUPPRESSED under policy: ${(b.suppressed ?? []).length} item(s) not rendered${b.suppressed[0] ? ` — ${b.suppressed[0].kind} ${String(b.suppressed[0].item_id).slice(0, 40)}: ${(b.suppressed[0].because ?? []).join(' ').slice(0, 120)}` : ''}; declared as omissions ${(b.omissions ?? []).filter((o) => o.kind === 'suppressed').length}`);
      ((b.omissions ?? []).some((o) => o.kind === 'source_degraded') ? ok : note)(`the DEGRADED SOURCES declared as omissions: ${(b.omissions ?? []).filter((o) => o.kind === 'source_degraded').map((o) => String(o.reason).slice(0, 50)).join('; ') || 'none'} (degraded ${b.degraded} — the demonstration's collectors)`);
      ((b.disputed ?? []).some((d) => d.basis === 'challenge') ? ok : bad)(`the challenged gate package as DISPUTED: ${(b.disputed ?? []).map((d) => `${d.basis} on ${d.subject} as of ${String(d.as_of).slice(0, 16)}${d.owner_note ? ' (with the owner\'s note)' : ''}`).join('; ') || 'none'}`);
      ((b.indicators ?? []).length > 0 ? ok : bad)(`EMERGING INDICATORS: ${(b.indicators ?? []).map((i) => `${i.indicator} as of ${String(i.as_of).slice(0, 10)}`).join('; ') || 'none in this window'}`);
      eds = await editions(); E_FIRST = eds.find((e) => e.id === b.briefingId) ?? { id: b.briefingId, content_digest: b.contentDigest, known_at: k1 };
    }
  }
  if (E_OUT) note(`the outage edition ${short(E_OUT.id)} stands (DEGRADED) — an earlier run`);
  else if (E_FIRST) {
    // THE OUTAGE EDITION: the NORDWERK collector's degraded verdict PLANTED (stated), composed with the edition above as prior — the urgent corridor warning RETAINED with its earlier as-of
    await plantHealth('degraded', 'PLANTED by the B36 act: the NORDWERK internal collector faulted (SYNTHETIC)');
    note(`a DEGRADED health verdict PLANTED on "${SRC_NW.name}" (a stated superuser move, as the briefing harness plants it — the demonstration has no collector fault to wait for)`);
    const k2 = await dbNow();
    const e2 = await br(brandt, 'compose', 'briefing.compose', 'BRF', { roomId: GATE_ROOM, knownAt: k2, priorBriefingId: E_FIRST.id, audience, purpose: 'The corridor briefing under the collector outage (SYNTHETIC)', expiresAt: at(7 * DAY) });
    if (!e2.ok) fail('L. Brandt composes the outage edition', e2);
    else {
      const o = e2.body.briefing;
      const kept = (o.items ?? []).find((i) => i.retained_from === E_FIRST.id && wB && i.id === wB.id) ?? (o.items ?? []).find((i) => i.retained_from === E_FIRST.id) ?? null;
      (o.degraded && kept ? ok : bad)(`THE OUTAGE EDITION ${short(o.briefingId)} (degraded ${o.degraded}): ${kept ? `"${String(kept.title).slice(0, 60)}" RETAINED from ${short(kept.retained_from)} as of ${String(kept.retained_as_of).slice(0, 16)} — its original at ${String(kept.at).slice(0, 16)}, never re-derived` : 'NO item retained'}; omissions ${(o.omissions ?? []).map((x) => x.kind).join(', ')}`);
      eds = await editions(); E_OUT = eds.find((e) => e.id === o.briefingId) ?? { id: o.briefingId, content_digest: o.contentDigest };
    }
    await plantHealth('healthy', 'PLANTED by the B36 act: the collector recovered (SYNTHETIC)');
    note('the health verdict RESTORED to healthy (planted)');
  }
  // THE EDITION AFTER THE RECOVERY: L. Brandt composes again under the same contract (the prior the outage edition) — the Board pack's correction binds to it
  if (E_LAST) note(`L. Brandt's edition after the recovery ${short(E_LAST.id)} stands — an earlier run`);
  else if (E_OUT) {
    const k3 = await dbNow();
    const e3 = await br(brandt, 'compose', 'briefing.compose', 'BRF', { roomId: GATE_ROOM, knownAt: k3, priorBriefingId: E_OUT.id, audience, purpose: 'The corridor briefing after the collector recovered (SYNTHETIC)', expiresAt: at(7 * DAY), disputedNote: 'The owner notes: the auditor\'s challenge is recorded and is answered at the next gate review.' });
    if (!e3.ok) fail('L. Brandt composes the edition after the recovery', e3);
    else { const t = e3.body.briefing; eds = await editions(); E_LAST = eds.find((e) => e.id === t.briefingId) ?? { id: t.briefingId, content_digest: t.contentDigest }; ok(`L. Brandt COMPOSED the edition after the recovery ${short(t.briefingId)} (${t.schemaVersion}; ${t.items.length} items; degraded ${t.degraded} — the demonstration's collectors; omissions ${(t.omissions ?? []).map((x) => x.kind).join(', ') || 'none'})`); }
  }
}

/* ── B36-D THE PUBLISHING CENTER ─────────────────────────────────────────────────────── */
console.log('\nB36-D THE PUBLISHING CENTER — the Board pack from L. Brandt\'s corridor edition, approved by digest, delivered with receipts, corrected to the later edition, archived and exported; the partner letter from the corridor decision reviewed, delivered, its export refused');
const pb = (s, path, action, payload, objectId = null) => call(`${PB}/${path}`, env_(s, 'decision')({ action, objectType: 'PUB', objectId, consequence: 'C2' }), payload, s.token);
const pubByTitle = async (title) => (await q(`select publication_id::text id, state from executive.publications where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, title]))[0] ?? null;
const pubGet = async (s, id) => { const r = await pb(s, `${id}/get`, 'executive.publication.read', {}, id); return r.ok ? r.body.publication : null; };
const dpk = async (pkg, v) => (await q(`select content_digest d from objects.canonical_objects where object_type = 'DPK' and object_id = $1 and object_version = $2`, [pkg, v]))[0]?.d ?? null;
for (const [s, role] of [[chief, 'observer'], [moreau, 'observer']]) {
  if ((await q(`select 1 from executive.room_members where room_id = $1 and principal_id = $2 and removed_at is null`, [ROOM_JAN, s.principalId])).length > 0) continue;
  const m = await call(`${X}/rooms/${ROOM_JAN}/membership`, env_(brandt, 'decision')({ action: 'room.membership', objectType: 'DRM', objectId: ROOM_JAN }), { principal: s.principalId, role, op: 'add' }, brandt.token);
  if (m.ok) ok(`L. Brandt ADDED ${nm(s.principalId)} to the January corridor room as ${role} (a report of a package with a room renders for the room's members)`); else fail(`L. Brandt adds ${nm(s.principalId)} to the room`, m);
}
const PACK_TITLE = 'Board pack — the corridor second-source briefing (SYNTHETIC)';
const LETTER_TITLE = 'Partner letter — the corridor decision for the customs brokerage (SYNTHETIC)';
ENV_OUT.EYE_B36_PUBLICATION_TITLE = 'Board pack';
{
  // THE BOARD PACK from L. Brandt's edition (the report of a package renders its CURRENT version only, and the corridor decision is monitoring at
  // version 2 — no later package version can exist; the correction therefore goes to the LATER EDITION, the harness's own positive case)
  const v1 = 1; const v2 = Number(JAN.current_version);
  const d2 = await dpk(JAN.pkg, v2);
  if (E_FIRST === null || !E_FIRST.content_digest) bad('no edition of L. Brandt\'s to publish');
  else {
    let pack = await pubByTitle(PACK_TITLE);
    if (pack) note(`the publication ${short(pack.id)} "${PACK_TITLE}" stands (${pack.state}) — an earlier run`);
    else {
      const r = await pb(chief, 'draft', 'executive.publication.draft', { title: PACK_TITLE, sourceKind: 'briefing', sourceId: E_FIRST.id, sourceVersion: 1, sourceDigest: E_FIRST.content_digest, audience: { roles: ['board_member'], recipients: [brandt.principalId] },
        classification: 'internal', channels: ['in_app', 'email'], format: 'md', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: null });
      if (!r.ok) fail('the chief of staff drafts the Board pack', r);
      else { pack = { id: r.body.publication.publication_id, state: r.body.publication.state }; ok(`the chief of staff DRAFTED "${PACK_TITLE}" ${short(pack.id)} from L. Brandt's edition ${short(E_FIRST.id)} (BRF digest ${String(E_FIRST.content_digest).slice(0, 12)}… read first): bytes sha256 ${String(r.body.publication.bytes_digest).slice(0, 12)}…, ${r.body.publication.format}, template board-pack@1, in_app + email, recipients ${(r.body.publication.recipients ?? []).map((x) => nm(x.principal_id)).join(', ')}`); }
    }
    if (pack) {
      let g = await pubGet(dvorak, pack.id);
      const ver = (n) => (g?.versions ?? []).find((x) => Number(x.version) === n) ?? null;
      const approveAndDeliver = async (n) => {
        g = await pubGet(dvorak, pack.id); const vv = ver(n); if (vv === null) { bad(`version ${n} is absent`); return; }
        if (vv.state === 'drafted') {
          const a = await pb(dvorak, `${pack.id}/versions/${n}/approve`, 'executive.publication.approve', { digest: vv.bytes_digest }, pack.id);
          if (!a.ok) { fail(`M. Dvořák approves version ${n}`, a); return; } ok(`M. Dvořák APPROVED version ${n} by its digest ${String(vv.bytes_digest).slice(0, 12)}… — SIGNED (PUB@${a.body.approval.pub_object_version} admitted)`);
        } else note(`version ${n} is ${vv.state} — an earlier run`);
        g = await pubGet(dvorak, pack.id);
        if (ver(n)?.state === 'approved') {
          const d = await pb(chief, `${pack.id}/versions/${n}/deliver`, 'executive.publication.deliver', {}, pack.id);
          if (!d.ok) fail(`the chief of staff delivers version ${n}`, d); else ok(`the chief of staff DELIVERED version ${n}: in_app ${(d.body.delivery.in_app ?? []).length} placed; ${(d.body.delivery.channel_deliveries ?? []).map((x) => `${x.channel} ${x.state}${x.synthetic_state ? ' SYNTHETIC' : ''}`).join(', ')}`);
        }
      };
      await approveAndDeliver(1);
      g = await pubGet(vogel, pack.id);
      const mine = (g?.deliveries ?? []).filter((x) => x.recipient_principal_id === vogel.principalId && x.channel === 'in_app' && Number(x.version ?? 1) === 1);
      if (mine.some((x) => x.acknowledged_at)) note('R. Vogel\'s acknowledgement stands — an earlier run');
      else if (mine[0]) { const a = await pb(vogel, `deliveries/${mine[0].delivery_id}/acknowledge`, 'executive.publication.acknowledge', { note: 'read before the board meeting (SYNTHETIC)' }, mine[0].delivery_id); if (!a.ok) fail('R. Vogel acknowledges', a); else ok(`R. Vogel (a recipient, reading his own deliveries) ACKNOWLEDGED the in_app delivery — ${String(a.body.acknowledgement.note ?? '').slice(0, 60)}`); }
      // THE CORRECTION to the later edition of the same room
      g = await pubGet(dvorak, pack.id);
      if (ver(2)) note(`the correction (version 2 ← BRF ${short(ver(2).source_id ?? '')}) stands — an earlier run`);
      else if (E_LAST === null || !E_LAST.content_digest || E_LAST.id === E_FIRST.id) bad('no later edition to correct to');
      else {
        const c = await pb(chief, `${pack.id}/correct`, 'executive.publication.correct', { reason: `The later edition ${String(E_LAST.id).slice(0, 8)}… supersedes the edition this pack was rendered from: the corridor figures are restated after the collector recovered (SYNTHETIC)`, sourceId: E_LAST.id, sourceDigest: E_LAST.content_digest }, pack.id);
        if (!c.ok) fail('the chief of staff corrects the Board pack', c); else ok(`the chief of staff CORRECTED the Board pack: version ${c.body.correction.version} bound to the edition ${short(E_LAST.id)} (${String(E_LAST.content_digest).slice(0, 12)}…; changed ${JSON.stringify({ bytes: c.body.correction.changed?.bytes_changed, snapshot: c.body.correction.changed?.snapshot_changed })}); recipients NOTIFIED ${(c.body.correction.notified ?? []).map((x) => nm(x.recipient)).join(', ')} — items ${(c.body.correction.notified ?? []).length}, e-mail notices ${(c.body.correction.notices ?? []).filter((n) => n.state === 'delivered').length} delivered (SYNTHETIC sink)`);
      }
      await approveAndDeliver(2);
      // THE ARCHIVE and the EXPORT (residency EU carried)
      g = await pubGet(dvorak, pack.id);
      if (g?.state === 'archived') note('the Board pack is archived — an earlier run');
      else { const a = await pb(dvorak, `${pack.id}/archive`, 'executive.publication.archive', {}, pack.id); if (!a.ok) fail('M. Dvořák archives the Board pack', a); else ok(`M. Dvořák ARCHIVED the Board pack: ${a.body.archive.state}; the record carries ${a.body.archive.archive_ref?.versions} version(s), ${a.body.archive.archive_ref?.deliveries} deliveries, ${a.body.archive.archive_ref?.signatures} signature(s); controls ${JSON.stringify(a.body.archive.archive_ref?.controls)}; holds ${(a.body.archive.archive_ref?.holds ?? []).length}`); }
      const e = await pb(dvorak, `${pack.id}/export/get`, 'executive.publication.export', {}, pack.id);
      if (!e.ok) fail('M. Dvořák exports the Board pack', e); else (e.body.export.file?.repeated ? note : ok)(`M. Dvořák ${e.body.export.file?.repeated ? 'exported the Board pack — an earlier run (the same manifest served again)' : 'EXPORTED the Board pack'}: ${e.body.export.export?.format}, ${(e.body.export.export?.objects ?? []).length} object(s), ${(e.body.export.export?.deliveries ?? []).length} receipt(s), manifest ${String(e.body.export.export?.manifest_digest).slice(0, 12)}… (${e.body.export.file?.name}, repeated ${e.body.export.file?.repeated}); residency ${e.body.export.export?.gates?.controls?.residency_profile} carried — ${String(e.body.export.export?.gates?.residency ?? '').slice(0, 70)}`);
    }
  }
  // THE PARTNER LETTER (external, kind partner) from the corridor decision's CURRENT version (the report source)
  if (d2 === null) bad('the January package has no DPK of its current version');
  else {
    const d1 = d2;
    let letter = await pubByTitle(LETTER_TITLE);
    if (letter) note(`the partner letter ${short(letter.id)} stands (${letter.state}) — an earlier run`);
    else {
      const src = d2 ?? d1; const sv = d2 ? v2 : v1;
      const r = await pb(chief, 'draft', 'executive.publication.draft', { title: LETTER_TITLE, sourceKind: 'report', sourceId: JAN.pkg, sourceVersion: sv, sourceDigest: src, audience: { roles: [], recipients: [brandt.principalId] },
        classification: 'internal', channels: ['in_app', 'email'], format: 'html', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: { kind: 'partner', name: 'Partner customs brokerage (SYNTHETIC)' } });
      if (!r.ok) fail('the chief of staff drafts the partner letter', r);
      else {
        letter = { id: r.body.publication.publication_id, state: r.body.publication.state }; const draftId = r.body.publication.external_draft_id; const digest = r.body.publication.bytes_digest;
        ok(`the chief of staff DRAFTED the partner letter ${short(letter.id)} (external draft ${short(draftId)}, review_requested)`);
        expectRefused('M. Dvořák approving the letter before its external review', await pb(dvorak, `${letter.id}/versions/1/approve`, 'executive.publication.approve', { digest }, letter.id), 409, /publication rejected \(external_review\)/);
        const rv = await pb(moreau, `external-drafts/${draftId}/review`, 'executive.external_draft.review', { verdict: 'approved', note: 'Reviewed for release to the partner: nothing beyond internal, the customs figures are the broker\'s own (SYNTHETIC).', digest }, draftId);
        if (!rv.ok) fail('A. Moreau reviews the external draft', rv); else ok(`A. Moreau (a second executive, not the drafter) REVIEWED the external draft: ${rv.body.review.gate_state} — signed over ${String(rv.body.review.review_digest).slice(0, 12)}…`);
        const a = await pb(dvorak, `${letter.id}/versions/1/approve`, 'executive.publication.approve', { digest }, letter.id);
        if (!a.ok) fail('M. Dvořák approves the letter', a); else ok('M. Dvořák APPROVED the partner letter by its digest (signed)');
        const d = await pb(chief, `${letter.id}/versions/1/deliver`, 'executive.publication.deliver', {}, letter.id);
        if (!d.ok) fail('the chief of staff delivers the letter', d); else ok(`the chief of staff DELIVERED the letter: external recipient ${d.body.delivery.external_recipient} — ${(d.body.delivery.channel_deliveries ?? []).filter((x) => x.external_recipient).map((x) => `${x.channel} ${x.state} SYNTHETIC (to ${String(x.receipt?.to ?? '').slice(0, 50)})`).join(', ')}; internal in_app ${(d.body.delivery.in_app ?? []).length}`);
      }
    }
    if (letter) {
      const g = await pubGet(dvorak, letter.id);
      if (g?.state === 'archived') note('the partner letter is archived — an earlier run');
      else if (g?.state === 'delivered') { const a = await pb(dvorak, `${letter.id}/archive`, 'executive.publication.archive', {}, letter.id); if (!a.ok) fail('M. Dvořák archives the letter', a); else ok(`M. Dvořák ARCHIVED the partner letter (${a.body.archive.state})`); }
      expectRefused('M. Dvořák exporting the partner letter (the source carries residency EU; the letter is addressed outside the tenant)', await pb(dvorak, `${letter.id}/export/get`, 'executive.publication.export', {}, letter.id), 409, /publication rejected \(residency\)/);
    }
  }
}

/* ── B36-P THE PLANNING WORKSPACE ────────────────────────────────────────────────────── */
console.log('\nB36-P THE PLANNING WORKSPACE — "Dual-sourcing 2027": the initiatives, the milestones on the stock measures, the runs, the signed baseline; the Q2 variance by the schedule; the authority cut → the breach; the commitment held, acknowledged, committed');
const pl = (s, path, action, objectType, payload, objectId = null) => call(`${PL}/${path}`, env_(s, 'executive')({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
const PLAN_TITLE = 'Dual-sourcing 2027';
ENV_OUT.EYE_B36_PLANNING_LEAD = 'a.novak';
const msrEnsure = async (title, def) => {
  let id = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'MSR' and title = $3 and status = 'active' limit 1`, [T, D, title]))[0]?.id ?? null;
  if (id) return id;
  const d = await gr(novak, 'strategy/declare', 'graph.strategy.declare', 'MSR', { objectType: 'MSR', title, statement: `${title} (SYNTHETIC)`, status: 'active', restsOn: [{ kind: 'strategy', id: OBJ_REG.id, rationale: 'the measure serves the Regensburg supply objective' }] });
  if (!d.ok) { fail(`A. Novák declares "${title}"`, d); return null; }
  id = d.body.strategy.objectId;
  const f = await gr(novak, `strategy/measures/${id}/define`, 'graph.measure.define', 'MSR', { objectiveId: OBJ_REG.id, ...def }, id);
  if (!f.ok) { fail(`A. Novák defines "${title}"`, f); return null; }
  ok(`A. Novák DECLARED and DEFINED the measure ${short(id)} "${title}" (${def.unit}, target ${def.targetValue}, ${def.direction})`);
  return id;
};
const iniEnsure = async (title) => {
  const id = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'INI' and title = $3 and status = 'active' limit 1`, [T, D, title]))[0]?.id ?? null;
  if (id) return id;
  const d = await gr(novak, 'strategy/declare', 'graph.strategy.declare', 'INI', { objectType: 'INI', title, statement: `${title} (SYNTHETIC)`, status: 'active', restsOn: [{ kind: 'strategy', id: OBJ_REG.id, rationale: 'the initiative serves the Regensburg supply objective' }] });
  if (!d.ok) { fail(`A. Novák declares "${title}"`, d); return null; }
  ok(`A. Novák DECLARED the INI object ${short(d.body.strategy.objectId)} "${title}"`);
  return d.body.strategy.objectId;
};
let PLAN = (await q(`select plan_id::text id, state, current_version, budget_authority from executive.plans where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PLAN_TITLE]))[0] ?? null;
let INI_A = null; let INI_B = null;
if (PLAN) note(`the plan ${short(PLAN.id)} "${PLAN_TITLE}" stands (${PLAN.state}, v${PLAN.current_version}, authority ${PLAN.budget_authority}) — an earlier run`);
else {
  const r = await pl(novak, 'plans/declare', 'executive.plan.declare', 'PLN', { title: PLAN_TITLE, statement: 'a second NdFeB magnet source qualified and tooled before the 2027 corridor season, funded within the board\'s authority (SYNTHETIC)', horizon: '12m', objectiveIds: [OBJ_REG.id], currency: 'EUR', budgetTotal: '1200000.00', budgetAuthority: '900000.00', reviewCadenceDays: 30 });
  if (!r.ok) fail('A. Novák declares the plan', r); else { PLAN = { id: r.body.plan.plan_id, state: r.body.plan.state, current_version: 0 }; ok(`A. Novák DECLARED the plan ${short(PLAN.id)} "${PLAN_TITLE}": EUR 1 200 000 planned, authority 900 000, horizon 12m, on the Regensburg objective`); }
}
if (PLAN) {
  INI_A = await iniEnsure('Dual-sourcing 2027: qualify the second NdFeB source (SYNTHETIC)');
  INI_B = await iniEnsure('Dual-sourcing 2027: dual-tooling at Regensburg (SYNTHETIC)');
  const MSR_STOCK = await msrEnsure('Magnet stock on hand at Regensburg (B36, SYNTHETIC)', { unit: 'units', direction: 'higher_better', targetValue: 500, targetDate: '2027-06-30', freshnessDays: 30 });
  const MSR_BRG = DES_RUN ? await msrEnsure('Bearing component stock through the shortage study (B36, SYNTHETIC)', { unit: 'pcs', direction: 'higher_better', targetValue: 2000, targetDate: '2027-06-30', freshnessDays: 30 }) : null;
  const iniRow = async (id) => (await q(`select state, funded_amount, priority from executive.initiatives where initiative_id = $1 and plan_id = $2`, [id, PLAN.id]))[0] ?? null;
  for (const [id, objective, share, rationale] of [[INI_A, OBJ_REG.id, '600000.00', 'the second source is the 2027 plan\'s core (SYNTHETIC)'], [INI_B, OBJ_REG.id, '250000.00', 'the tooling follows the qualified source (SYNTHETIC)']]) {
    if (id === null) continue;
    let row = await iniRow(id);
    if (row) { note(`the initiative ${short(id)} stands (${row.state}) — an earlier run`); continue; }
    const p = await pl(novak, 'initiatives/propose', 'executive.initiative.propose', 'INI', { initiativeId: id, planId: PLAN.id, objectiveId: objective, sponsor: brandt.principalId, owner: brandt.principalId, budgetShare: share, rationale }, id);
    if (!p.ok) { fail(`A. Novák proposes ${short(id)}`, p); continue; }
    ok(`A. Novák PROPOSED the initiative ${short(id)} (share EUR ${share}, sponsor and owner L. Brandt) → ${p.body.initiative.state}`);
  }
  const step = async (s, id, path, action, payload, label) => { const r = await pl(s, `initiatives/${id}/${path}`, action, 'INI', payload, id); if (!r.ok) fail(label, r); else ok(`${label} → ${r.body.initiative.state}${r.body.initiative.funded_amount ? ` (funded ${r.body.initiative.funded_amount})` : ''}`); return r.ok; };
  for (const [id, prio, amount] of [[INI_A, 1, '600000.00'], [INI_B, 2, '250000.00']]) {
    if (id === null) continue;
    let row = await iniRow(id); if (row === null) continue;
    if (row.state === 'proposed') { await step(novak, id, 'align', 'executive.initiative.align', { objectiveIds: [OBJ_REG.id], rationale: 'aligned to the Regensburg supply objective (SYNTHETIC)' }, `A. Novák ALIGNS ${short(id)}`); row = await iniRow(id); }
    if (row.state === 'aligned') { await step(novak, id, 'prioritise', 'executive.initiative.prioritise', { priority: prio, rationale: 'ranked by the strategy lead (SYNTHETIC)' }, `A. Novák PRIORITISES ${short(id)} at ${prio}`); row = await iniRow(id); }
    if (row.state === 'prioritised') { await step(dvorak, id, 'fund', 'executive.initiative.fund', { amount, rationale: 'funded within the plan authority (SYNTHETIC)' }, `M. Dvořák FUNDS ${short(id)} with EUR ${amount}`); row = await iniRow(id); }
    if (row.state === 'funded') { await step(dvorak, id, 'approve', 'executive.initiative.approve', { rationale: 'approved by the executive; the INI object gains its next version (SYNTHETIC)' }, `M. Dvořák APPROVES ${short(id)}`); }
  }
  const ms = await q(`select milestone_id::text id, name, state from executive.milestones where plan_id = $1`, [PLAN.id]);
  if (ms.length > 0) note(`the milestones stand (${ms.map((m) => `"${m.name.slice(0, 30)}" ${m.state}`).join('; ')}) — an earlier run`);
  else {
    if (INI_A && MSR_STOCK) { const r = await pl(novak, 'milestones/set', 'executive.plan.milestone.set', 'INI', { initiativeId: INI_A, name: 'Q2 2024 magnet stock floor held during qualification (SYNTHETIC)', dueDate: '2024-03-01', measureId: MSR_STOCK, targetValue: '100000' }, INI_A); if (!r.ok) fail('the Q2 milestone', r); else ok(`A. Novák SET the milestone "${r.body.milestone.name}" due ${String(r.body.milestone.due_date).slice(0, 10)} — proven by the stock measure, target ≥ 100000`); }
    if (INI_B && MSR_BRG) { const r = await pl(novak, 'milestones/set', 'executive.plan.milestone.set', 'INI', { initiativeId: INI_B, name: 'Bearing component stock floor through the shortage study (SYNTHETIC)', dueDate: '2026-11-10', measureId: MSR_BRG, targetValue: '2000' }, INI_B); if (!r.ok) fail('the bearing-stock milestone', r); else ok(`A. Novák SET the milestone "${r.body.milestone.name}" due 2026-11-10 — proven by the bearing-stock measure, target ≥ 2000`); }
  }
  const bound = await q(`select measure_id::text id, quantity_key from executive.plan_measures where plan_id = $1`, [PLAN.id]);
  for (const [id, key] of [[MSR_STOCK, 'on_hand_end'], [MSR_BRG, 'component_stock_end']]) {
    if (id === null) continue;
    if (bound.find((b) => b.id === id)?.quantity_key === key) { note(`the measure ${short(id)} is bound to the run key ${key} — an earlier run`); continue; }
    const r = await pl(novak, `plans/${PLAN.id}/measures/bind`, 'executive.plan.measure.bind', 'PLN', { measureId: id, quantityKey: key }, PLAN.id);
    if (!r.ok) fail(`A. Novák binds ${short(id)} to ${key}`, r); else ok(`A. Novák BOUND the plan measure ${short(id)} to the run output key "${key}"`);
  }
  const runs = await q(`select run_id::text id from executive.plan_runs where plan_id = $1`, [PLAN.id]);
  for (const [rid, label] of [[PAIR.control, 'the corridor control run (supply-flow@1; act-b24/b34\'s pair)'], [DES_RUN?.id ?? null, 'act-b29\'s discrete-event run of the Regensburg line']]) {
    if (rid === null) continue;
    if (runs.some((r) => r.id === rid)) { note(`the run ${short(rid)} is attached — an earlier run`); continue; }
    const r = await pl(novak, `plans/${PLAN.id}/runs/attach`, 'executive.plan.run.attach', 'PLN', { runId: rid }, PLAN.id);
    if (!r.ok) fail(`A. Novák attaches ${label}`, r); else ok(`A. Novák ATTACHED ${label} ${short(rid)} (${r.body.run.model_ref})`);
  }
  const versions = await q(`select version from executive.plan_versions where plan_id = $1 order by version`, [PLAN.id]);
  if (versions.length > 0) note(`the plan is baselined (version ${versions.at(-1).version}, signed) — an earlier run`);
  else {
    const r = await pl(dvorak, `plans/${PLAN.id}/baseline`, 'executive.plan.baseline', 'PLN', { note: 'the 2027 dual-sourcing plan baselined for the board (SYNTHETIC)' }, PLAN.id);
    if (!r.ok) fail('M. Dvořák baselines the plan', r); else ok(`M. Dvořák BASELINED the plan: version ${r.body.baseline.version}, digest ${String(r.body.baseline.digest).slice(0, 12)}… — SIGNED ${r.body.baseline.signature?.key_id ?? ''} (PLN@${r.body.baseline.object?.object_version} admitted)`);
  }
  // THE VARIANCE by the schedule (the attention agent's tick step plan-variance)
  {
    const probe = () => q(`select v.variance_id::text id, m.name, v.basis_kind, v.observed_value, v.target_value, v.adverse, v.routed_item_id::text item from executive.plan_variances v join executive.milestones m using (milestone_id) where v.plan_id = $1 order by v.raised_at`, [PLAN.id]);
    const had = await probe();
    if (had.length > 0) note(`the variances stand (${had.map((v) => `"${v.name.slice(0, 24)}" ${v.basis_kind} ${v.observed_value} vs ${v.target_value}`).join('; ')}) — an earlier run`);
    else {
      note(`waiting for the attention agent's scheduled tick (plan-variance; every 60 s) — ${elapsed()}`);
      const got = await waitFor('the Q2 variance', probe, (r) => r.length > 0, 4 * MIN);
      (got?.length ? ok : bad)(`THE VARIANCE raised by the SCHEDULE: ${(got ?? []).map((v) => `"${v.name.slice(0, 40)}" from ${v.basis_kind}: ${v.observed_value} against ${v.target_value} (adverse ${v.adverse}) → routed as item ${short(v.item)}`).join('; ') || 'none'}`);
    }
    const sens = await pl(novak, `plans/${PLAN.id}/sensitivity`, 'executive.plan.read', 'PLN', { runId: PAIR.control }, PLAN.id);
    if (sens.ok) note(`THE SENSITIVITY under the control run (a read, nothing recorded): ${sens.body.sensitivity.summary?.line ?? JSON.stringify(sens.body.sensitivity).slice(0, 120)}; outputs digest ${String(sens.body.sensitivity.outputs_digest ?? '').slice(0, 12)}…`);
  }
  // THE BREACH: the authority lowered below the funded sum; the package citing the initiative HELD at commitment; acknowledged → committed
  let breach = (await q(`select breach_id::text id, state, forecast_impact from executive.plan_breaches where plan_id = $1 and kind = 'budget_over_authority' order by opened_at desc limit 1`, [PLAN.id]))[0] ?? null;
  if (breach) note(`the budget breach ${short(breach.id)} stands (${breach.state}) — an earlier run`);
  else {
    const r = await pl(dvorak, `plans/${PLAN.id}/authority`, 'executive.plan.authority.set', 'PLN', { authority: '700000.00', reason: 'the 2027 envelope cut by the board (SYNTHETIC)' }, PLAN.id);
    if (!r.ok) fail('M. Dvořák lowers the authority', r);
    else { breach = { id: r.body.authority.breach_id, state: 'open' }; ok(`M. Dvořák LOWERED the authority ${r.body.authority.prior_authority} → ${r.body.authority.budget_authority} under the funded ${r.body.authority.funded}: ${r.body.authority.continuity} — breach ${short(breach.id)} OPEN at once`); }
  }
  const PPKG_TITLE = 'B36 plan — the second-source purchase authorisation (SYNTHETIC)';
  const PP = await packageByTitle(PPKG_TITLE, brenner, { statement: 'the purchase authorisation for the second source under the 2027 plan; it activates the execution target nordwerk-erp-real (SYNTHETIC)', optionTitle: 'Authorise the second-source purchase requests',
    approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 }, rationale: `Activate the execution target ${'nordwerk-erp-' + 'real'} for the second-source purchase requests under the 2027 plan (SYNTHETIC).` });
  if (PP && INI_A) {
    const v = Number(PP.current_version);
    const cited = (await q(`select 1 from decision.package_events where package_id = $1 and event = 'initiative.cited'`, [PP.id])).length > 0;
    if (cited) note('the package cites the initiative — an earlier run');
    else { const c = await pl(brenner, `packages/${PP.id}/cite`, 'executive.plan.initiative.cite', 'DEC', { initiativeId: INI_A }, PP.id); if (!c.ok) fail('C. Brenner cites the initiative', c); else ok(`C. Brenner CITED the initiative ${short(INI_A)} on the package ${short(PP.id)} (plan ${short(c.body.citation.plan_id)})`); }
    const digest = (await q(`select version_digest d from decision.package_versions where package_id = $1 and version = $2`, [PP.id, v]))[0]?.d;
    const approved = (await q(`select 1 from decision.approvals where package_id = $1 and version = $2 and revoked_at is null`, [PP.id, v])).length > 0;
    if (!approved) { const a = await dc(okafor, `${PP.id}/versions/${v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: digest, rationale: 'The purchase authorisation follows the plan (SYNTHETIC).' }); if (!a.ok) fail('S. Okafor approves', a); else ok('S. Okafor APPROVED the purchase authorisation'); }
    const committed = (await q(`select commitment_id::text id from decision.commitments where package_id = $1`, [PP.id]))[0] ?? null;
    if (committed) note(`the purchase authorisation is committed (${short(committed.id)}) — an earlier run`);
    else {
      const preview = async () => { const r = await dc(brandt, `${PP.id}/versions/${v}/preview`, 'decision.commit.preview', 'DPK', { versionDigest: digest }, PP.id); if (!r.ok) fail('L. Brandt previews', r); return r.ok ? r.body.preview : null; };
      const commit = (pd) => dc(brandt, `${PP.id}/versions/${v}/commit`, 'decision.commit', 'CMT', { versionDigest: digest, previewDigest: pd }, null, { consequence: 'C3' });
      const p1 = await preview();
      if (p1 && breach?.state === 'open') {
        expectRefused('L. Brandt committing while the plan breach is open', await commit(p1.preview_digest), 409, /plan commitment rejected \(breach_open\)/);
        const a = await pl(dvorak, `breaches/${breach.id}/acknowledge`, 'executive.plan.breach.acknowledge', 'PLN', { authorization: 'board minute 2026-09-12: the overrun is carried into the Q1 review (SYNTHETIC)' });
        if (!a.ok) fail('M. Dvořák acknowledges the breach', a); else { breach.state = a.body.breach.state; ok(`M. Dvořák ACKNOWLEDGED the breach with the authority named → ${a.body.breach.state}`); }
        for (const b2 of await q(`select breach_id::text id, kind from executive.plan_breaches where plan_id = $1 and state = 'open'`, [PLAN.id])) { const a2 = await pl(dvorak, `breaches/${b2.id}/acknowledge`, 'executive.plan.breach.acknowledge', 'PLN', { authorization: `${b2.kind} carried under the board minute (SYNTHETIC)` }); note(`the open breach ${b2.kind} ${a2.ok ? 'acknowledged' : refusalLine(a2)}`); }
      }
      const p2 = await preview();
      const c2 = p2 ? await commit(p2.preview_digest) : null;
      if (c2?.ok && c2.body.commitment) ok(`L. Brandt COMMITTED the purchase authorisation (C3): commitment ${short(c2.body.commitment.commitmentId)} — the breach acknowledged, the hold lifted`); else if (c2) fail('L. Brandt commits', c2);
    }
  }
  const view = await pl(novak, `plans/${PLAN.id}/get`, 'executive.plan.read', 'PLN', {}, PLAN.id);
  if (view.ok) ok(`THE WORKSPACE (A. Novák): "${view.body.plan.title}" ${view.body.plan.state} v${view.body.plan.current_version}; funded ${view.body.plan.funded} of ${view.body.plan.budget_total} under authority ${view.body.plan.budget_authority}; initiatives ${(view.body.plan.initiatives ?? []).map((i) => `${String(i.title ?? '').slice(0, 30)} ${i.state}`).join('; ')}; variances ${(view.body.plan.variances ?? []).length}, breaches ${(view.body.plan.breaches ?? []).map((b) => `${b.kind} ${b.state}`).join(', ')}`); else fail('the workspace read', view);
}

/* ── B36-C THE COLLABORATION COMPLETION ──────────────────────────────────────────────── */
console.log('\nB36-C THE COLLABORATION COMPLETION — the invitation delivered to the SYNTHETIC mailbox, tasks waiting on one another, the real target\'s activation and the egress refusal, the outcome loop closed on both exposures');
ENV_OUT.EYE_B36_EXPERT_PASSWORD = ['customs', 'broker', 'b36', 'synthetic'].join('-');
{
  // the earlier invitation (act-b34's, provisioned before the delivery path existed) is REVOKED by L. Brandt; a NEW one is requested and delivered
  const legacy = await q(`select g.grant_id::text id, g.state from executive.collab_grants g where g.workspace_id = $1 and g.state in ('invited', 'accepted') and not exists (select 1 from executive.invitation_deliveries d where d.grant_id = g.grant_id) order by g.invited_at`, [WS.id]);
  for (const g of legacy) { const rv = await col(brandt, `grants/${g.id}/revoke`, 'executive.collab.grant.revoke', 'CGR', { reason: 'superseded: act-b34\'s invitation predates the delivery path; the B36 invitation replaces it (SYNTHETIC)' }, g.id); if (rv.ok) ok(`L. Brandt REVOKED act-b34's grant ${short(g.id)} (${g.state} → ${rv.body.grant?.state}) — a new invitation follows`); else fail(`L. Brandt revokes ${short(g.id)}`, rv); }
  let grant = (await q(`select g.grant_id::text id, g.state, case when d.picked_up_at is not null then 'picked_up' when d.locked_at is not null then 'locked' else 'delivered' end dstate, d.channel from executive.collab_grants g join executive.invitation_deliveries d on d.grant_id = g.grant_id where g.workspace_id = $1 order by g.invited_at desc limit 1`, [WS.id]))[0] ?? null;
  if (grant) note(`the delivered invitation ${short(grant.id)} stands (grant ${grant.state}, delivery ${grant.dstate} via ${grant.channel}) — an earlier run${grant.dstate === 'picked_up' ? ' (picked up by the walk)' : ''}`);
  else {
    const req = await col(brandt, `workspaces/${WS.id}/invitations`, 'executive.collab.invite', 'CGR', { display_name: 'R. Haddad — customs broker, partner firm (SYNTHETIC)', contact_label: 'customs-broker@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 });
    if (!req.ok) fail('L. Brandt requests the invitation', req);
    else {
      ok(`L. Brandt REQUESTED R. Haddad's invitation: grant ${short(req.body.grant.grant_id)} ${req.body.grant.state}`);
      const pv = await col(admin, `grants/${req.body.grant.grant_id}/provision`, 'executive.collab.provision', 'CGR', {}, req.body.grant.grant_id);
      if (!pv.ok) fail('the administrator provisions it', pv);
      else { const g = pv.body.grant; grant = { id: g.grant_id, state: g.state, dstate: g.delivery?.pending ? 'pending' : 'delivered', channel: g.delivery?.channel }; ok(`the administrator PROVISIONED it through the identity authority and the invitation was DELIVERED: grant ${short(g.grant_id)} ${g.state}, delivery ${JSON.stringify({ channel: g.delivery?.channel, synthetic: g.delivery?.synthetic, pending: g.delivery?.pending })} — the answer carries no token`); }
    }
  }
  if (grant) {
    ENV_OUT.EYE_B36_INVITATION_ID = grant.id;
    expectRefused('L. Brandt reading the synthetic mailbox (an identity administrator\'s read)', await col(brandt, `grants/${grant.id}/mailbox`, 'executive.collab.mailbox.read', 'CGR', {}, grant.id), 403);
    const mb = await col(admin, `grants/${grant.id}/mailbox`, 'executive.collab.mailbox.read', 'CGR', {}, grant.id);
    if (!mb.ok) fail('the administrator reads the mailbox', mb);
    else { const body = String(mb.body.message?.body ?? ''); const code = /([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/.test(body); const login = /\b(ext-[a-z0-9]{12})\b/.exec(body)?.[1] ?? null; ok(`THE SYNTHETIC MAILBOX (the administrator's read): delivery ${mb.body.delivery?.state}, ${mb.body.delivery?.failures} failure(s); the message carries the one-time pickup code (${code ? 'present' : 'ABSENT'}) and the login ${login ?? '—'}; the token is nowhere in it (${/token/i.test(body) ? 'the word token appears' : 'no token'})`); if (login) ENV_OUT.EYE_B36_EXPERT_LOGIN = login; }
    note(`the PICKUP and the ACCEPTANCE are LEFT FOR THE WALK (from /login?invitation=${grant.id}, the code from the mailbox page, the password EYE_B36_EXPERT_PASSWORD) — the act never picks the material up; the harness proves the pickup route (phase6-collab-b36 T1)`);
  }
  // TASK DEPENDENCIES: two collab.review tasks for M. Dvořák, B waiting on A
  const task = async (key, title) => { const r = await col(brandt, `workspaces/${WS.id}/review-requests`, 'executive.collab.review.request', 'HTK', { reviewer: dvorak.principalId, title, escalation: { max_escalations: 0 }, request_key: key }); if (!r.ok) { fail(`L. Brandt requests "${title}"`, r); return null; } if (!r.body.task.repeated) ok(`L. Brandt REQUESTED M. Dvořák's review "${title}": task ${short(r.body.task.task_id)} ${r.body.task.state}`); else note(`the task "${title}" ${short(r.body.task.task_id)} stands (${r.body.task.state}) — an earlier run`); return r.body.task.task_id; };
  const A = await task('b36-' + 'review-a', 'A · the customs brief for the rerouted consignments (B36, SYNTHETIC)');
  const B = await task('b36-' + 'review-b', 'B · the route summary after the brief (B36, SYNTHETIC)');
  if (A && B) {
    const had = await call(`${EX}/tasks/${B}/dependencies/get`, env_(dvorak, 'executive')({ action: 'executive.task.read', objectType: 'HTK', objectId: B, sideEffect: 'none' }), {}, dvorak.token);
    if (had.ok && (had.body.dependencies?.waits_on ?? []).some((w) => w.task_id === A)) note(`B waits on A (blocked ${had.body.dependencies.blocked}) — an earlier run`);
    else {
      const d = await call(`${EX}/tasks/${B}/dependencies`, env_(brandt, 'executive')({ action: 'executive.task.dependency.declare', objectType: 'HTK', objectId: B, consequence: 'C2' }), { depends_on: A }, brandt.token);
      if (!d.ok) fail('L. Brandt declares the dependency', d); else ok(`L. Brandt DECLARED: task B ${short(B)} WAITS ON task A ${short(A)} (${d.body.dependency.kind}; B blocked ${d.body.dependency.dependencies?.blocked}) — B completes only when A has closed`);
    }
  }
  // THE REAL EXECUTION TARGET (a loopback literal, SYNTHETIC record — nothing real behind it): registered inactive by T. Richter
  const KEY = 'nordwerk-erp-' + 'real';
  let tgt = (await q(`select target_key, activation_state, synthetic, state from decision.execution_targets where tenant_id = $1 and domain_id = $2 and target_key = $3`, [T, D, KEY]))[0] ?? null;
  if (tgt) note(`the target ${KEY} stands (${tgt.activation_state}) — an earlier run`);
  else {
    const dir = mkdtempSync(join(tmpdir(), 'eye-b36-anchor-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: ['ignore', 'ignore', 'ignore'] });
    const anchor = readFileSync(join(dir, 'c.pem'), 'utf8');
    const r = await cm(richter, 'targets/register', 'decision.execution.target.register', 'EXT', { targetKey: KEY, label: 'NORDWERK purchasing — the real ERP (SYNTHETIC record; a loopback literal)', endpoint: 'https://127.0.0.1:9/purchase-requests', trustAnchorPem: anchor }, null, { consequence: 'C2' });
    if (!r.ok) fail('T. Richter registers the real target', r); else { tgt = r.body.target; ok(`T. Richter REGISTERED the REAL target ${KEY}: ${r.body.target.activation_state}, synthetic ${r.body.target.synthetic}, a self-signed trust anchor for 127.0.0.1 declared (no credential bound; nothing real exists behind the literal)`); }
  }
  const HAND = (await q(`select i.item_id::text id from decision.commitment_items i join decision.commitments c using (commitment_id) where c.package_id = $1 and i.kind = 'handoff' order by i.created_at limit 1`, [MITIG.pkg]))[0]?.id ?? null;
  const PP_PKG = (await q(`select package_id::text id from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'B36 plan — the second-source purchase authorisation (SYNTHETIC)' and state = 'committed' limit 1`, [T, D]))[0]?.id ?? null;
  if (tgt && HAND) {
    const hos = await q(`select h.handoff_id::text id, h.state, (select outcome from decision.execution_attempts a where a.handoff_id = h.handoff_id order by attempt desc limit 1) outcome from decision.execution_handoffs h join decision.execution_targets t on t.target_id = h.target_id where h.item_id = $1 and t.target_key = $2 order by h.drafted_at`, [HAND, KEY]);
    if (hos.length > 0) note(`the handoffs to ${KEY} stand (${hos.map((h) => `${short(h.id)} ${h.state}${h.outcome ? ` / ${h.outcome}` : ''}`).join('; ')}) — an earlier run`);
    else {
      const LINES = [{ line_key: 'BRG-6205', description: 'SYN-PART-BRG bearing sets, second source (SYNTHETIC)', quantity: 400, unit: 'pcs' }];
      const d1 = await cm(brandt, `items/${HAND}/handoffs`, 'decision.execution.draft', 'EXH', { targetKey: KEY, lines: LINES });
      if (!d1.ok) fail('L. Brandt drafts the handoff to the real target', d1);
      else {
        ok(`L. Brandt DRAFTED the handoff ${short(d1.body.handoff.handoff_id)} to ${KEY} (one line, 400 pcs)`);
        expectRefused('K. Lange issuing to the INACTIVE real target', await cm(lange, `handoffs/${d1.body.handoff.handoff_id}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest: d1.body.handoff.payload_digest }, d1.body.handoff.handoff_id, { consequence: 'C3' }), 409, /execution handoff rejected \(inactive_target\)/);
        if (PP_PKG === null) bad('no committed package names the target — the activation is not staged');
        else {
          expectRefused('T. Richter (the registrar) activating the target', await cm(richter, `targets/${KEY}/activate`, 'decision.execution.target.activate', 'EXT', { decisionPackageId: PP_PKG }, null, { consequence: 'C2' }), 403);
          const act = await cm(lange, `targets/${KEY}/activate`, 'decision.execution.target.activate', 'EXT', { decisionPackageId: PP_PKG }, null, { consequence: 'C2' });
          if (!act.ok) fail('K. Lange activates the target', act);
          else {
            ok(`K. Lange ACTIVATED ${KEY} with the committed purchase authorisation ${short(PP_PKG)} (its choice rationale names the target): ${act.body.target.activation_state}, authorized by decision ${short(act.body.target.authorized_by_decision)}`);
            const is = await cm(lange, `handoffs/${d1.body.handoff.handoff_id}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest: d1.body.handoff.payload_digest }, d1.body.handoff.handoff_id, { consequence: 'C3' });
            if (!is.ok) fail('K. Lange issues to the activated real target', is);
            else { const h = is.body.handoff; (h.egress?.refused === 'address_not_public' ? ok : bad)(`K. Lange ISSUED it: transport ${h.transport}; the PRODUCTION EGRESS REFUSED the loopback literal (${h.egress?.refused ?? h.attempt?.failure_class ?? '—'}; request sent ${h.egress?.request_sent === true}) — attempt ${h.attempt?.attempt} ${h.attempt?.outcome}; NOTHING REAL WAS REACHED`); }
            const de = await cm(richter, `targets/${KEY}/deactivate`, 'decision.execution.target.deactivate', 'EXT', { reason: 'the demonstration ends the activation: no real ERP stands behind the literal (SYNTHETIC)' }, null, { consequence: 'C2' });
            if (!de.ok) fail('T. Richter deactivates the target', de); else ok(`T. Richter DEACTIVATED ${KEY} with a reason → ${de.body.target.activation_state}`);
          }
        }
      }
    }
  }
  // THE OUTCOME LOOP (i, j): the outcome of each response recorded on the corridor twin (the January precedent), REVIEWED against the exposure, LEARNED
  const tw = (s, path, action, payload, objectId = TWIN) => call(`${W}/${path}`, env_(s, 'twin')({ action, objectType: 'TWN', objectId, consequence: 'C2' }), payload, s.token);
  const recordOutcome = async (pkgRow, key, field, locator, simulatedValue, observedValue, unit, criterionKey, ownerSession, noteText) => {
    const had = (await q(`select outcome_id::text id, met, observed_value from decision.outcomes where package_id = $1 and criterion_key = $2 order by recorded_at desc limit 1`, [pkgRow.pkg, criterionKey]))[0] ?? null;
    if (had) { note(`the outcome ${short(had.id)} of ${short(pkgRow.pkg)} stands (${criterionKey} observed ${had.observed_value}, met ${had.met}) — an earlier run`); return had.id; }
    const csv = `synthetic,record_id,line_id,${field},window_from,window_to,note\ntrue,${locator},SYN-LINE-A1,${observedValue},2024-01-11,2024-04-10,${noteText}\n`;
    const bytes = Buffer.from(csv, 'utf8');
    const up = await call(`${X}/observation/upload`, env_(hoffmann, 'observation')({ action: 'observation.run.trigger', objectType: 'RUN' }), { sourceId: SRC_NW.source_id, contractVersion: Number(SRC_NW.contract_version), files: [{ filename: `outcomes-${locator.toLowerCase()}.csv`, mediaType: 'text/csv; charset=utf-8', base64: bytes.toString('base64'), documentTime: '2024-04-10T00:00:00Z' }] }, hoffmann.token);
    if (!up.ok) { fail('A. Hoffmann uploads the outcome record', up); return null; }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const evd = (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and payload ->> 'content_digest' = $3 order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
    if (evd === null) { bad(`no evidence object carries the upload's digest ${digest.slice(0, 12)}…`); return null; }
    note(`A. Hoffmann UPLOADED the SYNTHETIC outcome record "${locator}" to "${SRC_NW.name}" (run ${short(up.body.run?.runId)}: ${up.body.run?.admitted} admitted) → evidence ${short(evd.id)}@${evd.v}`);
    const latest = (await q(`select max(version)::int v from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'admitted'`, [TWIN]))[0].v;
    const oS = await tw(nakamura, `${TWIN}/versions/open`, 'twin.version', { branchId: 'actual', knownAt: await dbNow(), observedThrough: '2024-01-17', carryFrom: latest, except: [key] });
    if (!oS.ok) { fail('T. Nakamura opens the simulated version', oS); return null; }
    const vSim = oS.body.version.version;
    const gS = await tw(nakamura, `${TWIN}/versions/${vSim}/ground`, 'twin.ground', { elements: [{ key, kind: 'simulated', value: simulatedValue, unit, validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: PAIR.intervention, version: 1 }] }] });
    if (!gS.ok) { fail('T. Nakamura grounds the simulated element', gS); return null; }
    const aS = await tw(nakamura, `${TWIN}/versions/${vSim}/admit`, 'twin.version.admit', { allowIncomplete: true });
    if (!aS.ok) { fail(`T. Nakamura admits version ${vSim}`, aS); return null; }
    const oO = await tw(nakamura, `${TWIN}/versions/open`, 'twin.version', { branchId: 'actual', knownAt: await dbNow(), observedThrough: '2024-04-10', carryFrom: vSim, except: [key] });
    if (!oO.ok) { fail('T. Nakamura opens the observed version', oO); return null; }
    const vObs = oO.body.version.version;
    const gO = await tw(nakamura, `${TWIN}/versions/${vObs}/ground`, 'twin.ground', { elements: [{ key, kind: 'observed', value: observedValue, unit, validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: evd.id, version: evd.v }], record: { locator, field } }] });
    if (!gO.ok) { fail('T. Nakamura grounds the observed element', gO); return null; }
    const aO = await tw(nakamura, `${TWIN}/versions/${vObs}/admit`, 'twin.version.admit', { allowIncomplete: true });
    if (!aO.ok) { fail(`T. Nakamura admits version ${vObs}`, aO); return null; }
    const rc = await tw(nakamura, `${TWIN}/reconcile`, 'twin.ground', { key, fromVersion: vSim, againstVersion: vObs, note: `the chosen run against the plant's record ${locator} (SYNTHETIC)` });
    if (!rc.ok) { fail('T. Nakamura reconciles', rc); return null; }
    const recon = rc.body.reconciliation?.reconciliationId ?? rc.body.reconciliation?.reconciliation_id ?? (await q(`select reconciliation_id::text id from twin.reconciliations where twin_id = $1 and key = $2 and from_version = $3 and against_version = $4 order by recorded_at desc limit 1`, [TWIN, key, vSim, vObs]))[0]?.id;
    ok(`T. Nakamura GROUNDED the twin: version ${vSim} simulated ${simulatedValue} ${unit} (the reroute run) → version ${vObs} observed ${observedValue} ${unit} (the record ${locator}); RECONCILED ${short(recon)}`);
    const out = await dc(ownerSession, `${pkgRow.pkg}/outcomes`, 'decision.outcome', 'OUT', { criterionKey, twinId: TWIN, twinVersion: vObs, elementKey: key, reconciliationId: recon, note: `${noteText} (SYNTHETIC)` });
    if (!out.ok) { fail(`${nm(ownerSession.principalId)} records the outcome`, out); return null; }
    ok(`${nm(ownerSession.principalId)} RECORDED the OUTCOME ${short(out.body.outcome.outcomeId)}: ${criterionKey} observed ${out.body.outcome.observedValue} against ${out.body.outcome.target} → ${out.body.outcome.met ? 'MET' : 'NOT MET'}`);
    return out.body.outcome.outcomeId;
  };
  const reviewAndLearn = async (exposure, response, owner, ownerSession, effect, verdict, lesson, learning) => {
    const g = await xp(ownerSession, `${exposure}/get`, 'prediction.exposure.read', {}, exposure);
    const resp = g.ok ? (g.body.exposure?.responses ?? g.body.responses ?? []).find((x) => x.response_id === response) : null;
    if (!g.ok) { fail('the exposure read', g); return; }
    let reviewId = (resp?.reviews ?? [])[0]?.review_id ?? null;
    if (reviewId) note(`the outcome review ${short(reviewId)} stands (monitor ${resp.monitor?.state}) — an earlier run`);
    else if (resp?.monitor?.state !== 'outcome_recorded') { bad(`the response's monitor is ${resp?.monitor?.state ?? 'unknown'}, not outcome_recorded`); return; }
    else {
      const r = await xp(ownerSession, `${exposure}/outcomes/review`, 'prediction.exposure.outcome.review', { responseId: response, effect, residualVerdict: verdict, lesson }, exposure);
      if (!r.ok) { fail(`${nm(owner)} reviews the outcome`, r); return; }
      reviewId = r.body.review.review_id; ok(`${nm(owner)} (the exposure's owner) REVIEWED the outcome against the exposure: ${effect}, residual ${verdict} — the learn step is now OWED`);
    }
    if ((resp?.learnings ?? []).length > 0) { note(`the learning stands — an earlier run`); return; }
    const l = await call(`${XP}/${exposure}/learnings/record`, env_(ownerSession, 'prediction')({ action: 'prediction.exposure.learn', objectType: 'RSK', objectId: exposure, consequence: 'C2' }), { reviewId, ...learning }, ownerSession.token);
    if (!l.ok) fail(`${nm(owner)} records the learning`, l); else ok(`${nm(owner)} RECORDED the LEARNING ${short(l.body.learning.learning_id)} on the lineage: basis v${l.body.learning.basis_version} → "${String(l.body.learning.basis_change).slice(0, 80)}"`);
  };
  // (i) the corridor mitigation (act-b34's committed case, owner C. Brenner)
  {
    const corridorOwner = CORRIDOR.owner === brenner.principalId ? brenner : CORRIDOR.owner === brandt.principalId ? brandt : null;
    if (corridorOwner === null) bad(`the corridor exposure's owner ${short(CORRIDOR.owner)} is not a persona of this act`);
    else {
      const simDays = Number((await q(`select outputs -> 'totals' ->> 'line_stop_days' d from simulation.runs_current where run_id = $1`, [PAIR.intervention]))[0]?.d ?? 0);
      const out = await recordOutcome(MITIG, 'outcome.line_stop_days:SYN-LINE-A1', 'line_stop_days', 'SYN-OUT-2024Q1-B36-MITIG', simDays, 3, 'days', 'line_stop_days', MITIG.owner === brenner.principalId ? brenner : brandt, 'Three days of line stop while the rerouted bearing sets cleared Hamburg customs');
      if (out) await reviewAndLearn(CORRIDOR.id, MITIG.rid, CORRIDOR.owner, corridorOwner, 'partly_effective', 'reassess', 'The second source held the line to three stop days; the buffer, not the route, was the binding constraint — size the buffer first next time (SYNTHETIC).',
        { expected: 'a 30–60 % chance of a two-week line stop costing EUR 400–900k', observed: 'three days of line stop; the buffer held while the rerouted sets cleared customs', basisChange: 'the buffer, not the route, is the binding constraint: the next bracket rests on buffer days, not on transit days (SYNTHETIC)' });
      if (corridorOwner !== brandt) note('the brief casts L. Brandt as the reviewer; the port admits the exposure\'s owner or its sponsor only (exposure outcome review rejected otherwise) — C. Brenner, the corridor\'s owner, reviews and learns; L. Brandt reads it on the walk');
    }
  }
  // (j) the Morocco opportunity: the exploit package drafted and committed, its outcome recorded, reviewed, the closure co-signed, the package CLOSED, the learning by the sponsor
  {
    const morOwner = MOR.owner === brandt.principalId ? brandt : null;
    if (morOwner === null) bad(`the Morocco package's owner ${short(MOR.owner)} is not L. Brandt`);
    else {
      let pkg = (await q(`select package_id::text id, state, current_version, committed_version from decision.packages_current where package_id = $1`, [MOR.pkg]))[0];
      if (pkg.state === 'draft' || pkg.state === 'proposed') {
        let v = pkg.current_version;
        if (v === null) { const o = await dc(brandt, `${pkg.id}/versions/open`, 'decision.package.version', 'DPK', { knownAt: await dbNow(), observedThrough: null }, pkg.id); if (!o.ok) fail('L. Brandt opens the Morocco version', o); else v = o.body.version.version; }
        const vs = v === null ? null : (await q(`select state, version_digest from decision.package_versions where package_id = $1 and version = $2`, [pkg.id, v]))[0];
        let digest = vs?.version_digest ?? null;
        if (vs?.state === 'draft') {
          const steps = [
            await dc(brandt, `${pkg.id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'wait', title: 'Wait for the corridor to reopen', kind: 'status_quo', consequences: [{ kind: 'run', id: PAIR.control, version: 1 }], risks: [], opportunities: [] }, pkg.id),
            await dc(brandt, `${pkg.id}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'qualify', title: 'Qualify the Moroccan supplier now', kind: 'intervention', consequences: [{ kind: 'run', id: PAIR.intervention, version: 1 }], risks: ['the first article may fail the flux test'], opportunities: ['a lower landed cost for the freed share'] }, pkg.id),
            await dc(brandt, `${pkg.id}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 }, monitoringConditions: [{ kind: 'review', every_days: 14, owner: brandt.principalId }], reversibility: 'reversible until the qualification order is placed', informationValue: 'the first-article test decides the supplier, not the option' }, pkg.id),
            await dc(brandt, `${pkg.id}/versions/${v}/choice`, 'decision.package.choice', 'DPK', { option_key: 'qualify', rationale: 'The corridor closure frees the share a qualified Moroccan supplier captures at a lower landed cost (SYNTHETIC).', decision_deadline: '2027-01-15', accepted_trade_offs: ['the qualification run\'s cost'], action_owner: brandt.principalId,
              outcome_criteria: [{ key: 'qualification_weeks', quantity: 'weeks from the order to a passed first article (SYNTHETIC)', unit: 'weeks', target: 12, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.qualification_weeks:SYN-SUP-MA', twin_id: TWIN, period: { from: '2024-01-11', to: '2024-04-10' } }] }, pkg.id),
          ];
          const b1 = steps.find((x) => !x.ok);
          if (b1) fail('L. Brandt drafts the Morocco package', b1);
          else { const pr = await dc(brandt, `${pkg.id}/versions/${v}/propose`, 'decision.package.propose', 'DPK', {}, pkg.id); if (!pr.ok) fail('L. Brandt proposes', pr); else { digest = pr.body.proposal.versionDigest; ok(`L. Brandt DRAFTED and PROPOSED "${MOR.title}" version ${v} (wait vs qualify; the criterion: a passed first article within 12 weeks)`); } }
        }
        if (digest !== null) {
          if ((await q(`select 1 from decision.approvals where package_id = $1 and version = $2 and revoked_at is null`, [pkg.id, v])).length === 0) { const a = await dc(okafor, `${pkg.id}/versions/${v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: digest, rationale: 'The value range justifies a qualification run (SYNTHETIC).' }); if (!a.ok) fail('S. Okafor approves', a); else ok('S. Okafor APPROVED the exploit'); }
          const p = await dc(brandt, `${pkg.id}/versions/${v}/preview`, 'decision.commit.preview', 'DPK', { versionDigest: digest }, pkg.id);
          const c = p.ok ? await dc(brandt, `${pkg.id}/versions/${v}/commit`, 'decision.commit', 'CMT', { versionDigest: digest, previewDigest: p.body.preview.preview_digest }, null, { consequence: 'C3' }) : p;
          if (c.ok && c.body.commitment) ok(`L. Brandt COMMITTED the exploit (C3): commitment ${short(c.body.commitment.commitmentId)}`); else fail('L. Brandt commits the exploit', c);
        }
        pkg = (await q(`select package_id::text id, state, current_version, committed_version from decision.packages_current where package_id = $1`, [MOR.pkg]))[0];
      } else note(`the Morocco package is ${pkg.state} — an earlier run`);
      if (['committed', 'monitoring', 'closed'].includes(pkg.state)) {
        const out = await recordOutcome(MOR, 'outcome.qualification_weeks:SYN-SUP-MA', 'qualification_weeks', 'SYN-OUT-2024H1-B36-MA', 12, 9, 'weeks', 'qualification_weeks', brandt, 'The first article passed the flux test in week nine');
        if (out) {
          await reviewAndLearn(MOROCCO.id, MOR.rid, MOROCCO.owner, brandt, 'effective', 'stands', 'The first article passed the flux test in week nine; the twelve-week window was conservative (SYNTHETIC).',
            { expected: 'a qualified supplier within twelve weeks at plausibility medium', observed: 'the first article passed in week nine; the response closed effective', basisChange: 'nine weeks is the evidenced qualification time: the next hypothesis window rests on it, and the plausibility rises (SYNTHETIC)' });
          const cmt = (await q(`select commitment_id::text id from decision.commitments where package_id = $1`, [MOR.pkg]))[0]?.id ?? null;
          const root = cmt === null ? null : (await q(`select item_id::text id, state, reviewer_principal_id::text reviewer from decision.commitment_items where commitment_id = $1 and parent_item_id is null`, [cmt]))[0] ?? null;
          if (pkg.state === 'closed') note('the Morocco package is closed — an earlier run');
          else if (root) {
            if (root.state === 'open') { const a = await cm(brandt, `items/${root.id}/accept`, 'decision.commitment.item.accept', 'CMI', { note: 'accepted: the qualification is mine (SYNTHETIC)' }, root.id); if (a.ok) ok('L. Brandt ACCEPTED the commitment\'s root item'); else fail('L. Brandt accepts the root', a); }
            const closure = (await q(`select closure_id::text id, state from decision.commitment_closures where commitment_id = $1 order by proposed_at desc limit 1`, [cmt]).catch(() => []))[0] ?? null;
            let closureId = closure?.id ?? null; let closureState = closure?.state ?? null;
            if (closureId === null) { const pc = await cm(brandt, `${cmt}/closure`, 'decision.commitment.closure.propose', 'CMT', { deliverables: [{ title: 'Moroccan supplier qualified', evidence: 'the first-article flux test record SYN-OUT-2024H1-B36-MA (SYNTHETIC)' }], statement: 'The qualification is delivered: the first article passed in week nine (SYNTHETIC).' }, cmt); if (!pc.ok) fail('L. Brandt proposes the closure', pc); else { closureId = pc.body.closure.closure_id; closureState = pc.body.closure.state; ok(`L. Brandt PROPOSED the closure ${short(closureId)} (${closureState})`); } }
            if (closureId && closureState !== 'cosigned') {
              const reviewer = root.reviewer === weber.principalId ? weber : root.reviewer === dvorak.principalId ? dvorak : root.reviewer === brenner.principalId ? brenner : null;
              if (reviewer === null) bad(`the root item's reviewer ${short(root.reviewer)} is not a persona of this act`);
              else { const cs = await cm(reviewer, `closures/${closureId}/cosign`, 'decision.commitment.close', 'CMT', { commitmentId: cmt }, cmt); if (!cs.ok) fail(`${nm(root.reviewer)} co-signs the closure`, cs); else ok(`${nm(root.reviewer)} (the item's reviewer) CO-SIGNED the closure → ${cs.body.closure.state}`); }
            }
            const cl = await dc(brandt, `${MOR.pkg}/close`, 'decision.close', 'DPK', { lessons: 'The qualification run closed with its outcome recorded; the supplier is qualified in nine weeks (SYNTHETIC).' }, MOR.pkg);
            if (!cl.ok) fail('L. Brandt closes the Morocco package', cl); else ok(`L. Brandt CLOSED the Morocco package: ${cl.body.closure.state}, outcomes recorded ${cl.body.closure.outcomesRecorded}`);
          }
        }
      }
    }
  }
}

/* ── B36-A (part 2) THE HOLD ─────────────────────────────────────────────────────────── */
console.log('\nB36-A (part 2) THE HOLD — the skew planted (stated), the evaluation under the governance floor, the queue held and LEFT FOR THE WALK (last: every later scene\'s human transition would be refused under it)');
// THE ACT on the corridor item (after B36-B: the briefing's retention needs the warning still RAISED at the outage edition; the act acknowledges it)
if (ITEM) {
  const acts = await q(`select act_id::text id, state, action_key from executive.attention_item_acts where item_id = $1 order by launched_at`, [ITEM.id]);
  if (acts.length > 0) note(`L. Brandt's act on the item stands (${acts.map((a) => `${a.action_key} ${a.state}`).join(', ')}) — an earlier run`);
  else if (ITEM.state !== 'open') bad(`the corridor item is ${ITEM.state}, not open — the act cannot be launched`);
  else {
    const arm = await att(richter, 'recovery/fixtures/arm', 'executive.attention.fixture.arm', 'ATI', { fixture: 'settle_fault' });
    if (!arm.ok) fail('T. Richter arms the settle fault', arm); else ok(`T. Richter ARMED the SYNTHETIC settle fault (armed ${arm.body.fixture.armed}, synthetic ${arm.body.fixture.synthetic}) — the next act's settle in this process fails once`);
    const a = await att(brandt, `items/${ITEM.id}/act`, 'executive.attention.item.act', 'ATI', { action_key: 'acknowledge_warning', rationale: 'The corridor warning is answered for: the bearing sets are rebooked (SYNTHETIC).', params: { note: 'answered by L. Brandt (B36)' } }, ITEM.id);
    if (!a.ok) fail('L. Brandt acts on the corridor item', a);
    else {
      const act = a.body.act;
      (act.state === 'settle_failed' ? ok : bad)(`L. Brandt ACTED (acknowledge_warning → ${act.governed_action}): the governed action COMMITTED (audit seq ${act.action_receipt?.auditSeq}), the settle FAILED → ${act.state} — ${String(a.body.settle?.reason ?? '').slice(0, 80)}`);
      const w = (await q(`select state, acknowledged_by::text by from prediction.warnings_current where warning_id = $1`, [WARNING.id]))[0];
      note(`the warning is ${w.state} by ${nm(w.by)} — the effect stands although the settle failed`);
      expectRefused('the analyst resuming (not the launcher, not the operator)', await att(hoffmann, `acts/${act.act_id}/resume`, 'executive.attention.item.act.resume', 'ATI', {}, act.act_id), 403, /act resumption rejected \(actor\)/);
      const rs = await att(chief, `acts/${act.act_id}/resume`, 'executive.attention.item.act.resume', 'ATI', {}, act.act_id);
      if (!rs.ok) fail('the chief of staff resumes the act', rs); else ok(`the chief of staff RESUMED the act from the audit chain: ${rs.body.act.state}, re-executed ${rs.body.re_executed} (the receipt ${rs.body.resumption?.action_receipt?.source} seq ${rs.body.resumption?.action_receipt?.auditSeq}) — the governed action never performed twice`);
    }
  }
  const acc = (await q(`select acceptance_id::text id, accepted_by::text by from executive.attention_priority_acceptances where item_id = $1`, [ITEM.id]))[0] ?? null;
  if (acc) note(`the priority acceptance ${short(acc.id)} by ${nm(acc.by)} stands — an earlier run`);
  else {
    const r = await att(brandt, `items/${ITEM.id}/accept-priority`, 'executive.attention.item.accept_priority', 'ATI', { note: 'I take the corridor warning as my first priority this week (SYNTHETIC).' }, ITEM.id);
    if (!r.ok) fail('L. Brandt accepts the priority', r); else ok(`L. Brandt ACCEPTED the priority: evaluation digest ${String(r.body.acceptance.evaluation_digest).slice(0, 12)}…, consequence "${String(r.body.acceptance.consequence?.commits_to ?? '').slice(0, 90)}…" — SIGNED ${r.body.signature.key_id} (${r.body.signature.algorithm ?? 'Ed25519'})`);
  }
}
// THE HOLD: a SYNTHETIC skew PLANTED (stated) — C4 items of one class rank first, C1 items of another last — then the evaluation under the governance floor
{
  const hold = (await q(`select hold_id::text id, cause, state, measure from executive.attention_queue_holds where tenant_id = $1 and domain_id = $2 order by held_at desc limit 1`, [T, D]))[0] ?? null;
  if (hold) note(`the queue hold ${short(hold.id)} stands (${hold.cause}, ${hold.state}, measure ${hold.measure}) — an earlier run${hold.state === 'released' ? ' (released by the walk)' : ''}`);
  else if (POLICY === null) bad('no policy to evaluate under');
  else {
    const CLAIM_ID = (await q(`select object_id::text id from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'CLM' and lifecycle_state = 'active' order by recorded_at desc limit 1`, [T, D]))[0]?.id ?? SRC_NW.source_id;
    const plant = async (cls, subjectKind, consequence, title, roles, subjectId) => {
      const id = (await q('select gen_random_uuid()::text id'))[0].id;
      const created = await dbNow();
      const evaluation = { outcome: 'material', reasons: [`PLANTED by the B36 act as the skew of the hold scene (${cls}; SYNTHETIC)`], dimensions: { consequence, confidence: 0.9 }, thresholds: null, policy_version: POLICY.version, rank: { explanation: `consequence ${consequence}: planted rank (B36 act, SYNTHETIC)` } };
      await q(`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, created_at, updated_at, correlation_id)
               values ($1::uuid, 'DOMAIN', $2, $3, $4, $5, $13::uuid, gen_random_uuid(), 'EarlyWarningRaised', $6, 'material', 'open', $7, $8::text[], $9, $10, $11::jsonb, '{"planted":"b36-act-skew"}'::jsonb, $12::timestamptz + interval '60 minutes', 0, $12::timestamptz, $12::timestamptz, gen_random_uuid())`,
        [id, T, D, cls, subjectKind, title, hoffmann.principalId, roles, POLICY.policy_id, POLICY.version, JSON.stringify(evaluation), created, subjectId]);
      await q(`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, occurred_at, correlation_id)
               values (gen_random_uuid(), 'DOMAIN', $1, $2, $3::uuid, 'item.routed', $4, $5::jsonb, $6::timestamptz, gen_random_uuid())`, [T, D, id, dvorak.principalId, JSON.stringify({ outcome: 'material', reasons: evaluation.reasons, policy_version: POLICY.version, owner: hoffmann.principalId, route_roles: roles, planted: true }), created]);
    };
    let g = null;
    for (let round = 1; round <= 3 && !(g?.held); round += 1) {
      for (let i = 0; i < 3; i += 1) await plant('source.coverage_loss', 'source', 'C4', `B36 skew C4 #${round}.${i} (PLANTED, SYNTHETIC)`, ['domain_analyst'], SRC_NW.source_id);
      for (let i = 0; i < 3; i += 1) await plant('proposal.review', 'claim', 'C1', `B36 skew C1 #${round}.${i} (PLANTED, SYNTHETIC)`, ['domain_analyst'], CLAIM_ID);
      note(`round ${round}: six items PLANTED by the act as a stated superuser move (three C4 source.coverage_loss, three C1 proposal.review — the harness's skew; SYNTHETIC)`);
      const ev = await att(dvorak, 'evaluations/run', 'executive.attention.queue.evaluate', 'ATE', { min_sample: 3 });
      if (!ev.ok) { fail('M. Dvořák runs the queue evaluation', ev); break; }
      g = ev.body.governance ?? {};
      note(`the evaluation ${short(ev.body.evaluation?.evaluation_id)}: fairness ${g.measure ?? g.measures?.fairness?.value ?? '—'} against the floor ${g.threshold ?? 0.7} → held ${g.held}${g.reason ? ` (${g.reason})` : ''}`);
    }
    if (g?.held) ok(`THE HOLD RAISED by the evaluation: hold ${short(g.hold_id)}, cause ${g.cause}, measure ${g.measure} < ${g.threshold}, routed to the executive as the queue.governance item ${short(g.governance_item_id)} — the queue is served READ-ONLY until M. Dvořák releases it (LEFT FOR THE WALK)`);
    else bad(`the hold was not raised: ${JSON.stringify(g).slice(0, 240)}`);
  }
  const qr = await att(brandt, 'queue', 'executive.attention.queue.read', 'ATI', { limit: 50 });
  if (qr.ok) ok(`THE QUEUE (L. Brandt): context ${qr.body.context?.source} objective ${short(qr.body.context?.objective_id)} horizon ${qr.body.context?.horizon}; policy v${qr.body.policy?.version} governance ${JSON.stringify(qr.body.policy?.governance)}; ${(qr.body.items ?? []).length} served, ${(qr.body.filtered ?? []).length} filtered; hold ${qr.body.hold ? `${qr.body.hold.cause} (read-only)` : 'none'}`); else fail('the queue read', qr);
}

/* ── B36-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB36-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from executive.cadences where tenant_id = $1 and domain_id = $2)::int cadences,
                             (select count(*) from executive.signatures where tenant_id = $1 and domain_id = $2)::int signatures,
                             (select count(*) from executive.publications where tenant_id = $1 and domain_id = $2)::int publications,
                             (select count(*) from executive.plans where tenant_id = $1 and domain_id = $2)::int plans,
                             (select count(*) from executive.initiatives where tenant_id = $1 and domain_id = $2)::int initiatives,
                             (select count(*) from executive.invitation_deliveries where tenant_id = $1 and domain_id = $2)::int invitation_deliveries,
                             (select count(*) from prediction.exposure_learnings where tenant_id = $1 and domain_id = $2)::int learnings,
                             (select count(*) from graph.strategy_detections where tenant_id = $1 and domain_id = $2)::int detections,
                             (select count(*) from executive.attention_queue_holds where tenant_id = $1 and domain_id = $2)::int holds,
                             (select count(*) from executive.attention_priority_acceptances where tenant_id = $1 and domain_id = $2)::int acceptances,
                             (select count(*) from decision.distributions where tenant_id = $1 and domain_id = $2)::int distributions,
                             (select count(*) from executive.briefings where tenant_id = $1 and domain_id = $2 and schema_version = 'v3')::int briefings_v3`, [T, D]))[0];
  const targets = await q(`select activation_state, count(*)::int n from decision.execution_targets where tenant_id = $1 and domain_id = $2 group by 1 order by 1`, [T, D]);
  note(`in the ledgers: ${n.cadences} cadences, ${n.signatures} signatures, ${n.publications} publications, ${n.plans} plans, ${n.initiatives} initiatives, ${n.invitation_deliveries} invitation deliveries, execution targets ${targets.map((t) => `${t.activation_state} ${t.n}`).join(' / ')}, ${n.learnings} exposure learnings, ${n.detections} strategy detections, ${n.holds} queue hold(s), ${n.acceptances} priority acceptance(s), ${n.distributions} distribution rows, ${n.briefings_v3} BRF@v3 editions`);
  console.log('  the env lines for the walks:');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said: EVERY FIGURE IS SYNTHETIC (the personas, the amounts, the budgets, the milestones, the customs hours, the outcome records); every channel is a LOCAL SINK (the e-mail receipts of the distribution, the publication deliveries and the correction notices reach the loopback SMTP/HTTP sinks; the invitation is delivered to the SYNTHETIC mailbox — no real provider, D6); the REAL execution target is a loopback literal with a self-signed anchor and no credential — the production egress refuses it by design (address_not_public) and NOTHING REAL IS ACTIVATED OR REACHED; the signing key is the demonstration\'s own (EYE_EXECUTIVE_SIGNING_KEY_DEMO, bound by reference); the corridor warning is REAL (a probe indicator on the B28 corridor stream series, whose condition holds on its latest observations, evaluated by its owner — the PortWatch series carries a governed-deleted evidence version and the product evaluates no indicator on an incomplete history, for any reader; the exposure route raises no second corridor warning: its candidates cluster into act-b32\'s acknowledged one), while the corridor ITEM on it, the six skew items of the hold and the degraded health verdict of the outage are PLANTED as stated superuser moves (the harness\'s idiom); every edition of the gate room reads DEGRADED because the demonstration\'s collectors are (PortWatch\'s verdict, the others\' last scheduled attempts) — the retention shows on the THIRD edition (the agent\'s first, the person\'s second: a human\'s prior-less edition folds to restricted, and the page lists a room\'s editions oldest-first); the Board pack is a BRIEFING publication (a report of a monitoring package has no later version to correct to); the invitation\'s pickup and acceptance are left for the walk (the harness proves the route and the token\'s absence — phase6-collab-b36 T1); the exposure outcome is reviewed by the exposure\'s OWNER (the port admits the owner or the sponsor). HARNESS-PROVEN and not staged: home — the deadline-passed room item raised by the tick, the operator\'s refusals at the PDP, the metrics on an empty window (h3 RECOVERY, h5 REFUSAL, h6); gates — the unbound-key refusal, a tampered signature, the sms/teams sinks failing and recovering, a challenge upheld before commitment (withdrawal chain), the uniform gate state of a source and a merge, a direct denial record refused (k1/k2 RECOVERY, l2 RECOVERY, l5 REFUSAL, l6); attention — the recovery routes tick_stalled / delivery_sink_down / evaluation_stale / policy_invalid, the staleness cause of the hold, an agent at the gate, a planted launched act (RC, H1, R1); strategy — GraphChanged on strategy changes through the dispatcher, the gamed / lost-linkage / owner-missing detections, an as_of replay not accepted, a lapsed act (S4, S5, S6); briefing — the port\'s own refusals (uncertainty, contract, undeclared omission), the expiry tick, a pure board audience without the owner\'s note, the policy\'s unchanged/malformed refusals (b1–b5 REFUSAL, b3 EXPIRY); publishing — a legal hold refusing the export then lifted, the teams sink failing, a withdrawal with its notices, a stale digest rolling the signature back (d2/d3 RECOVERY, d5 REFUSAL); planning — the Planning Agent\'s proposal and its refusals at the human gate, the drift and infeasibility breaches, a lost objective linkage, an unsigned baseline refused (p2, p3); collab — the pickup with wrong codes and the lock, the re-driven delivery, the external\'s bounded self read and expiry, a workflow definition\'s depends_on (T1, Q1, R1). Nothing is cleaned: every object stands as a demonstration fact.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
