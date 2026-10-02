#!/usr/bin/env node
/**
 * CP-6 batch B34 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): DURABLE WORKFLOW,
 * HUMAN GATES AND COMMITMENTS (migration 0090) — the human-task service and collaboration (F-P6-14), human gate completeness (F-P6-04), the
 * commitment tracker and the governed execution handoff (F-P6-05), the attention completion (F-P6-07) and the remainder of risk and
 * opportunity (F-P4-13) — exercised by the personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers, and
 * where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME. No clock is moved and no row planted: the act WAITS for the
 * attention agent's real scheduled ticks (the review deadline, the item's due instant and the acknowledgement window are set a few minutes
 * out — said on the output).
 *
 *   B34-0 THE STATE: 0090 applied; the register (50 / 0 / 0); the casting; T. Richter (domain_admin) and K. Lange (execution_authority)
 *         created through the governed principal route; every live subscription whose consumer identity changed in 0090 (the attention
 *         consumer's) REVOKED and registered anew, the backlog LEFT; the NEW kind `commitments` registered; M. Dvořák publishes the next
 *         attention policy version = the active one + the four B34 classes (opportunity.raised acknowledged within 2 minutes, escalated to the
 *         executive, notified in_app + EMAIL — the SYNTHETIC adapter to the local sink).
 *   B34-W F-P6-14: L. Brandt opens the collaboration workspace on the dual-sourcing (mitigation) case, adds M. Dvořák (the chief of staff)
 *         as reviewer, INVITES a customs expert from a partner firm (SYNTHETIC) for 14 days under an `internal` ceiling — B34-F1 (0091): they
 *         REQUESTS the invitation and the administrator PROVISIONS it through the identity authority — and requests the
 *         expert's review with a deadline a few minutes out, escalating to M. Dvořák; the deadline passes → the tick ESCALATES the task to
 *         M. Dvořák, who reviews it (the task completed). The expert's sign-in is the harness's (the invitation token never leaves the API
 *         process — by design), SAID.
 *   B34-G F-P6-04: J. Weber declares the assumption "Customs pre-clearance holds for the rerouted consignments"; C. Brenner drafts and
 *         proposes the case's version; S. Okafor APPROVES "only if customs pre-clearance holds" (a typed condition); L. Brandt PREVIEWS and
 *         commits → HELD (the condition does not hold); C. Brenner DEFERS with a next-review date; J. Weber VERIFIES the assumption (0090 §I,
 *         a person's governed act); C. Brenner RESUMES; L. Brandt previews again and COMMITS.
 *   B34-C F-P6-05: the commitment's root item seeded; L. Brandt accepts it and declares a purchase-request handoff item and a customs
 *         deliverable due a few minutes out; T. Richter declares the SYNTHETIC ERP target; L. Brandt drafts the purchase-request handoff;
 *         K. Lange (not the drafter, not the committer) ISSUES it → the production egress REFUSES the loopback target by design (SAID — the
 *         B14 precedent; the partial effect and compensation are the harness's, phase6-commitments-b34 E2); the tracker and the timeline read.
 *   B34-C (B34-F2, 0091) THE POSITIVE SCENE through the product: the refused handoff's residual reissued by a named compensation owner, carried
 *         by the SYNTHETIC LOOPBACK path (EYE_EXECUTION_SYNTHETIC_LOOPBACK=on) — the receipt bound, HALF effected (the ERP's partial mode), the
 *         residual reissued again and effected, every handoff reconciled; the refusal above stays the negative evidence.
 *   B34-A F-P6-07 (+ F-P4-13's events, F-P6-08's score changes): C. Brenner accepts the Opportunity Agent's estimate for the Morocco
 *         opportunity → ExposureChanged → an OPPORTUNITY item; A. Hoffmann computes the health score → HealthScoreChanged when a change is
 *         raised; the customs deliverable passes its due instant → the tick's sweep → CommitmentChanged → a COMMITMENT BREACH item for
 *         L. Brandt; the queue ranks them beside the corridor warning with their reasons; L. Brandt ACTS on the breach (propose an extension,
 *         human-gated) and the reviewer co-signs; the opportunity item, unacknowledged, ESCALATES and its notice reaches the EMAIL SINK
 *         (SYNTHETIC); M. Dvořák runs the queue evaluation — RANKING FAIRNESS across classes.
 *   B34-X F-P4-13: M. Dvořák publishes the next risk taxonomy version and S. Okafor ACTIVATES it (the publisher never activates).
 *   B34-9 THE STATE and the LIMITS said.
 *
 * Operator preparation (done before the act, SAID in its output): the SYNTHETIC ERP on loopback :3444 (its certificate under
 * .eye-local/execution-erp-demo), its bearer bound by reference EYE_DST_NORDWERK_ERP_DEMO in the local secret handoff (never printed); the
 * LOCAL SINKS on loopback (SMTP 2525, HTTP 3446) and the API started with EYE_ATTENTION_* naming them. Nothing here prints a credential.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
const DC = `${X}/decisions`; const CM = `${X}/commitments`; const EX = `${X}/executive`; const H = `${X}/executive/health`;
const SINK_HTTP = `http://127.0.0.1:${process.env.ACT_SINK_HTTP_PORT ?? '3446'}`;
const ERP_CERT = process.env.ACT_ERP_CERT ?? join(ROOT, '.eye-local', 'execution-erp-demo', 'cert.pem');
const ERP_ENDPOINT = process.env.ACT_ERP_ENDPOINT ?? 'https://127.0.0.1:3444';
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const DAY = 86_400_000; const MIN = 60_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 220)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const tStart = Date.now();
const elapsed = () => `${((Date.now() - tStart) / 60000).toFixed(1)} min`;
console.log(`THE B34 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};
async function waitFor(what, probe, done, ms) {
  const until = Date.now() + ms; let last = null;
  while (Date.now() < until) { last = await probe(); if (done(last)) return last; await sleep(5000); }
  note(`${what}: not within ${Math.round(ms / 1000)} s (the last read ${JSON.stringify(last).slice(0, 200)})`); return last;
}

/* ── B34-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB34-0 THE STATE — 0090, the register, the casting, the new personas, the subscriptions, the policy');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0090%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0090 is not applied'); process.exit(1); }
  const f1 = (await q(`select filename from public.schema_migrations where filename like '0091%'`))[0];
  if (f1) ok(`migration ${f1.filename} applied (B34-F1: the invitation's identity rows are the identity authority's)`); else { bad('0091 (B34-F1) is not applied'); process.exit(1); }
}
const CAST = { 'm.dvorak': ['executive'], 'n.eriksen': ['forecast_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_authority', 'decision_owner', 'opportunity_sponsor'],
  'a.hoffmann': ['domain_analyst'], 's.okafor': ['decision_approver', 'executive'], 'c.brenner': ['decision_owner', 'risk_owner', 'strategy_owner'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
for (const [loginName, displayName, roleCode] of [['t.richter', 'T. Richter — NORDWERK domain administrator', 'domain_admin'], ['k.lange', 'K. Lange — purchasing execution authority', 'execution_authority']]) {
  const r = await createPersona(admin, T, { displayName, loginName, password: PW, roleCode, domainId: D });
  if (r.session === null) { bad(`${displayName} could not be created or opened (${r.status})`); process.exit(1); }
  if (r.created) ok(`the administrator CREATED ${displayName.split(' — ')[0]} through the governed principal route — role ${roleCode}`); else note(`${displayName.split(' — ')[0]} is present — an earlier run`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const dvorak = await who('m.dvorak'); const weber = await who('j.weber'); const brandt = await who('l.brandt'); const hoffmann = await who('a.hoffmann');
const okafor = await who('s.okafor'); const brenner = await who('c.brenner'); const richter = await who('t.richter'); const lange = await who('k.lange');
const PEOPLE = [dvorak, weber, brandt, hoffmann, okafor, brenner, richter, lange];
const NAME = { [dvorak.principalId]: 'M. Dvořák', [weber.principalId]: 'J. Weber', [brandt.principalId]: 'L. Brandt', [hoffmann.principalId]: 'A. Hoffmann',
  [okafor.principalId]: 'S. Okafor', [brenner.principalId]: 'C. Brenner', [richter.principalId]: 'T. Richter', [lange.principalId]: 'K. Lange', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
{
  const r = await call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (r.ok) { const all = r.body.interfaces ?? []; const c = (s) => all.filter((i) => i.binding_state === s).length; (c('bound') === 50 && c('partial') === 0 ? ok : bad)(`the register: ${c('bound')} bound / ${c('partial')} partial / ${c('unbound')} unbound (B34 adds no interface)`); }
  else fail('the register', r);
}
// THE SUBSCRIPTIONS: the attention consumer's identity changed in 0090 (its three new event types) — revoked and registered anew; the new kind registered.
const registerSub = (kind, owner) => call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: kind, ownerPrincipalId: owner, backlog: 'leave' }, admin.token);
{
  const st = await call(`${G}/subscriptions/status`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  const consumers = st.ok ? (st.body.subscriptions?.consumers ?? st.body.consumers ?? []) : [];
  const live = await q(`select subscription_id::text, consumer_kind, code_digest, consumer_version, owner_principal_id::text, checkpoint_seq::text from graph.subscriptions where tenant_id = $1 and domain_id = $2 and status <> 'revoked'`, [T, D]);
  const changed = live.filter((s) => { const c = consumers.find((x) => x.kind === s.consumer_kind); return c !== undefined && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version); });
  if (!st.ok) fail('the subscription status', st);
  note(`${live.length} live subscriptions; ${changed.length === 0 ? 'every one carries this process\'s consumer identity (an earlier run re-registered them)' : `${changed.map((s) => s.consumer_kind).join(', ')} registered for a consumer whose method has since changed`}`);
  for (const s of changed) {
    const c = consumers.find((x) => x.kind === s.consumer_kind);
    const rv = await call(`${G}/subscriptions/${s.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: s.subscription_id, consequence: 'C2' }),
      { reason: `B34: the ${s.consumer_kind} consumer's method changed (${String(s.code_digest).slice(0, 12)}… → ${String(c.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
    if (!rv.ok) { fail(`revoke the outdated ${s.consumer_kind} subscription`, rv); continue; }
    const r = await registerSub(s.consumer_kind, s.owner_principal_id);
    if (!r.ok) fail(`register ${s.consumer_kind}`, r);
    else ok(`${s.consumer_kind}: subscription ${short(s.subscription_id)} (consumer ${String(s.code_digest).slice(0, 12)}…, cursor ${s.checkpoint_seq ?? 'none'}) REVOKED; registered anew as ${short(r.body.subscription.subscriptionId)} (consumer ${String(r.body.subscription.consumer.codeDigest).slice(0, 12)}…, event types ${r.body.subscription.eventTypes.join(' | ')}, owner ${nm(s.owner_principal_id)}, the backlog LEFT)`);
  }
  if (live.some((s) => s.consumer_kind === 'commitments')) note('the commitments subscription is live — an earlier run registered it');
  else {
    const r = await registerSub('commitments', brandt.principalId);
    if (!r.ok) fail('the administrator registers the commitments subscription', r);
    else ok(`the administrator REGISTERED the NEW kind commitments: subscription ${short(r.body.subscription.subscriptionId)} — role ${r.body.subscription.role}, event types ${r.body.subscription.eventTypes.join(' | ')}, owner L. Brandt, the backlog LEFT`);
  }
}
let POLICY = null;
{
  const active = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  if (active === null) { bad('no active attention policy'); }
  else if (active.rules?.classes?.['commitment.breach']) { POLICY = active; note(`attention policy version ${active.version} already names the B34 classes — an earlier run`); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    rules.classes['opportunity.raised'] = { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['opportunity_sponsor', 'strategy_owner'], ack_within_minutes: 240 };
    rules.classes['health.change'] = { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 240 };
    rules.classes['commitment.breach'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 2,
      escalate_to_roles: ['executive'], max_escalations: 1, notify: { channels: ['in_app', 'email'], max_attempts: 3 } };
    rules.classes['commitment.due'] = { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 240 };
    const r = await call(`${E}/policy/publish`, env_(dvorak, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP', consequence: 'C2' }),
      { rules, reason: 'B34: opportunities, score changes and commitment breaches enter the queue; an unacknowledged commitment breach escalates to the executive with an e-mail notice (the SYNTHETIC adapter to the local sink).' }, dvorak.token);
    if (!r.ok) fail('M. Dvořák publishes the next attention policy', r);
    else { POLICY = r.body.policy; ok(`M. Dvořák PUBLISHED attention policy VERSION ${r.body.policy.version} (changed classes ${(r.body.policy.changed_classes ?? []).join(', ')}): commitment.breach acknowledged within 2 min, escalated to the executive, notified in_app + email (SYNTHETIC — the local sink); opportunity.raised; health.change; commitment.due`); }
  }
}

/* ── lookups ─────────────────────────────────────────────────────────────────────────── */
const OBJ_REG = (await q(`select strategy_object_id::text id, owner_principal_id::text owner from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const CORRIDOR = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and title = 'Corridor closure — Regensburg line' limit 1`, [T, D]))[0]?.id ?? null;
const MOROCCO = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSK' and title = 'Alternative supplier in Morocco' limit 1`, [T, D]))[0]?.id ?? null;
const MITIG = CORRIDOR === null ? null : (await q(`select r.package_id::text pkg, r.decision_object_id::text dec, p.title, p.state, p.current_version, p.owner_principal_id::text owner from prediction.exposure_responses r
                                                     join decision.packages_current p on p.package_id = r.package_id where r.exposure_id = $1 and r.response_kind = 'mitigate' order by r.opened_at limit 1`, [CORRIDOR]))[0] ?? null;
