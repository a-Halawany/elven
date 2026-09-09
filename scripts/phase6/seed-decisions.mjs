#!/usr/bin/env node
/**
 * ACT VI — "we decide, and we can prove what we knew" (PHASE6_BUILD_PLAN.md §8).
 *
 * Runs after acts I–V on the demonstration deployment (eye_demo, API on :3401),
 * through the governed routes. Idempotent across passes: a persona is reused only
 * when it IS that persona; a package, a room or an outcome already recorded is
 * reported, not re-made. Everything real stays attributed; the company, the runs and
 * THE DECISION ITSELF are synthetic and marked so.
 *
 * ONE act outside the governed routes, disclosed here and in the transcript: Phase 0
 * offers no governed route that binds a SECOND role to an existing human, and Phase 0
 * is frozen (C14). The owner's decision_authority, the approver's executive role and
 * the observer's executive role are bound by the administrator through the database
 * controller (identity.role_bindings), exactly as the harness fixtures bind roles.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;
const require = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = require('pg');
const CODE_DIGEST = createHash('sha256').update('phase6-agents@1.0.0', 'utf8').digest('hex');

console.log('\n=== ACT VI — the decision, proven ===');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const T = scope.tenantId; const D = scope.domainId;
const X = `/v1/tenants/${T}/domains/${D}`;

/* ── 1. the personas ─────────────────────────────────────────────────────── */
console.log('\n1. the personas — two new synthetic humans, created by the platform administrator');
const principals = await call(`/v1/tenants/${T}/principals/list`, { scope: 'TENANT', tenantId: T, action: 'identity.principal.list', objectType: 'PRN', principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', sideEffect: 'none' }, {}, admin.token);
const existing = principals.ok ? (principals.body.principals ?? []) : [];
async function ensureHuman(loginName, displayName, roleCode) {
  const found = existing.find((p) => p.login_name === loginName || p.loginName === loginName);
  if (found) {
    const name = found.display_name ?? found.displayName;
    if (name !== displayName) { bad(`login ${loginName} already belongs to "${name}" — a different persona; refusing to reuse it`); process.exit(1); }
    ok(`${displayName} present (${roleCode})`); return found.id ?? found.principalId;
  }
  const r = await call(`/v1/tenants/${T}/principals`, { scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN', principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration' },
    { kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD, roleCode, domainId: D }, admin.token);
  if (r.ok) { ok(`${displayName} created (${roleCode})`); return r.body.principal?.principalId; }
  bad(`could not create ${displayName}: ${r.status} ${r.body?.message ?? ''}`); return null;
}
const ownerId = await ensureHuman('l.brandt', 'L. Brandt — decision owner', 'decision_owner');
const approverId = await ensureHuman('s.okafor', 'S. Okafor — executive approver', 'decision_approver');
const dvorakId = existing.find((p) => (p.login_name ?? p.loginName) === 'm.dvorak')?.id ?? existing.find((p) => (p.login_name ?? p.loginName) === 'm.dvorak')?.principalId ?? null;
const nakamuraId = existing.find((p) => (p.login_name ?? p.loginName) === 't.nakamura')?.id ?? existing.find((p) => (p.login_name ?? p.loginName) === 't.nakamura')?.principalId ?? null;
if (!ownerId || !approverId || !dvorakId || !nakamuraId) { bad('personas missing (run acts I–V first)'); process.exit(1); }
// The second roles: the administrator's act through the database controller (disclosed above).
{
  const c = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
  await c.connect();
  const bind = async (pid, role, who) => {
    const r = await c.query(`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
      select gen_random_uuid(), $1::uuid, $2, 'DOMAIN', $3::uuid, $4::uuid where not exists (select 1 from identity.role_bindings b where b.principal_id = $1::uuid and b.role_code = $2 and b.domain_id = $4::uuid and b.revoked_at is null)`, [pid, role, T, D]);
    note(`${who} ${r.rowCount === 1 ? 'now holds' : 'already held'} ${role} — bound by the administrator through the database controller (no governed second-role route exists in Phase 0)`);
  };
  await bind(ownerId, 'decision_authority', 'L. Brandt');
  await bind(approverId, 'executive', 'S. Okafor');
  await bind(dvorakId, 'executive', 'M. Dvořák');
  await c.end();
}
const owner = await login('l.brandt', OPERATOR_PASSWORD);
const approver = await login('s.okafor', OPERATOR_PASSWORD);
const weber = await login('j.weber', OPERATOR_PASSWORD);
const nakamura = await login('t.nakamura', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
if (!owner || !approver || !weber || !nakamura || !dvorak || !hoffmann) { bad('operator authentication failed'); process.exit(1); }
const dec = (s, over) => as(s, scope, { purposeId: 'decision', ...over });
const brf = (s, over) => as(s, scope, { purposeId: 'briefing', ...over });
const so = (over) => as(weber, scope, { purposeId: 'graph', ...over });
const tw = (over) => as(nakamura, scope, { purposeId: 'twin', ...over });
const adm = (over) => as({ ...admin, principalId: admin.principalId }, { tenantId: T, domainId: D }, { purposeId: 'platform.administration', ...over });

/* ── 2. the DEC, through Phase 3's own route ─────────────────────────────── */
console.log('\n2. the strategy owner declares the DEC through Phase 3\'s own route — a package never declares one');
const strategy = await call(`${X}/graph/strategy/list`, so({ action: 'graph.read', objectType: 'DEC', sideEffect: 'none' }), { limit: 200 }, weber.token);
const objects = strategy.body.strategy ?? [];
const objective = objects.find((s) => s.object_type === 'OBJ' && /Regensburg line supplied/i.test(s.title));
const assumption = objects.find((s) => s.object_type === 'ASU' && /corridor stays open/i.test(s.title));
if (!objective) { bad('act III\'s objective is missing — run scripts/phase3/seed-graph.mjs first'); process.exit(1); }
let decision = objects.find((s) => s.object_type === 'DEC' && s.title === 'January corridor collapse — response');
if (!decision) {
  const r = await call(`${X}/graph/strategy/declare`, so({ action: 'graph.strategy.declare', objectType: 'DEC' }), {
    objectType: 'DEC', title: 'January corridor collapse — response', statement: 'How the Regensburg line answers the corridor collapse: reroute, air bridge, draw down, or wait.', status: 'active',
    restsOn: [{ kind: 'strategy', id: objective.strategy_object_id, rationale: 'the decision serves the objective of keeping the line supplied' },
              ...(assumption ? [{ kind: 'strategy', id: assumption.strategy_object_id, rationale: 'the decision is taken while the corridor assumption is in question' }] : [])],
  }, weber.token);
  if (!r.ok) { bad(`DEC refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  decision = { strategy_object_id: r.body.strategy.objectId, title: 'January corridor collapse — response' };
  ok(`DEC declared ${decision.strategy_object_id.slice(0, 8)}… by J. Weber (graph.strategy.declare)`);
} else ok(`DEC present ${decision.strategy_object_id.slice(0, 8)}…`);
const DEC = decision.strategy_object_id;

/* ── 3. act V's runs on one control ──────────────────────────────────────── */
console.log('\n3. act V\'s runs — every consequence a completed run on ONE control, every value SYNTHETIC');
const twinsList = await call(`${X}/twins/list`, tw({ action: 'twin.read', objectType: 'TWN', sideEffect: 'none' }), {}, nakamura.token);
const twin = (twinsList.body.twins ?? []).find((t) => t.title.startsWith('NORDWERK'));
if (!twin) { bad('the NORDWERK twin is missing — run act V first'); process.exit(1); }
const runsList = await call(`${X}/twins/simulations/list`, as(nakamura, scope, { purposeId: 'simulation', action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { twinId: twin.twin_id }, nakamura.token);
const runs = (runsList.body.runs ?? []).filter((r) => r.state === 'completed' && r.branch_id === 'actual');
const control = runs.filter((r) => r.run_kind === 'control' && r.shock === true).sort((a, b) => String(a.opened_at).localeCompare(String(b.opened_at)))[0];
if (!control) { bad('no shocked control run on the actual branch'); process.exit(1); }
const onControl = runs.filter((r) => r.run_kind === 'intervention' && r.control_run_id === control.run_id);
const keyOf = (r) => (r.interventions ?? []).map((i) => String(i.type).replace(/_/g, '-')).join('-');
const byKey = Object.fromEntries(onControl.map((r) => [keyOf(r), r]));
ok(`control ${control.run_id.slice(0, 8)}… (${control.outputs?.totals?.line_stop_days} stop days) and ${onControl.length} intervention(s) on it: ${Object.keys(byKey).join(', ')}`);
const chosenKey = byKey['draw-down-reroute'] ? 'draw-down-reroute' : (byKey['reroute'] ? 'reroute' : Object.keys(byKey)[0]);
const chosenRun = byKey[chosenKey];
if (!chosenRun) { bad('no intervention run to choose'); process.exit(1); }

/* ── 4. the agents, registered by the administrator ──────────────────────── */
console.log('\n4. the three bounded agents — registered as agent principals with an accountable human, budgets and an escalation target');
const agentsList = await call(`${X}/agents/decision/list`, dec(owner, { action: 'agent.read', objectType: 'AGT', sideEffect: 'none' }), {}, owner.token);
const agents = agentsList.body.agents ?? [];
async function ensureAgent(kind) {
  const found = agents.find((a) => a.agent_kind === kind && a.status === 'active');
  if (found) { ok(`${kind} agent present ${found.agent_id.slice(0, 8)}…`); return found.agent_id; }
  const r = await call(`${X}/agents/decision/register`, adm({ action: 'agent.register', objectType: 'AGT' }),
    { kind, version: '1.0.0', codeDigest: CODE_DIGEST, ownerPrincipalId: ownerId, escalationPrincipalId: approverId, budgets: { max_reads: 400, max_gateway_calls: 0, max_elapsed_ms: 120000 }, stopConditions: ['budget', 'degraded input beyond threshold'] }, admin.token);
  if (!r.ok) { bad(`${kind} agent refused (${r.status}) ${r.body?.message ?? ''}`); return null; }
  ok(`${kind} agent registered ${r.body.agent.agentId.slice(0, 8)}… as principal ${r.body.agent.principalId.slice(0, 8)}… (${r.body.agent.role})`);
  return r.body.agent.agentId;
}
const decisionAgent = await ensureAgent('decision');
const briefingAgent = await ensureAgent('briefing');
const reportingAgent = await ensureAgent('reporting');

/* ── 5. the package ──────────────────────────────────────────────────────── */
console.log('\n5. the package — the agent drafts the option cards; the owner sets the terms and THE CHOICE, and proposes; the agent could not');
const TITLE = 'January corridor collapse — Regensburg line';
const packages = await call(`${X}/decisions/list`, dec(owner, { action: 'decision.read', objectType: 'DPK', sideEffect: 'none' }), {}, owner.token);
let pkg = (packages.body.packages ?? []).find((p) => p.title === TITLE);
if (!pkg) {
  const r = await call(`${X}/decisions/declare`, dec(owner, { action: 'decision.package.declare', objectType: 'DPK' }),
    { decisionObjectId: DEC, title: TITLE, statement: 'Whether to reroute the second magnet shipment, bridge by air, draw down the safety stock, or wait — while the corridor is collapsed.', owner: ownerId }, owner.token);
  if (!r.ok) { bad(`package refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  pkg = { package_id: r.body.package.packageId, versions: [], state: 'draft' };
  ok(`package declared ${pkg.package_id.slice(0, 8)}… bound to the DEC`);
} else ok(`package present ${pkg.package_id.slice(0, 8)}… (${pkg.state})`);
const PKG = pkg.package_id;
const indicators = await call(`${X}/prediction/indicators/list`, as(nakamura, scope, { purposeId: 'prediction', action: 'prediction.read', objectType: 'IND', sideEffect: 'none' }), {}, nakamura.token);
const transitIndicator = (indicators.body.indicators ?? []).find((i) => /chokepoint4/.test(String(i.series_key)));
const terms = {
  objectives: [objective.strategy_object_id], constraints: ['no air freight above 60 t/week', 'liquidated damages not modelled'],
  approverPolicy: { quorum: 1, principals: [approverId], expires_after_days: 14 },
  monitoringConditions: [
    ...(transitIndicator ? [{ kind: 'indicator', indicator_id: transitIndicator.indicator_id, owner: ownerId, note: 'the corridor transit indicator' }] : []),
    { kind: 'review', every_days: 7, owner: ownerId },
  ],
  reversibility: 'the reroute is reversible until the vessel passes Suez; the draw-down is not', informationValue: 'a week of observation would not change the ranking of the options',
};
const choiceFor = (key, rationale) => ({
  option_key: key, rationale, decision_deadline: '2024-01-19', accepted_trade_offs: ['38 days below safety stock', '+48,100 EUR reroute cost'], action_owner: nakamuraId,
  outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1' }],
});
let committedVersion = pkg.committed_version ?? null;
if (committedVersion === null) {
  const detail = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
  const versions = detail.body.package?.versions ?? [];
  let v1 = versions.find((v) => v.version === 1) ?? null;
  if (v1 === null) {
    const o = await call(`${X}/decisions/${PKG}/versions/open`, dec(owner, { action: 'decision.package.version', objectType: 'DPK', objectId: PKG }), { knownAt: new Date().toISOString(), observedThrough: '2024-01-17' }, owner.token);
    if (!o.ok) { bad(`version refused (${o.status}) ${o.body?.message ?? ''}`); process.exit(1); }
    v1 = { version: o.body.version.version, state: 'draft', options: [] };
    ok(`version 1 opened — observations through 2024-01-17, read at record time now`);
  }
  if (v1.state === 'draft') {
    if ((v1.options ?? []).length === 0 && decisionAgent) {
      const run = await call(`${X}/agents/decision/${decisionAgent}/run`, dec(owner, { action: 'agent.trigger', objectType: 'AGT', objectId: decisionAgent }), { task: 'draft', packageId: PKG, version: v1.version }, owner.token);
      if (!run.ok) bad(`decision agent run refused (${run.status}) ${run.body?.message ?? ''}`);
      else {
        const r = run.body.run;
        ok(`the decision agent drafted ${(r.outputs?.drafted ?? []).length} option card(s) into the draft (agent-produced, method ${r.outputs?.agent?.method}); its attempt to PROPOSE was refused (${r.refusals?.[0]?.code}) and recorded on run ${r.runId.slice(0, 8)}…`);
      }
      const after = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
      v1 = (after.body.package?.versions ?? []).find((v) => v.version === v1.version);
    }
    const keys = (v1.options ?? []).map((o) => o.key);
    const agentKeyFor = (r) => keys.find((k) => (v1.options.find((o) => o.key === k)?.consequences ?? []).some((c) => c.kind === 'run' && c.id === r.run_id)) ?? null;
    // Any run the agent did not card (a different control on the domain, say) is carded by the owner on the SAME control.
    for (const [key, r] of Object.entries(byKey)) {
      if (agentKeyFor(r) !== null) continue;
      const o = await call(`${X}/decisions/${PKG}/versions/${v1.version}/options`, dec(owner, { action: 'decision.package.option', objectType: 'DPK', objectId: PKG }),
        { key, title: `${key.replace(/-/g, ' ')} (act V run ${r.run_id.slice(0, 8)}…)`, kind: 'intervention', consequences: [{ kind: 'run', id: r.run_id, version: 1 }], risks: [], opportunities: [] }, owner.token);
      if (!o.ok) bad(`option ${key} refused (${o.status}) ${o.body?.message ?? ''}`); else ok(`option ${key} carded by the owner (SYNTHETIC consequence)`);
    }
    if (!keys.includes('wait')) {
      const o = await call(`${X}/decisions/${PKG}/versions/${v1.version}/options`, dec(owner, { action: 'decision.package.option', objectType: 'DPK', objectId: PKG }),
        { key: 'wait', title: 'Wait for the corridor to reopen', kind: 'intervention', consequences: assumption ? [{ kind: 'assumption', id: assumption.strategy_object_id }] : [], unsimulatedReason: 'no run models waiting; rests on the corridor assumption', risks: ['the February build stops'], opportunities: [] }, owner.token);
      if (!o.ok) bad(`option wait refused (${o.status}) ${o.body?.message ?? ''}`); else ok('option wait carded — UNSIMULATED, marked so');
    }
    const refreshed = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
    v1 = (refreshed.body.package?.versions ?? []).find((v) => v.version === v1.version);
    const firstChoice = agentKeyFor(byKey['reroute'] ?? chosenRun) ?? (v1.options.find((o) => o.kind === 'intervention')?.key);
    const t = await call(`${X}/decisions/${PKG}/versions/${v1.version}/terms`, dec(owner, { action: 'decision.package.terms', objectType: 'DPK', objectId: PKG }), terms, owner.token);
    if (!t.ok) bad(`terms refused (${t.status}) ${t.body?.message ?? ''}`); else ok(`terms set: objective, approver policy (S. Okafor, quorum 1, 14 days), ${terms.monitoringConditions.length} monitoring condition(s)`);
    const c = await call(`${X}/decisions/${PKG}/versions/${v1.version}/choice`, dec(owner, { action: 'decision.package.choice', objectType: 'DPK', objectId: PKG }), choiceFor(firstChoice, 'The reroute keeps the line running; the Cape premium is acceptable against a line stop.'), owner.token);
    if (!c.ok) bad(`choice refused (${c.status}) ${c.body?.message ?? ''}`); else ok(`the choice: ${firstChoice}, in the owner's own words, deadline 2024-01-19, action owner T. Nakamura, one measurable outcome criterion`);
    const p = await call(`${X}/decisions/${PKG}/versions/${v1.version}/propose`, dec(owner, { action: 'decision.package.propose', objectType: 'DPK', objectId: PKG }), {}, owner.token);
    if (!p.ok) { bad(`proposal refused (${p.status}) ${p.body?.message ?? ''}`); process.exit(1); }
    ok(`version 1 PROPOSED — DPK@v1 admitted, digest ${p.body.proposal.versionDigest.slice(0, 16)}…, baseline ${String(p.body.proposal.baselineRunId).slice(0, 8)}…, SYNTHETIC`);
  }

  /* ── 6. dissent, approval, the change of choice, the commitment ───────────── */
  console.log('\n6. dissent, approval, a last-minute change of the choice, and the commitment under the exact C3 action');
  let detail2 = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
  let versionsNow = detail2.body.package?.versions ?? [];
  let cur = versionsNow.find((v) => v.version === 1);
  if ((cur.dissent ?? []).length === 0) {
    const d = await call(`${X}/decisions/${PKG}/versions/1/dissent`, dec(dvorak, { action: 'decision.dissent', objectType: 'DPK', objectId: PKG }), { position: 'against the draw-down', rationale: 'Draw-down leaves 38 days below safety stock; one more delay and the line stops with no buffer.' }, dvorak.token);
    if (!d.ok) bad(`dissent refused (${d.status}) ${d.body?.message ?? ''}`); else ok('M. Dvořák records dissent on version 1 (append-only; approval will not remove it)');
  }
  const selfA = await call(`${X}/decisions/${PKG}/versions/1/approve`, dec(owner, { action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: cur.version_digest, rationale: 'the owner approving their own proposal' }, owner.token);
  if (!selfA.ok && selfA.status === 403) ok(`the owner's own approval is refused (403, audited: ${String(selfA.body?.message ?? '').slice(0, 60)}…)`); else bad(`self-approval was not refused (${selfA.status})`);
  if (!(cur.approvals ?? []).some((a) => a.decision === 'approve' && a.approver_principal_id === approverId)) {
    const a = await call(`${X}/decisions/${PKG}/versions/1/approve`, dec(approver, { action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: cur.version_digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, approver.token);
    if (!a.ok) bad(`approval refused (${a.status}) ${a.body?.message ?? ''}`); else ok(`S. Okafor approves version 1 — digest signed, ${a.body.approval.state}, expires ${String(a.body.approval.expiresAt).slice(0, 10)}`);
  }
  // the change of choice: version 2 carries the terms and options, never the choice; the approval does not carry
  let v2 = versionsNow.find((v) => v.version === 2) ?? null;
  if (v2 === null) {
    const o = await call(`${X}/decisions/${PKG}/versions/open`, dec(owner, { action: 'decision.package.version', objectType: 'DPK', objectId: PKG }), { knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: 1 }, owner.token);
    if (!o.ok) { bad(`version 2 refused (${o.status}) ${o.body?.message ?? ''}`); process.exit(1); }
    ok('version 2 opened from version 1 — the terms and the options carried, the choice NOT');
    const after = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
    v2 = (after.body.package?.versions ?? []).find((v) => v.version === 2);
  }
  if (v2.state === 'draft') {
    const key2 = (v2.options ?? []).find((o) => (o.consequences ?? []).some((c) => c.kind === 'run' && c.id === chosenRun.run_id))?.key;
    const c2 = await call(`${X}/decisions/${PKG}/versions/2/choice`, dec(owner, { action: 'decision.package.choice', objectType: 'DPK', objectId: PKG }), choiceFor(key2, 'On reflection: draw down the safety stock AND reroute — no line stop in the run, at the cost of 38 days below safety stock that we accept.'), owner.token);
    if (!c2.ok) bad(`choice 2 refused (${c2.status}) ${c2.body?.message ?? ''}`); else ok(`the choice changes to ${key2} — a new version, fresh approval needed`);
    const p2 = await call(`${X}/decisions/${PKG}/versions/2/propose`, dec(owner, { action: 'decision.package.propose', objectType: 'DPK', objectId: PKG }), {}, owner.token);
    if (!p2.ok) { bad(`proposal 2 refused (${p2.status}) ${p2.body?.message ?? ''}`); process.exit(1); }
    ok(`version 2 PROPOSED — digest ${p2.body.proposal.versionDigest.slice(0, 16)}…; version 1 superseded, its approval does not carry`);
  }
  detail2 = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
  v2 = (detail2.body.package?.versions ?? []).find((v) => v.version === 2);
  const early = await call(`${X}/decisions/${PKG}/versions/2/commit`, dec(owner, { action: 'decision.commit', objectType: 'CMT' }), { versionDigest: v2.version_digest }, owner.token);
  if (!early.ok) ok(`a commit before any approval is refused (${early.status}): ${String(early.body?.message ?? '').slice(0, 70)}…`); else bad('a commit without approval succeeded');
  if (!(v2.approvals ?? []).some((a) => a.decision === 'approve' && a.approver_principal_id === approverId && a.revoked_at === null)) {
    const a2 = await call(`${X}/decisions/${PKG}/versions/2/approve`, dec(approver, { action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: v2.version_digest, rationale: 'Draw-down plus reroute: no line stop, the buffer risk accepted and stated.' }, approver.token);
    if (!a2.ok) bad(`approval 2 refused (${a2.status}) ${a2.body?.message ?? ''}`); else ok(`S. Okafor approves version 2 — ${a2.body.approval.state}`);
  }
  // THE COMMIT: the envelope says C2, like every write the client sends; the route pins C3 and the port verifies it.
  const cm = await call(`${X}/decisions/${PKG}/versions/2/commit`, dec(owner, { action: 'decision.commit', objectType: 'CMT' }), { versionDigest: v2.version_digest }, owner.token);
  if (!cm.ok) { bad(`commit refused (${cm.status}) ${cm.body?.message ?? ''}`); process.exit(1); }
  ok(`L. Brandt COMMITS version 2 under decision.commit at class ${cm.body.commitment.opClass} — decided at ${cm.body.commitment.decidedAt}; the CMT ${cm.body.commitment.commitmentId.slice(0, 8)}… names the approved option (the envelope claimed C2; the route pinned C3)`);
  const again = await call(`${X}/decisions/${PKG}/versions/2/commit`, dec(owner, { action: 'decision.commit', objectType: 'CMT' }), { versionDigest: v2.version_digest }, owner.token);
  if (!again.ok) ok(`a second commit is refused naming the first (${again.status}): ${String(again.body?.message ?? '').slice(0, 70)}…`); else bad('a second commit succeeded');
  committedVersion = 2;
  note('a commit through an agent session and a commit with a C4 envelope are refused with EYE-WFL-002 / EYE-AUT-001 in the harness (phase6-agents, phase6-approvals); no agent token exists here to attempt one through the API');
} else ok(`package already committed at version ${committedVersion}`);

/* ── 7. the room and the briefing ────────────────────────────────────────── */
console.log('\n7. the room — members, weekly cadence — and the briefing the agent composes');
const roomsList = await call(`${X}/rooms/list`, dec(owner, { action: 'room.read', objectType: 'ROOM', sideEffect: 'none' }), {}, owner.token);
let room = (roomsList.body.rooms ?? []).find((r) => r.package_id === PKG);
if (!room) {
  const r = await call(`${X}/rooms/open`, dec(owner, { action: 'room.open', objectType: 'ROOM' }), { packageId: PKG, title: TITLE, reviewEveryDays: 7 }, owner.token);
  if (!r.ok) { bad(`room refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  room = { room_id: r.body.room.roomId };
  ok(`room opened ${room.room_id.slice(0, 8)}… — weekly review, next ${String(r.body.room.nextReviewAt).slice(0, 10)}`);
  for (const [pid, role, who] of [[approverId, 'approver', 'S. Okafor'], [dvorakId, 'observer', 'M. Dvořák'], [nakamuraId, 'observer', 'T. Nakamura']]) {
    const m = await call(`${X}/rooms/${room.room_id}/membership`, dec(owner, { action: 'room.membership', objectType: 'ROOM', objectId: room.room_id }), { principal: pid, role, op: 'add' }, owner.token);
    if (!m.ok) bad(`membership ${who} refused (${m.status}) ${m.body?.message ?? ''}`); else ok(`${who} added as ${role}`);
  }
} else ok(`room present ${room.room_id.slice(0, 8)}…`);
const ROOM = room.room_id;
if (briefingAgent) {
  const run = await call(`${X}/agents/decision/${briefingAgent}/run`, dec(owner, { action: 'agent.trigger', objectType: 'AGT', objectId: briefingAgent }), { task: 'briefing', roomId: ROOM }, owner.token);
  if (!run.ok) bad(`briefing agent run refused (${run.status}) ${run.body?.message ?? ''}`);
  else {
    const r = run.body.run;
    if (r.outcome === 'finished') {
      const b = await call(`${X}/briefings/${r.outputs.briefing_id}/get`, brf(approver, { action: 'briefing.read', objectType: 'BRF', objectId: r.outputs.briefing_id, sideEffect: 'none' }), {}, approver.token);
      const bb = b.body.briefing ?? {};
      const states = (bb.source_states ?? []).map((s) => `${s.source_key}: ${s.state}`).join(', ');
      ok(`the briefing agent composed ${String(r.outputs.briefing_id).slice(0, 8)}… (${r.outputs.items} item(s), ${(bb.windows ?? []).length} window(s), digest ${String(r.outputs.content_digest).slice(0, 12)}…) — sources: ${states}`);
      ok(`read by S. Okafor under her own membership; reads: ${r.spent?.reads} of the agent's budget`);
    } else bad(`briefing agent run ${r.outcome}: ${r.stopReason ?? ''}`);
  }
}

/* ── 8. what comes after — the outcome, in order ─────────────────────────── */
console.log('\n8. after the commitment — the separately identified synthetic observation, the simulated element, the reconciliation, the OUT');
const detail3 = await call(`${X}/decisions/${PKG}/get`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
const committed = (detail3.body.package?.versions ?? []).find((v) => v.version === committedVersion);
const chosenOption = committed?.options?.find((o) => o.key === committed?.choice?.option_key);
const chosenRunId = (chosenOption?.consequences ?? []).find((c) => c.kind === 'run')?.id ?? chosenRun.run_id;
const outcomesNow = await call(`${X}/decisions/${PKG}/outcomes/list`, dec(owner, { action: 'decision.read', objectType: 'DPK', objectId: PKG, sideEffect: 'none' }), {}, owner.token);
if ((outcomesNow.body.outcomes ?? []).length > 0) ok(`outcome already recorded (${outcomesNow.body.outcomes.length})`);
else {
  const sources = await call(`${X}/observation/sources/list`, as(dvorak, scope, { purposeId: 'observation', action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
  const nordwerk = (sources.body.sources ?? []).find((s) => s.source_key === 'nordwerk-internal');
  if (!nordwerk) { bad('the NORDWERK upload source is missing'); process.exit(1); }
  const csv = await readFile(join(ROOT, 'fixtures', 'phase6', 'outcomes-2024Q1.csv'));
  const up = await call(`${X}/observation/upload`, as(hoffmann, scope, { purposeId: 'observation', action: 'observation.run.trigger', objectType: 'RUN' }),
    { sourceId: nordwerk.source_id, contractVersion: Number(nordwerk.contract_version ?? 1), files: [{ filename: 'outcomes-2024Q1.csv', mediaType: 'text/csv', base64: csv.toString('base64'), documentTime: '2024-04-10T00:00:00Z' }] }, hoffmann.token);
  if (!up.ok) { bad(`outcomes upload refused (${up.status}) ${up.body?.message ?? ''}`); process.exit(1); }
  ok(`outcomes-2024Q1.csv uploaded (document time 2024-04-10, recorded now, synthetic): admitted ${up.body.run?.admitted ?? '?'} · no-op ${up.body.run?.noop ?? '?'}`);
  const evidence = await call(`${X}/observation/evidence/list`, as(dvorak, scope, { purposeId: 'observation', action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none' }), { sourceId: nordwerk.source_id, limit: 50 }, dvorak.token);
  let outEvd = null;
  for (const e of (evidence.body.evidence ?? [])) {
    const got = await call(`${X}/observation/evidence/${e.object_id}/download`, as(dvorak, scope, { purposeId: 'observation', action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: e.object_id }), {}, dvorak.token);
    if (!got.ok) continue;
    const head = Buffer.from(got.body.download?.base64 ?? got.body.base64 ?? '', 'base64').toString('utf8').slice(0, 120);
    if (/record_id,line_id,line_stop_days/.test(head)) { outEvd = { id: e.object_id, version: Number(e.object_version) }; break; }
  }
  if (!outEvd) { bad('the uploaded outcomes record was not found by its bytes'); process.exit(1); }
  const runDetail = await call(`${X}/twins/simulations/${chosenRunId}/get`, as(nakamura, scope, { purposeId: 'simulation', action: 'simulation.read', objectType: 'SIM', objectId: chosenRunId, sideEffect: 'none' }), {}, nakamura.token);
  const simulatedDays = Number(runDetail.body.run?.outputs?.totals?.line_stop_days);
  const tv = (await call(`${X}/twins/${twin.twin_id}/get`, tw({ action: 'twin.read', objectType: 'TWN', objectId: twin.twin_id, sideEffect: 'none' }), {}, nakamura.token)).body.twin?.versions ?? [];
  const baseV = tv.filter((v) => v.branch_id === 'actual' && v.state === 'admitted').sort((a, b) => a.version - b.version)[0]?.version;
  const KEY = 'outcome.line_stop_days:SYN-LINE-A1';
  const oS = await call(`${X}/twins/${twin.twin_id}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: twin.twin_id }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: baseV }, nakamura.token);
  if (!oS.ok) { bad(`simulated version refused (${oS.status}) ${oS.body?.message ?? ''}`); process.exit(1); }
  const vSim = oS.body.version.version;
  const gS = await call(`${X}/twins/${twin.twin_id}/versions/${vSim}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: twin.twin_id }), { elements: [{ key: KEY, kind: 'simulated', value: simulatedDays, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: chosenRunId, version: 1 }] }] }, nakamura.token);
  if (!gS.ok) bad(`simulated element refused (${gS.status}) ${gS.body?.message ?? ''}`);
  const aS = await call(`${X}/twins/${twin.twin_id}/versions/${vSim}/admit`, tw({ action: 'twin.version.admit', objectType: 'TWN', objectId: twin.twin_id }), { allowIncomplete: true }, nakamura.token);
  if (!aS.ok) bad(`admit ${vSim} refused (${aS.status}) ${aS.body?.message ?? ''}`); else ok(`twin version ${vSim}: the chosen run's exact output (${simulatedDays} line-stop days) grounded as a SIMULATED element citing run ${chosenRunId.slice(0, 8)}…`);
  const oO = await call(`${X}/twins/${twin.twin_id}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: twin.twin_id }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', carryFrom: vSim, except: [KEY] }, nakamura.token);
  if (!oO.ok) { bad(`observed version refused (${oO.status}) ${oO.body?.message ?? ''}`); process.exit(1); }
  const vObs = oO.body.version.version;
  const gO = await call(`${X}/twins/${twin.twin_id}/versions/${vObs}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: twin.twin_id }), { elements: [{ key: KEY, kind: 'observed', value: 3, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: outEvd.id, version: outEvd.version }], record: { locator: 'SYN-OUT-2024Q1-A1', field: 'line_stop_days' } }] }, nakamura.token);
  if (!gO.ok) bad(`observed element refused (${gO.status}) ${gO.body?.message ?? ''}`);
  const aO = await call(`${X}/twins/${twin.twin_id}/versions/${vObs}/admit`, tw({ action: 'twin.version.admit', objectType: 'TWN', objectId: twin.twin_id }), { allowIncomplete: true }, nakamura.token);
  if (!aO.ok) bad(`admit ${vObs} refused (${aO.status}) ${aO.body?.message ?? ''}`); else ok(`twin version ${vObs}: the plant's actual line-stop days (3) grounded as an OBSERVED element established from the upload's record SYN-OUT-2024Q1-A1`);
  const rc = await call(`${X}/twins/${twin.twin_id}/reconcile`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: twin.twin_id }), { key: KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the plant\'s actual line-stop days' }, nakamura.token);
  if (!rc.ok) bad(`reconciliation refused (${rc.status}) ${rc.body?.message ?? ''}`);
  else {
    const recId = rc.body.reconciliation?.reconciliation_id ?? rc.body.reconciliation?.reconciliationId ?? null;
    ok(`Phase 5 reconciles ${simulatedDays} (simulated) against 3 (observed): difference ${JSON.stringify(rc.body.reconciliation?.difference ?? {}).slice(0, 60)}`);
    const recon = recId ?? (await (async () => {
      const g = await call(`${X}/twins/${twin.twin_id}/get`, tw({ action: 'twin.read', objectType: 'TWN', objectId: twin.twin_id, sideEffect: 'none' }), {}, nakamura.token);
      return (g.body.twin?.reconciliations ?? []).filter((x) => x.key === KEY).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))[0]?.reconciliation_id ?? null;
    })());
    const out = await call(`${X}/decisions/${PKG}/outcomes`, dec(owner, { action: 'decision.outcome', objectType: 'OUT' }), { criterionKey: 'line_stop_days', twinId: twin.twin_id, twinVersion: vObs, elementKey: KEY, reconciliationId: recon, note: 'Three days of line stop while the rerouted shipment cleared the Cape.' }, owner.token);
    if (!out.ok) bad(`outcome refused (${out.status}) ${out.body?.message ?? ''}`);
    else ok(`the owner records the OUT ${out.body.outcome.outcomeId.slice(0, 8)}… — criterion line_stop_days: observed 3 days against target <= 0: ${out.body.outcome.met ? 'MET' : 'NOT MET'}; reconciled, nothing overwritten`);
  }
}
const mon = await call(`${X}/decisions/${PKG}/monitor`, dec(owner, { action: 'decision.monitor', objectType: 'DPK', objectId: PKG }), {}, owner.token);
if (mon.ok) ok(`conditions evaluated: ${mon.body.monitoring.new_breaches} new breach(es), review ${mon.body.monitoring.review_overdue ? 'OVERDUE' : 'on cadence'}, package ${mon.body.monitoring.state}`);

/* ── 9. replay ───────────────────────────────────────────────────────────── */
console.log('\n9. replay — anyone with read authority reconstructs what was known, believed, tested, decided and observed');
const asOf = new Date().toISOString();
const r1 = await call(`${X}/decisions/${PKG}/versions/${committedVersion}/replay`, dec(approver, { action: 'decision.replay', objectType: 'RPL' }), { asOf }, approver.token);
const r2 = await call(`${X}/decisions/${PKG}/versions/${committedVersion}/replay`, dec(dvorak, { action: 'decision.replay', objectType: 'RPL' }), { asOf }, dvorak.token);
if (!r1.ok || !r2.ok) bad(`replay refused (${r1.status}/${r2.status}) ${r1.body?.message ?? r2.body?.message ?? ''}`);
else {
  const a = r1.body.replay; const b = r2.body.replay;
  ok(`known: ${a.summary.known} evidence version(s) through ${a.cutoffs.observed_through} read at ${String(a.cutoffs.known_at).slice(0, 19)}; believed: ${a.summary.assumptions} assumption(s), ${a.summary.branches} branch state(s); tested: ${a.summary.runs} run(s), ${a.summary.reproductions} pre-decision verdict(s); decided: ${a.summary.dissent} dissent, ${a.summary.approvals} approval(s), commitment at ${a.layers.decided.commitment.op_class}`);
  const obs = Object.entries(a.layers.observed).filter(([, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.length}`).join(', ');
  ok(`observed (after the decision, at or before as_of): ${obs || 'nothing'}; excluded from the earlier layers: ${a.summary.excluded}; unavailable now: ${a.summary.unavailable}`);
  if (a.contentDigest === b.contentDigest && a.invocation.reader !== b.invocation.reader) ok(`S. Okafor's and M. Dvořák's replays carry the same content digest ${a.contentDigest.slice(0, 16)}… and different invocation records`);
  else bad(`replay digests differ or readers coincide (${a.contentDigest.slice(0, 8)} / ${b.contentDigest.slice(0, 8)})`);
}
if (reportingAgent) {
  const rep = await call(`${X}/agents/decision/${reportingAgent}/run`, dec(owner, { action: 'agent.trigger', objectType: 'AGT', objectId: reportingAgent }), { task: 'report', packageId: PKG }, owner.token);
  if (rep.ok && rep.body.run.outcome === 'finished') ok(`the reporting agent rendered the package with ${rep.body.run.outputs.report.options.length} option(s), every simulated one marked SYNTHETIC; agent-produced`);
  else bad(`reporting agent: ${rep.status} ${rep.body?.run?.outcome ?? rep.body?.message ?? ''}`);
}
console.log('\n10. what this act does not say: no model recommended an option; no agent approved anything; nothing learned from the outcome — that is Phase 7.');
console.log(`\n=== act VI complete — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