const C_TRANSIT = (await q(`select distinct on (l.claim_object_id) l.claim_object_id::text id from intelligence.claim_lineage l join objects.canonical_objects o on o.object_id = l.claim_object_id and o.lifecycle_state = 'active'
                              where l.tenant_id = $1 and l.domain_id = $2 and o.payload ->> 'subject' = 'MV Hanse Meridian' and o.payload ->> 'predicate' = 'transits' and o.payload ->> 'object_value' = 'Bab el-Mandeb'
                              order by l.claim_object_id, o.object_version desc limit 1`, [T, D]))[0]?.id ?? null;
const PAIR = (await q(`select c.run_id::text control, i.run_id::text intervention, c.twin_id::text twin from simulation.runs_current c join simulation.runs_current i on i.control_run_id = c.run_id and i.run_kind = 'intervention' and i.state = 'completed' and i.validity = 'valid'
                        where c.tenant_id = $1 and c.domain_id = $2 and c.run_kind = 'control' and c.state = 'completed' and c.validity = 'valid'
                          and not exists (select 1 from simulation.runs_current x, jsonb_array_elements(coalesce(x.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                                           join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid where x.run_id in (c.run_id, i.run_id) and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn')
                        order by c.opened_at desc, i.opened_at limit 1`, [T, D]))[0] ?? null;
if ([OBJ_REG, CORRIDOR, MOROCCO, MITIG, C_TRANSIT, PAIR].some((x) => x === null)) { bad(`an input is missing: ${JSON.stringify({ OBJ_REG: !!OBJ_REG, CORRIDOR: !!CORRIDOR, MOROCCO: !!MOROCCO, MITIG: !!MITIG, C_TRANSIT: !!C_TRANSIT, PAIR: !!PAIR })}`); process.exit(1); }
ok(`the inputs: the Regensburg objective ${short(OBJ_REG.id)} (owner ${nm(OBJ_REG.owner)}); the corridor exposure ${short(CORRIDOR)} and its MITIGATION case ${short(MITIG.pkg)} "${MITIG.title}" (${MITIG.state}, owner ${nm(MITIG.owner)}); the Morocco opportunity ${short(MOROCCO)}; the runs control ${short(PAIR.control)} / reroute ${short(PAIR.intervention)} on the twin ${short(PAIR.twin)}`);

/* ── B34-W ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-W F-P6-14 — a customs expert from a partner firm invited for 14 days; their review escalates to the chief of staff when the deadline passes');
const CP = 'collaboration.dual-sourcing-review';
const col = (s, path, action, objectType, payload, objectId = null) => call(`${EX}/collab/${path}`, env_(s, CP)({ action, objectType, objectId, consequence: 'C2' }), payload, s.token);
let WS = (await q(`select workspace_id::text from executive.collab_workspaces where tenant_id = $1 and domain_id = $2 and subject ->> 'id' = $3 limit 1`, [T, D, MITIG.pkg]))[0]?.workspace_id ?? null;
let REVIEW_TASK = null;
if (WS !== null) note(`the workspace ${short(WS)} on the case stands — an earlier run`);
else {
  const r = await col(brandt, 'workspaces/open', 'executive.collab.workspace.open', 'CWS', { title: 'Dual-sourcing review — customs and bearings (SYNTHETIC)', subject: { kind: 'decision_package', id: MITIG.pkg }, purpose: CP, classification_ceiling: 'internal' });
  if (!r.ok) fail('L. Brandt opens the workspace', r);
  else { WS = r.body.workspace.workspace_id; ok(`L. Brandt OPENED the collaboration workspace ${short(WS)} on the mitigation case — purpose ${CP}, ceiling internal`); }
}
if (WS !== null) {
  const pr = await col(brandt, `workspaces/${WS}/participants`, 'executive.collab.participant.set', 'CWS', { op: 'add', principal: dvorak.principalId, role: 'reviewer' }, WS);
  if (pr.ok) ok('L. Brandt ADDED M. Dvořák (the chief of staff) as a reviewer'); else note(`M. Dvořák as reviewer: ${refusalLine(pr)}`);
  const art = await col(brandt, `workspaces/${WS}/artifacts`, 'executive.collab.discuss', 'CWS', { key: 'customs-brief', title: 'Customs brief for the rerouted consignments (SYNTHETIC)', kind: 'note', classification: 'internal',
    content: 'The rerouted bearing and magnet consignments enter through Hamburg; pre-clearance is needed before arrival. SYNTHETIC.' }, WS);
  if (art.ok) ok(`L. Brandt SHARED the artifact "customs-brief" (internal) in the workspace`); else note(`the artifact: ${refusalLine(art)}`);
  // B34-F1 (0091): L. Brandt REQUESTS the invitation; they cannot provision it (403); the administrator PROVISIONS it through the identity authority.
  // A grant provisioned under 0091 on this workspace stands on a rerun; a grant INVITED UNDER 0090 (its principal written by the removed
  // bypass port) is REVOKED below through the corrected path — the identity authority revokes its credentials and sessions, bumps its epoch.
  const idFacts = async (pid) => (await q(`select (select count(*)::int from identity.credentials where principal_id = $1 and status = 'active') creds,
                                                  (select count(*)::int from identity.sessions where principal_id = $1 and revoked_at is null) sessions,
                                                  (select revocation_epoch from identity.principals where id = $1) epoch`, [pid]))[0];
  const provisioned = (await q(`select grant_id::text, principal_id::text, state from executive.collab_grants where workspace_id = $1 and provisioned_at is not null order by provisioned_at limit 1`, [WS]))[0] ?? null;
  const legacy = await q(`select grant_id::text, principal_id::text, state from executive.collab_grants where workspace_id = $1 and provisioned_at is null and principal_id is not null and state in ('invited', 'accepted') order by invited_at`, [WS]);
  const req = provisioned !== null ? { ok: false, skip: true } : await col(brandt, `workspaces/${WS}/invitations`, 'executive.collab.invite', 'CGR', { display_name: 'R. Haddad — customs broker, partner firm (SYNTHETIC)', contact_label: 'customs-broker@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 });
  let inv = req.skip ? { ok: true, body: { grant: { ...provisioned, expires_at: '' } }, standing: true } : req;
  if (req.skip) note(`the invitation provisioned under 0091 stands (grant ${short(provisioned.grant_id)} ${provisioned.state}) — an earlier run`);
  else if (req.ok) {
    ok(`L. Brandt REQUESTED the invitation: grant ${short(req.body.grant.grant_id)} ${req.body.grant.state} — no principal yet; an identity administrator provisions it`);
    const gid = req.body.grant.grant_id;
    expectRefused('L. Brandt (the requester, not an identity administrator) provisioning the invitation', await col(brandt, `grants/${gid}/provision`, 'executive.collab.provision', 'CGR', {}, gid), 403);
    inv = await col(admin, `grants/${gid}/provision`, 'executive.collab.provision', 'CGR', {}, gid);
  }
  let EXT = null;
  if (!inv.ok) fail('the invitation (request → provision)', inv);
  else if (inv.standing) EXT = provisioned.principal_id;
  else { const g = inv.body.grant; EXT = g.principal_id; ok(`the administrator PROVISIONED the customs expert (SYNTHETIC partner firm) through the identity authority: grant ${short(g.grant_id)} ${g.state}, expires ${String(g.expires_at).slice(0, 10)} (14 days), ceiling internal, principal ${short(g.principal_id)} marked EXTERNAL, the invitation mailed ${g.mail?.channel ?? 'demo-mailbox'} (synthetic: ${g.mail?.synthetic})`); }
  for (const g of legacy) {
    const before = await idFacts(g.principal_id);
    const rv = await col(brandt, `grants/${g.grant_id}/revoke`, 'executive.collab.grant.revoke', 'CGR', { reason: 'superseded: the invitation 0090 wrote around the identity authority is withdrawn; the provisioned one replaces it' }, g.grant_id);
    if (!rv.ok) { fail(`L. Brandt revokes the 0090-era grant ${short(g.grant_id)}`, rv); continue; }
    const after = await idFacts(g.principal_id);
    (after.creds === 0 && after.sessions === 0 && Number(after.epoch) > Number(before.epoch) ? ok : bad)(`L. Brandt REVOKED the grant ${short(g.grant_id)} INVITED UNDER 0090 (its principal written by the removed bypass port): ${rv.body.grant?.state ?? '—'}; the IDENTITY AUTHORITY revoked what it held — active credentials ${before.creds} → ${after.creds}, live sessions ${before.sessions} → ${after.sessions}, epoch ${before.epoch} → ${after.epoch}`);
  }
  if (EXT !== null) {
    const ext = (await q(`select decision.is_active_human($1::uuid, $2::uuid) member, executive.principal_affiliation($1::uuid) aff`, [EXT, T]))[0];
    (ext.member === false && ext.aff === 'external' ? ok : bad)(`the expert is EXTERNAL (${ext.aff}) and is never an active member (approver, committer, room member, escalation target): is_active_human = ${ext.member}`);
    const rr = await col(brandt, `workspaces/${WS}/review-requests`, 'executive.collab.review.request', 'HTK', { reviewer: EXT, title: 'Review the customs brief for the rerouted consignments', deadline_at: at(100_000),
      escalation: { principal: dvorak.principalId, max_escalations: 1, extend_minutes: 1440 }, request_key: 'b34-' + 'customs-review' });
    if (!rr.ok) fail('L. Brandt requests the expert\'s review', rr);
    else { REVIEW_TASK = rr.body.task.task_id; ok(`L. Brandt REQUESTED the expert's review: task ${short(REVIEW_TASK)} ${rr.body.task.state}${rr.body.task.repeated ? ' (repeated)' : ''}, deadline in 100 s (SET SHORT FOR THE DEMONSTRATION — said), escalating to M. Dvořák`); }
  }
}

/* ── B34-G ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-G F-P6-04 — "only if customs pre-clearance holds": the commitment HELD, the owner DEFERS, the assumption VERIFIED, resumed, committed');
const ASU_TITLE = 'Customs pre-clearance holds for the rerouted consignments';
let ASU = (await q(`select strategy_object_id::text id, verification_state from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and title = $3 and status = 'active' limit 1`, [T, D, ASU_TITLE]))[0] ?? null;
if (ASU === null) {
  const r = await call(`${G}/strategy/declare`, env_(weber, 'graph')({ action: 'graph.strategy.declare', objectType: 'ASU' }), { objectType: 'ASU', title: ASU_TITLE,
    statement: 'the customs broker pre-clears every rerouted consignment before it arrives in Hamburg', restsOn: [{ kind: 'claim', id: C_TRANSIT, rationale: 'the consignments are rerouted from the Bab el-Mandeb transit the shipment record gives' }] }, weber.token);
  if (!r.ok) fail('J. Weber declares the assumption', r);
  else { ASU = { id: r.body.strategy.objectId, verification_state: 'unverified' }; ok(`J. Weber DECLARED the assumption ${short(ASU.id)} "${ASU_TITLE}" — unverified`); }
} else note(`the assumption ${short(ASU.id)} stands (${ASU.verification_state}) — an earlier run`);
const dc = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${DC}/${path}`, env_(s, 'decision')({ action, objectType, objectId, ...extra }), payload, s.token);
let COMMITMENT = (await q(`select commitment_id::text from decision.commitments where package_id = $1 order by committed_at desc limit 1`, [MITIG.pkg]))[0]?.commitment_id ?? null;
if (COMMITMENT !== null) note(`the mitigation case is committed (${short(COMMITMENT)}) — an earlier run`);
else if (ASU !== null) {
  const pkg = MITIG.pkg;
  let v = (await q(`select current_version from decision.packages_current where package_id = $1`, [pkg]))[0].current_version;
  if (v === null) { const o = await dc(brenner, `${pkg}/versions/open`, 'decision.package.version', 'DPK', { knownAt: new Date().toISOString(), observedThrough: null }, pkg); if (!o.ok) fail('C. Brenner opens a version', o); else v = o.body.version.version; }
  const vs = (await q(`select state, version_digest from decision.package_versions where package_id = $1 and version = $2`, [pkg, v]))[0];
  let digest = vs?.version_digest ?? null;
  if (vs?.state === 'draft') {
    const steps = [
      await dc(brenner, `${pkg}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'status-quo', title: 'Hold the booked routing', kind: 'status_quo', consequences: [{ kind: 'run', id: PAIR.control, version: 1 }], risks: [], opportunities: [] }, pkg),
      await dc(brenner, `${pkg}/versions/${v}/options`, 'decision.package.option', 'DPK', { key: 'dual-source', title: 'Dual-source the bearings and reroute', kind: 'intervention', consequences: [{ kind: 'run', id: PAIR.intervention, version: 1 }], risks: ['customs pre-clearance is needed for the rerouted consignments'], opportunities: [] }, pkg),
      await dc(brenner, `${pkg}/versions/${v}/terms`, 'decision.package.terms', 'DPK', { objectives: [OBJ_REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
        monitoringConditions: [{ kind: 'review', every_days: 7, owner: brenner.principalId }], reversibility: 'the second source is reversible until the first order is placed', informationValue: 'the customs answer decides the timing, not the option' }, pkg),
      await dc(brenner, `${pkg}/versions/${v}/choice`, 'decision.package.choice', 'DPK', { option_key: 'dual-source', rationale: 'The corridor exposure is outside appetite; a second bearing source removes the single point of failure.', decision_deadline: '2027-01-15',
        accepted_trade_offs: ['the qualification cost of a second source'], action_owner: brandt.principalId,
        outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: PAIR.twin, period: { from: '2024-01-11', to: '2024-04-10' } }] }, pkg),
    ];
    const b1 = steps.find((x) => !x.ok);
    if (b1) fail('C. Brenner drafts the version', b1);
    else {
      const pr = await dc(brenner, `${pkg}/versions/${v}/propose`, 'decision.package.propose', 'DPK', {}, pkg);
      if (!pr.ok) fail('C. Brenner proposes', pr); else { digest = pr.body.proposal.versionDigest; ok(`C. Brenner DRAFTED and PROPOSED version ${v} of the mitigation case (status-quo vs dual-source; action owner L. Brandt; approver S. Okafor) — digest ${digest.slice(0, 12)}…`); }
    }
  }
  if (digest !== null) {
    const ap = await dc(okafor, `${pkg}/versions/${v}/approve`, 'decision.approve', 'APR', { decision: 'approve', versionDigest: digest, rationale: 'Dual-sourcing removes the single point of failure — on the stated condition.',
      conditions: [{ kind: 'assumption_holds', ref: ASU.id, expected: 'verified', label: 'only if customs pre-clearance holds', stages: ['commit', 'monitor'] }] });
    if (!ap.ok) fail('S. Okafor approves with the condition', ap); else ok(`S. Okafor APPROVED version ${v} "only if customs pre-clearance holds" (assumption_holds on ${short(ASU.id)}, at commitment and in monitoring)`);
    const preview = async () => { const r = await dc(brandt, `${pkg}/versions/${v}/preview`, 'decision.commit.preview', 'DPK', { versionDigest: digest }, pkg); if (!r.ok) fail('L. Brandt previews', r); return r.ok ? r.body.preview : null; };
    const commit = (pd) => dc(brandt, `${pkg}/versions/${v}/commit`, 'decision.commit', 'CMT', { versionDigest: digest, previewDigest: pd }, null, { consequence: 'C3' });
    const p1 = await preview();
    if (p1) ok(`L. Brandt PREVIEWED the commitment: would commit ${p1.preview?.would_commit}; blockers ${JSON.stringify(p1.preview?.blockers ?? []).slice(0, 160)}`);
    const c1 = p1 ? await commit(p1.preview_digest) : null;
    if (c1?.ok && c1.body.commitment === null && c1.body.held) ok(`L. Brandt's COMMITMENT HELD — recorded (commit.held), nothing committed: ${c1.body.held.failed.map((f) => `${f.kind} ${short(f.ref)} holds=${f.holds}`).join(', ')}`);
    else if (c1) bad(`the commitment was expected HELD: ${c1.ok ? JSON.stringify(c1.body).slice(0, 200) : refusalLine(c1)}`);
    const df = await dc(brenner, `${pkg}/versions/${v}/gate/defer`, 'decision.gate.defer', 'DPK', { rationale: 'Deferred until the broker confirms pre-clearance for the rerouted consignments.', nextReviewAt: at(7 * DAY) }, pkg);
    if (!df.ok) fail('C. Brenner defers', df); else ok(`C. Brenner DEFERRED version ${v} with a next review on ${at(7 * DAY).slice(0, 10)} → ${df.body.gate?.to_state ?? df.body.action?.to_state ?? JSON.stringify(df.body).slice(0, 80)}; a gate.review task opened`);
    const vr = await call(`${G}/strategy/${ASU.id}/assumption/verify`, env_(weber, 'graph')({ action: 'graph.assumption.verify', objectType: 'ASU', objectId: ASU.id, consequence: 'C2' }), { state: 'verified', reason: 'the broker confirmed pre-clearance for the rerouted consignments (SYNTHETIC)' }, weber.token);
    if (!vr.ok) fail('J. Weber verifies the assumption', vr); else ok(`J. Weber VERIFIED the assumption (0090 §I — a person's governed act, human-gated, with its reason)`);
    const rs = await dc(brenner, `${pkg}/versions/${v}/gate/resume`, 'decision.gate.resume', 'DPK', { rationale: 'The broker confirmed pre-clearance; the gate resumes.' }, pkg);
    if (!rs.ok) fail('C. Brenner resumes', rs); else ok(`C. Brenner RESUMED the gate → ${rs.body.gate?.to_state ?? rs.body.action?.to_state ?? 'resumed'}`);
    const p2 = await preview();
    const c2 = p2 ? await commit(p2.preview_digest) : null;
    if (c2?.ok && c2.body.commitment) { COMMITMENT = c2.body.commitment.commitmentId; ok(`L. Brandt COMMITTED version ${v} (C3, the preview ${p2.preview_digest.slice(0, 12)}… carried): commitment ${short(COMMITMENT)} — the condition now holds`); }
    else if (c2) fail('L. Brandt commits', c2);
  }
}

/* ── B34-C ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-C F-P6-05 — the tracker, the purchase-request handoff to the SYNTHETIC ERP, the timeline');
const cm = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${CM}/${path}`, env_(s, 'decision')({ action, objectType, objectId, ...extra }), payload, s.token);
let DUE_ITEM = null;
if (COMMITMENT !== null) {
  const root = (await q(`select item_id::text, owner_principal_id::text owner, reviewer_principal_id::text reviewer, state from decision.commitment_items where commitment_id = $1 and parent_item_id is null`, [COMMITMENT]))[0];
  ok(`the tracker SEEDED the root item ${short(root.item_id)} from the commitment: owner ${nm(root.owner)} (the action owner), reviewer ${nm(root.reviewer)} (the objective's owner), ${root.state}`);
  if (root.state === 'open') { const a = await cm(brandt, `items/${root.item_id}/accept`, 'decision.commitment.item.accept', 'CMI', { note: 'accepted: dual-sourcing is mine to execute' }, root.item_id); if (a.ok) ok('L. Brandt ACCEPTED the commitment'); else fail('L. Brandt accepts the root', a); }
  const RSC = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'RSC' and title = 'Bearings procurement budget' limit 1`, [T, D]))[0]?.id ?? null;
  const items = await q(`select item_id::text, title, state from decision.commitment_items where commitment_id = $1 and parent_item_id is not null`, [COMMITMENT]);
  let HANDOFF_ITEM = items.find((x) => x.title.startsWith('Purchase request'))?.item_id ?? null;
  DUE_ITEM = items.find((x) => x.title.startsWith('Customs pre-clearance'))?.item_id ?? null;
  if (HANDOFF_ITEM === null) {
    const r = await cm(brandt, `${COMMITMENT}/items`, 'decision.commitment.item.declare', 'CMT', { kind: 'handoff', title: 'Purchase request: second bearing source (SYNTHETIC)', owner: brandt.principalId, dueAt: at(14 * DAY), ...(RSC ? { resourceIds: [RSC] } : {}) }, COMMITMENT);
    if (!r.ok) fail('L. Brandt declares the handoff item', r); else { HANDOFF_ITEM = r.body.item.item_id; ok(`L. Brandt DECLARED the handoff item ${short(HANDOFF_ITEM)}${RSC ? ` resting on the bearings budget ${short(RSC)} (mirrored into the dependencies)` : ''}`); }
    if (HANDOFF_ITEM) await cm(brandt, `items/${HANDOFF_ITEM}/accept`, 'decision.commitment.item.accept', 'CMI', { note: 'accepted: the purchase request is mine' }, HANDOFF_ITEM);
  }
  if (DUE_ITEM === null) {
    const r = await cm(brandt, `${COMMITMENT}/items`, 'decision.commitment.item.declare', 'CMT', { kind: 'deliverable', title: 'Customs pre-clearance filed with the broker (SYNTHETIC)', owner: brandt.principalId, dueAt: at(150_000) }, COMMITMENT);
    if (!r.ok) fail('L. Brandt declares the customs deliverable', r); else { DUE_ITEM = r.body.item.item_id; ok(`L. Brandt DECLARED the customs deliverable ${short(DUE_ITEM)} due in 150 s (SET SHORT FOR THE DEMONSTRATION — said)`); }
    if (DUE_ITEM) await cm(brandt, `items/${DUE_ITEM}/accept`, 'decision.commitment.item.accept', 'CMI', { note: 'accepted: the filing is mine' }, DUE_ITEM);
  }
  // THE TARGET (T. Richter) and THE HANDOFF (L. Brandt drafts, K. Lange issues)
  const TARGET_KEY = 'nordwerk-purchasing-demo';
  const tgt = (await q(`select target_id::text, state from decision.execution_targets where tenant_id = $1 and domain_id = $2 and target_key = $3`, [T, D, TARGET_KEY]))[0] ?? null;
  if (tgt) note(`the execution target ${TARGET_KEY} stands (${tgt.state}) — an earlier run`);
  else if (!existsSync(ERP_CERT)) bad(`the SYNTHETIC ERP's certificate is absent at ${ERP_CERT} — the operator starts the ERP first`);
  else {
    const r = await cm(richter, 'targets', 'decision.execution.target.declare', 'EXT', { targetKey: TARGET_KEY, label: 'NORDWERK purchasing — the SYNTHETIC ERP', endpoint: ERP_ENDPOINT, trustAnchorPem: readFileSync(ERP_CERT, 'utf8'), credentialRef: 'EYE_DST_NORDWERK_ERP_DEMO', synthetic: true });
    if (!r.ok) fail('T. Richter declares the execution target', r); else ok(`T. Richter DECLARED the execution target ${TARGET_KEY} (${r.body.target.state}; SYNTHETIC; ${ERP_ENDPOINT}; the ERP's certificate its trust anchor; the bearer bound BY REFERENCE EYE_DST_NORDWERK_ERP_DEMO)`);
  }
  if (HANDOFF_ITEM) {
    const had = (await q(`select handoff_id::text, state from decision.execution_handoffs where item_id = $1 order by drafted_at limit 1`, [HANDOFF_ITEM]))[0] ?? null;
    let HO = had;
    if (had) note(`the handoff ${short(had.handoff_id)} stands (${had.state}) — an earlier run`);
    else {
      const d = await cm(brandt, `items/${HANDOFF_ITEM}/handoffs`, 'decision.execution.draft', 'EXH', { targetKey: TARGET_KEY, lines: [{ line_key: 'brg-6205', description: 'SYN-PART-BRG bearing sets, second source', quantity: 400, unit: 'pcs' }, { line_key: 'mag-n42', description: 'SYN-PART-MAG magnet sets, second source', quantity: 120, unit: 'pcs' }] });
      if (!d.ok) fail('L. Brandt drafts the purchase-request handoff', d);
      else {
        HO = d.body.handoff; ok(`L. Brandt DRAFTED the purchase-request handoff ${short(HO.handoff_id)} (two lines; payload digest ${String(HO.payload_digest).slice(0, 12)}…)`);
        const selfI = await cm(brandt, `handoffs/${HO.handoff_id}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest: HO.payload_digest }, HO.handoff_id, { consequence: 'C3' });
        expectRefused('L. Brandt issuing their own handoff (no execution authority; the drafter and the committer)', selfI, 403);
        const is = await cm(lange, `handoffs/${HO.handoff_id}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest: HO.payload_digest }, HO.handoff_id, { consequence: 'C3' });
        if (!is.ok) fail('K. Lange issues the handoff', is);
        else { const h = is.body.handoff; ok(`K. Lange ISSUED the handoff (C3, human-gated; not the drafter, not the committer): ${h.state}; attempt ${h.attempt?.attempt} → ${h.attempt?.outcome ?? '—'} ${h.attempt?.failure_class ?? h.egress?.failure_class ?? ''} — carried by the ${h.transport ?? 'production'} path (with the synthetic loopback switch off the PRODUCTION egress refuses a loopback target by design — the refusal phase6-execution-b34f R1 keeps)`); }
      }
    }
  }
  // B34-F2 (0091) — THE POSITIVE SCENE through the product's own SYNTHETIC LOOPBACK PATH (the API started with
  // EYE_EXECUTION_SYNTHETIC_LOOPBACK=on; the target recorded synthetic on a loopback literal with its anchor declared). The first handoff's
  // refusal above stays the NEGATIVE evidence (the production vetting). Its residual — every line — is reissued by a named compensation
  // owner; the reissue is carried to the SYNTHETIC ERP and HALF effected (the ERP's partial mode, set by the operator's control call);
  // the remaining half is reissued again and effected; the handoffs are reconciled. The receipt, the partial effect, the residual and the
  // compensation are the ledgers' — the act states what they record.
  if (HANDOFF_ITEM && (await q(`select 1 from public.schema_migrations where filename like '0091%'`)).length === 0) bad('0091 is not applied — the positive ERP scene needs the synthetic loopback path');
  else if (HANDOFF_ITEM) {
    const target = (await q(`select target_key, endpoint, trust_anchor_pem, credential_ref, synthetic, state from decision.execution_targets where tenant_id = $1 and domain_id = $2 and target_key = $3`, [T, D, TARGET_KEY]))[0];
    const bearer = env[target.credential_ref] ?? process.env[target.credential_ref] ?? '';
    if (REHEARSAL && target && new URL(target.endpoint).port === '3444') { bad('a REHEARSAL copy\'s target names the demonstration\'s ERP (:3444) — refused; the rig repoints it at the rehearsal ERP'); process.exit(3); }
    const erp = (method, path, body) => new Promise((res, rej) => {
      const u = new URL(target.endpoint); const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
      const rq = httpsRequest({ host: u.hostname, port: Number(u.port), path, method, ca: target.trust_anchor_pem, rejectUnauthorized: true,
        headers: { authorization: `Bearer ${bearer}`, ...(payload === null ? {} : { 'content-type': 'application/json', 'content-length': String(payload.byteLength) }) } }, (r) => {
        const chunks = []; r.on('data', (x) => chunks.push(x));
        r.on('end', () => { try { res({ status: r.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (e) { rej(e); } });
      });
      rq.on('error', rej); if (payload !== null) rq.write(payload); rq.end();
    });
    const attemptsOf = (id) => q(`select attempt, outcome, http_status, transport, receipt ->> 'handoff_id' r_handoff, receipt ->> 'attempt' r_attempt, receipt ->> 'payload_digest' r_digest,
                                         receipt ->> 'status' r_status, egress ->> 'pinned_address' pinned, egress ->> 'tls_verified' tls from decision.execution_attempts where handoff_id = $1 order by attempt`, [id]);
    const effectsOf = (id) => q(`select line_key, requested_quantity::float8 req, effected_quantity::float8 eff, status from decision.execution_effects where handoff_id = $1 order by line_key`, [id]);
    const handoffs = await q(`select handoff_id::text, role, compensation_id::text, state, payload_digest, lines from decision.execution_handoffs where item_id = $1 order by drafted_at`, [HANDOFF_ITEM]);
    const synthetic = await q(`select count(*)::int n from decision.execution_attempts a join decision.execution_handoffs h using (handoff_id) where h.item_id = $1 and a.transport = 'synthetic-loopback'`, [HANDOFF_ITEM]);
    if (synthetic[0].n > 0) note(`the positive scene stands from an earlier run (${handoffs.map((h) => `${short(h.handoff_id)} ${h.role} ${h.state}`).join('; ')})`);
    else if (!target || target.synthetic !== true || target.state !== 'active') bad(`the target ${TARGET_KEY} is not an active synthetic target (${JSON.stringify(target ?? null).slice(0, 120)})`);
    else if (bearer === '') bad(`the ERP's bearer is not bound under ${target.credential_ref} in this environment — the operator's control call needs it`);
    else {
      const first = handoffs.find((h) => h.role === 'primary');
      // the reissue of a residual: the item's owner (L. Brandt) names the owner; the owner drafts; K. Lange issues; the ERP answers
      const reissue = async (from, label, mode) => {
        const c = await cm(brandt, `handoffs/${from.handoff_id}/compensations`, 'decision.execution.compensation.assign', 'EXH', { kind: 'reissue_residual', owner: brandt.principalId, dueAt: at(3 * DAY), note: `reissue the ${label} residual to the second source through the synthetic ERP` }, from.handoff_id);
        if (!c.ok) { fail(`L. Brandt assigns the ${label} residual`, c); return null; }
        const comp = c.body.compensation;
        ok(`L. Brandt ASSIGNED the ${label} residual to a named owner (${nm(comp.owner_principal_id)}; reissue_residual; ${comp.state}): ${(comp.residual ?? []).map((x) => `${x.line_key} ${x.residual}`).join(', ')}`);
        const m = await erp('POST', '/_control', { mode });
        if (m.status !== 200) { bad(`the operator's control call to the SYNTHETIC ERP (mode ${mode}): HTTP ${m.status}`); return null; }
        note(`the operator set the SYNTHETIC ERP's answer to "${mode}" (its control route; SAID — the ERP decides what it effects)`);
        const lines = (comp.residual ?? []).map((x) => { const l = (first.lines ?? []).find((y) => y.line_key === x.line_key) ?? {}; return { line_key: x.line_key, description: l.description ?? `${x.line_key} (SYNTHETIC)`, quantity: Number(x.residual), unit: l.unit ?? 'pcs' }; });
        const d = await cm(brandt, `items/${HANDOFF_ITEM}/handoffs`, 'decision.execution.draft', 'EXH', { targetKey: TARGET_KEY, compensationId: comp.compensation_id, lines });
        if (!d.ok) { fail(`the compensation's owner drafts the ${label} reissue`, d); return null; }
        const ho = d.body.handoff;
        ok(`${nm(comp.owner_principal_id)} (the compensation's owner) DRAFTED the compensating handoff ${short(ho.handoff_id)}: ${lines.map((l) => `${l.line_key} ${l.quantity} ${l.unit}`).join(', ')}`);
        const before = (await erp('GET', '/_received')).body.received?.length ?? 0;
        const is = await cm(lange, `handoffs/${ho.handoff_id}/issue`, 'decision.execution.issue', 'EXH', { payloadDigest: ho.payload_digest }, ho.handoff_id, { consequence: 'C3' });
        if (!is.ok) { fail(`K. Lange issues the ${label} reissue`, is); return null; }
        const h = is.body.handoff;
        const a = (await attemptsOf(ho.handoff_id))[0];
        const got = ((await erp('GET', '/_received')).body.received ?? []).slice(before);
        const bound = a && a.r_handoff === ho.handoff_id && a.r_attempt === '1' && a.r_digest === ho.payload_digest;
        if (h.transport === 'synthetic-loopback' && a?.transport === 'synthetic-loopback' && bound && got.length === 1 && got[0].handoff_id === ho.handoff_id)
          ok(`K. Lange ISSUED it (C3): carried by the SYNTHETIC LOOPBACK path (pinned ${a.pinned}, TLS verified against the declared anchor ${a.tls}, the bearer by reference) — THE RECEIPT bound by the database (handoff ${short(a.r_handoff)}, attempt ${a.r_attempt}, digest ${String(a.r_digest).slice(0, 12)}…; the ERP answered "${a.r_status}", its own log names the same handoff) → ${h.attempt?.state}`);
        else bad(`the ${label} reissue: transport ${h.transport}/${a?.transport}, bound ${bound}, the ERP received ${got.length} (${JSON.stringify(h.attempt ?? {}).slice(0, 160)})`);
        const eff = await effectsOf(ho.handoff_id);
        ok(`THE EFFECTS (${label}): ${eff.map((e) => `${e.line_key} ${e.eff} of ${e.req} ${e.status}`).join('; ')}`);
        return { handoff: ho, comp, eff };
      };
      const r1 = first ? await reissue(first, 'refused handoff\'s whole', 'partial') : null;
      if (r1) {
        const ex = await q(`select kind, state from decision.commitment_exceptions where item_id = $1 order by raised_at`, [HANDOFF_ITEM]);
        ok(`THE PARTIAL EFFECT opened the item's exception: ${ex.map((e) => `${e.kind} ${e.state}`).join(', ')}; the residual per line ${r1.eff.map((e) => `${e.line_key} ${e.req - e.eff}`).join(', ')}`);
        expectRefused('L. Brandt reconciling the half-effected reissue while its residual is undisposed', await cm(brandt, `handoffs/${r1.handoff.handoff_id}/reconcile`, 'decision.execution.reconcile', 'EXH', {}, r1.handoff.handoff_id), 409, /residual_undisposed/);
        const r2 = await reissue({ ...r1.handoff, lines: first.lines }, 'remaining half', 'normal');
        await erp('POST', '/_control', { mode: 'normal' });
        if (r2) {
          const comps = await q(`select kind, state from decision.execution_compensations where item_id = $1 order by created_at`, [HANDOFF_ITEM]);
          ok(`THE COMPENSATIONS: ${comps.map((c) => `${c.kind} ${c.state}`).join(', ')}`);
          // the last reissue first: each reconcile disposes the residual of the handoff before it (a compensation whose partially effected
          // handoff is reconciled is done — 0091 §F3), so the refused original reconciles last
          for (const h of [r2.handoff, r1.handoff, first]) {
            const rc = await cm(brandt, `handoffs/${h.handoff_id}/reconcile`, 'decision.execution.reconcile', 'EXH', {}, h.handoff_id);
            if (rc.ok) ok(`L. Brandt RECONCILED the handoff ${short(h.handoff_id)} (${rc.body.handoff.from} → ${rc.body.handoff.state})`); else fail(`L. Brandt reconciles ${short(h.handoff_id)}`, rc);
          }
          const it = (await q(`select i.state, (select string_agg(kind || ' ' || state, ', ' order by raised_at) from decision.commitment_exceptions e where e.item_id = i.item_id) ex from decision.commitment_items i where item_id = $1`, [HANDOFF_ITEM]))[0];
          ok(`the purchase-request item: ${it.state}; its exceptions ${it.ex}`);
        }
      }
    }
  }
  const tr = await cm(dvorak, 'tracker', 'decision.commitment.read', 'CMI', {});
  if (!tr.ok) fail('the tracker read', tr); else { const mine = (tr.body.tracker.items ?? []).filter((x) => x.commitment_id === COMMITMENT); ok(`THE TRACKER (M. Dvořák): ${mine.length} item(s) of this commitment — ${mine.map((x) => `${String(x.title).slice(0, 40)} ${x.state}${x.overdue ? ' OVERDUE' : ''}`).join('; ')}; summary ${JSON.stringify(tr.body.tracker.summary).slice(0, 160)}`); }
  const tl = await cm(dvorak, `${COMMITMENT}/get`, 'decision.commitment.read', 'CMT', {}, COMMITMENT);
  if (tl.ok) ok(`THE TIMELINE: ${(tl.body.commitment.timeline ?? []).length} entries over the lanes ${[...new Set((tl.body.commitment.timeline ?? []).map((x) => x.lane))].join(', ')}`); else fail('the timeline read', tl);
}

// ACT_SCENES=b34f (the B34-F run of 2026-09-29): scenes A, W (part 2) and X held on 2026-09-28 (evidence/cp6/act-b34.txt) and need a
// fresh state and minute-scale waits; the B34-F run replays the corrected scenes (W: the invitation through the identity authority;
// C: the positive execution scene) and says so here.
if (process.env.ACT_SCENES === 'b34f') {
  console.log('\nB34-A, B34-W (part 2), B34-X — HELD on 2026-09-28 (evidence/cp6/act-b34.txt); not replayed by the B34-F run (fresh state and minute-scale waits)');
} else {
/* ── B34-A ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-A F-P6-07 — an opportunity, a score change and an overdue commitment enter the queue beside the corridor warning; the act; the escalation to the e-mail sink; ranking fairness');
const tA = new Date();
{
  const v2 = (await q(`select version, digest, state, assessed_kind from prediction.exposure_versions where exposure_id = $1 order by version desc limit 1`, [MOROCCO]))[0] ?? null;
  if (v2 && v2.state === 'proposed') {
    const r = await call(`${XP}/${MOROCCO}/versions/${v2.version}/accept`, env_(brenner, 'prediction')({ action: 'prediction.exposure.accept', objectType: 'RSK', objectId: MOROCCO }), { digest: v2.digest, rationale: 'The Opportunity Agent\'s estimate matches the supplier\'s answer; accepted by the owner.' }, brenner.token);
    if (!r.ok) fail('C. Brenner accepts the opportunity\'s re-estimate', r); else ok(`C. Brenner ACCEPTED the Morocco opportunity's v${v2.version} (the agent's estimate; the owner decides) → ExposureChanged/assessment_accepted in the same write`);
  } else note(`the Morocco opportunity has no proposed version to accept (${v2?.state ?? 'none'}) — no opportunity item is raised this run`);
  const hc = await call(`${H}/compute`, env_(hoffmann, 'executive')({ action: 'executive.health.compute', objectType: 'HSS' }), {}, hoffmann.token);
  if (!hc.ok) fail('A. Hoffmann computes the health score', hc); else note(`A. Hoffmann COMPUTED the health score: ${hc.body.snapshot.status}, aggregate ${hc.body.snapshot.aggregate ?? 'withheld'}; ${(hc.body.snapshot.changes ?? []).length} change(s) raised (each one HealthScoreChanged — none when nothing moved)`);
}
if (DUE_ITEM !== null) {
  note(`waiting for the customs deliverable's due instant and the attention agent's scheduled tick (the sweep, step 45) — ${elapsed()}`);
  await waitFor('the deadline_missed exception', async () => q(`select exception_id::text, state from decision.commitment_exceptions where item_id = $1 and kind = 'deadline_missed'`, [DUE_ITEM]), (r) => r.length > 0, 8 * MIN);
}
const itemsSince = () => q(`select item_id::text, signal_class, subject_kind, subject_id::text, owner_principal_id::text owner, state, title from executive.attention_items where tenant_id = $1 and domain_id = $2 and created_at >= $3 order by created_at`, [T, D, tA]);
const routed = await waitFor('the B34 items', itemsSince, (r) => r.some((x) => x.signal_class === 'commitment.breach') && r.some((x) => x.signal_class === 'opportunity.raised'), 6 * MIN);
for (const it of routed ?? []) note(`  routed: ${it.signal_class} "${String(it.title).slice(0, 70)}" → ${it.state}, owner ${nm(it.owner)}`);
const BREACH = (routed ?? []).find((x) => x.signal_class === 'commitment.breach') ?? null;
const OPP = (routed ?? []).find((x) => x.signal_class === 'opportunity.raised') ?? null;
(BREACH ? ok : bad)(`the COMMITMENT BREACH routed (the tracker's CommitmentChanged read through decision.commitment_item_signal): ${BREACH ? `item ${short(BREACH.item_id)} for ${nm(BREACH.owner)}` : 'NOT routed'}`);
(OPP ? ok : bad)(`the OPPORTUNITY routed (ExposureChanged): ${OPP ? `item ${short(OPP.item_id)} "${String(OPP.title).slice(0, 60)}"` : 'NOT routed'}`);
{
  const qr = await call(`${E}/items/list`, env_(dvorak, 'executive')({ action: 'executive.attention.read', objectType: 'ATI', sideEffect: 'none' }), { limit: 40 }, dvorak.token);
  if (qr.ok) { const rows = (qr.body.items ?? []).filter((x) => ['open', 'escalated'].includes(String(x.state))); ok(`THE QUEUE (M. Dvořák) — the live items in rank order: ${rows.slice(0, 8).map((x) => `${x.signal_class ?? x.signalClass} (${x.state})${x.rank?.explanation ? ` [${String(x.rank.explanation).slice(0, 60)}]` : x.rank?.key ? ` [${JSON.stringify(x.rank.key).slice(0, 60)}]` : ''}`).join('; ')}; counts ${JSON.stringify(qr.body.counts).slice(0, 160)}`); }
  else note(`the queue read: ${refusalLine(qr)}`);
}
if (BREACH) {
  const act = (s, payload) => call(`${E}/items/${BREACH.item_id}/act`, env_(s, 'executive')({ action: 'executive.attention.item.act', objectType: 'ATI', objectId: BREACH.item_id, consequence: 'C2' }), payload, s.token);
  expectRefused('M. Dvořák acting on L. Brandt\'s breach item as if it were theirs (not the item\'s person)', await act(hoffmann, { action_key: 'propose_extension', rationale: 'acting on someone else\'s item', params: { newDueAt: at(5 * DAY) } }), 403);
  const a = await act(brandt, { action_key: 'propose_extension', rationale: 'The broker needs five more days; the extension is proposed to the reviewer.', params: { newDueAt: at(5 * DAY) } });
  if (!a.ok) fail('L. Brandt acts on the breach item', a);
  else {
    ok(`L. Brandt ACTED on the breach item through the governed transition: ${a.body.act.state} — ${a.body.act.effect_ref ?? ''} (decision.commitment.exception.decide, propose_extension; human-gated)`);
    const ex = (await q(`select exception_id::text, state from decision.commitment_exceptions where item_id = $1 and kind = 'deadline_missed' order by raised_at desc limit 1`, [DUE_ITEM]))[0];
    const rev = (await q(`select reviewer_principal_id::text r from decision.commitment_items where item_id = $1`, [DUE_ITEM]))[0].r;
    const reviewer = PEOPLE.find((p) => p.principalId === rev) ?? null;
    if (reviewer === null) note(`the reviewer ${short(rev)} is not a persona of this act — the co-sign is left to them`);
    else {
      const cs = await cm(reviewer, `exceptions/${ex.exception_id}/decide`, 'decision.commitment.exception.decide', 'CMX', { act: 'cosign', note: 'Five days accepted for the broker\'s filing.' }, ex.exception_id);
      if (!cs.ok) fail(`${nm(rev)} co-signs the extension`, cs); else ok(`${nm(rev)} (the item's reviewer) CO-SIGNED the extension → ${cs.body.exception.state}`);
    }
  }
}
if (BREACH) {
  note(`waiting for the breach item's 2-minute acknowledgement window (acting is not acknowledging) and the tick's escalation and delivery — ${elapsed()}`);
  const esc = await waitFor('the escalation', async () => q(`select state, escalations from executive.attention_items where item_id = $1`, [BREACH.item_id]), (r) => r[0]?.state === 'escalated' || Number(r[0]?.escalations ?? 0) > 0, 6 * MIN);
  (esc?.[0] && (esc[0].state === 'escalated' || Number(esc[0].escalations) > 0) ? ok : bad)(`the unacknowledged COMMITMENT BREACH ESCALATED to the executive: ${JSON.stringify(esc?.[0] ?? null)}`);
  const del = await waitFor('the e-mail delivery', async () => q(`select channel, state, receipt from executive.attention_deliveries where item_id = $1 and channel = 'email' order by attempted_at nulls last`, [BREACH.item_id]), (r) => r.some((x) => x.state === 'delivered'), 4 * MIN);
  const got = (del ?? []).find((x) => x.state === 'delivered');
  (got ? ok : bad)(`the escalation's notice DELIVERED through the EMAIL ADAPTER to the local SINK (SYNTHETIC): ${got ? `receipt ${JSON.stringify(got.receipt).slice(0, 180)}` : JSON.stringify(del).slice(0, 200)}`);
  try { const r = await fetch(`${SINK_HTTP}/_received`); const j = await r.json(); note(`the local sink received ${(j.received ?? []).filter((x) => x.channel === 'email').length} e-mail(s) (SYNTHETIC — no real provider; D6)`); } catch { note('the local sink was not reachable for its inspection route'); }
}
{
  const ev = await call(`${E}/evaluations/run`, env_(dvorak, 'executive')({ action: 'executive.attention.queue.evaluate', objectType: 'ATE', consequence: 'C2' }), { min_sample: 1 }, dvorak.token);
  if (!ev.ok) fail('M. Dvořák runs the queue evaluation', ev);
  else { const f = ev.body.evaluation.ranking_fairness ?? ev.body.evaluation.measures?.ranking_fairness; ok(`M. Dvořák ran the QUEUE EVALUATION — RANKING FAIRNESS (gates nothing): disparity ${JSON.stringify(f?.disparity ?? null).slice(0, 120)}; by class ${Object.entries(f?.by_class ?? {}).map(([k, v]) => `${k} mean ${v.mean_rank_percentile ?? '—'}`).join(', ').slice(0, 300)}`); }
}

/* ── B34-W (the escalation) ───────────────────────────────────────────────────────────── */
console.log('\nB34-W (part 2) — the expert\'s review deadline passed: the tick ESCALATED the task to the chief of staff, who reviews');
if (REVIEW_TASK !== null && WS !== null) {
  const t = await waitFor('the escalation of the review task', async () => q(`select state, escalation_level, assignee_principal_id::text a from executive.human_tasks where task_id = $1`, [REVIEW_TASK]),
    (r) => r[0]?.state === 'escalated', 6 * MIN);
  const row = t?.[0] ?? null;
  (row?.state === 'escalated' && row.a === dvorak.principalId ? ok : bad)(`the review task ESCALATED by the tick (workflow-timers, step 20) when its deadline passed: ${row?.state}, level ${row?.escalation_level}, assignee ${nm(row?.a)} (the chief of staff)`);
  if (row?.state === 'escalated') {
    const rv = await col(dvorak, `workspaces/${WS}/reviews`, 'executive.collab.review', 'CWS', { task_id: REVIEW_TASK, verdict: 'endorse_with_conditions', statement: 'The customs brief holds provided the broker files pre-clearance before each consignment ships.' }, WS);
    if (!rv.ok) fail('M. Dvořák reviews the escalated task', rv);
    else { const done = (await q(`select state, outcome from executive.human_tasks where task_id = $1`, [REVIEW_TASK]))[0]; ok(`M. Dvořák REVIEWED it (endorse with conditions) → the task ${done.state} (${done.outcome})`); }
  }
}

/* ── B34-X ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-X F-P4-13 — the next risk taxonomy version published and ACTIVATED by a second person');
{
  const cur = (await q(`select max(version)::int v from prediction.risk_taxonomy where tenant_id = $1 and domain_id = $2`, [T, D]))[0].v ?? 0;
  const pub = await call(`${XP}/taxonomy/publish`, env_(dvorak, 'prediction')({ action: 'prediction.exposure.taxonomy.publish', objectType: 'RSK' }), { expectedVersion: cur, reason: 'B34: customs added under supply chain',
    categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'supply_chain.customs', label: 'Customs', polarity: 'risk', parent: 'supply_chain' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }, { key: 'market', label: 'Market', polarity: 'both' }] }, dvorak.token);
  if (!pub.ok) fail('M. Dvořák publishes the next taxonomy version', pub);
  else {
    const v = pub.body.taxonomy.version; ok(`M. Dvořák PUBLISHED risk taxonomy version ${v} (+ supply_chain.customs) — not yet in force`);
    const self = await call(`${XP}/taxonomy/activate`, env_(dvorak, 'prediction')({ action: 'prediction.exposure.taxonomy.activate', objectType: 'RSK' }), { version: v, reason: 'activating my own version' }, dvorak.token);
    expectRefused('M. Dvořák activating their own version', self, 403);
    const a = await call(`${XP}/taxonomy/activate`, env_(okafor, 'prediction')({ action: 'prediction.exposure.taxonomy.activate', objectType: 'RSK' }), { version: v, reason: 'reviewed: the customs category is needed for the rerouted consignments' }, okafor.token);
    if (!a.ok) fail('S. Okafor activates the taxonomy', a); else ok(`S. Okafor ACTIVATED taxonomy version ${v} (the second person) — now in force`);
  }
}

}

/* ── B34-9 ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB34-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from executive.human_tasks where tenant_id = $1 and domain_id = $2)::int tasks, (select count(*) from decision.commitment_items where tenant_id = $1 and domain_id = $2)::int items,
                             (select count(*) from decision.execution_handoffs where tenant_id = $1 and domain_id = $2)::int handoffs, (select count(*) from executive.attention_item_acts where tenant_id = $1 and domain_id = $2)::int acts`, [T, D]))[0];
  note(`in the ledgers: ${n.tasks} human tasks, ${n.items} commitment items, ${n.handoffs} execution handoffs, ${n.acts} attention acts`);
  if (REVIEW_TASK) {
    const t = (await q(`select state, escalation_level, assignee_principal_id::text a from executive.human_tasks where task_id = $1`, [REVIEW_TASK]))[0];
    note(`the expert's review task at the end: ${t.state}, escalation level ${t.escalation_level}, assignee ${nm(t.a)}`);
  }
  note('LIMITS said: the customs expert, the purchase lines, the amounts and the ERP are SYNTHETIC; the review deadline, the deliverable\'s due instant and the opportunity\'s acknowledgement window are set minutes out so the scheduled ticks cross them during the act; the expert\'s sign-in, acceptance and scope refusals are the harness\'s (phase6-workflow-b34 C1 — the invitation token never leaves the API process, by design); the production egress refuses the loopback ERP by design — the positive exchange, the partial effect, the compensation and the co-signed closure are the harness\'s (phase6-commitments-b34 E2–E4, Z1); the e-mail, SMS and Teams adapters reach LOCAL sinks only (a real provider is D6); the exposure outcome loop, the canonical polarity, the detections and the further dimensions are the harness\'s (phase6-exposures-b34 E3–E6); the external collaborator\'s principal is written by the collaboration port (the Phase 0 identity path is frozen — B61 owns the governed route); nothing is cleaned.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
