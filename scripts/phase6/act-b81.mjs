#!/usr/bin/env node
/**
 * CP-6 stage B81 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): PATTERNS, LAYOUT AND
 * CONTENT — search and intent (F-P7-E-02), layout, density and multi-window (F-P7-E-04), object pages (F-P7-E-06), content and terms
 * (F-P7-E-18), degraded state and recovery (F-P7-E-19), human authority (F-P7-E-20), and §RE (B80's residues) — migration 0119 — exercised by
 * named personas through the REAL HTTP routes only (scripts/phase4/governed.mjs), each scene stating what it shows and ASSERTING it (a scene
 * that does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run
 * left (read-only SQL) and says "stands — an earlier run" instead of writing it twice. NOTHING IS PLANTED: no row is written by SQL and no
 * clock is moved; staleness is the DATABASE clock's (the degraded evaluator's own read).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses phase6-{prelude,authority,degraded,terms,search,handoffs,
 * preferences}-b81, the web unit models and the walks); DEMONSTRATED OPERATION (this act — every persona SYNTHETIC; every term, contribution,
 * design acceptance and signature here carries `claim = demonstration` where the record has a claim); REAL ACCEPTANCE — the named design
 * authorities' attestation, audience comprehension evidence (GLB-20), assistive-technology testing — NEVER claimed: the non-demonstration
 * recording path is construction at B111 (F-P7-E-17), then the external act at H3.
 *
 *   B81-0  THE STATE — 0119 applied; the cast; the build identity the API declares.
 *   B81-1  HUMAN AUTHORITY (F-P7-E-20) — L. Brandt completes "Bab el-Mandeb corridor reroute (SYNTHETIC)" (the status quo, the terms, the
 *          choice, an approver policy naming S. Okafor and F. Kraus) and PROPOSES it (the digest frozen); a defer naming an AGENT as the owner of
 *          its conditions refused (B81's defer intake); F. Kraus RECUSES; S. Okafor's approval over a stale digest refused, then she APPROVES and
 *          SIGNS her approval; L. Brandt's own approval refused (he holds no approver role — separation of duties stands, 0042); the typed
 *          confirmation (the page's own rule) refuses a wrong phrase; a commit over a stale digest refused; L. Brandt PREVIEWS, COMMITS and SIGNS
 *          the decision (the signature receipt VERIFIED).
 *   B81-2  DEGRADED STATE AND RECOVERY (F-P7-E-19) — K. Mensah (operations authority) declares the degraded contract for the AIS source
 *          red-sea-ais-positions (owner = the source's catalog owner); its signal is read by the database clock and SAID as it is (stale, or
 *          fresh with the instant it turns stale); the Red Sea carrier advisories — stale by the clock — get their contract too (in force: the
 *          stale declaration's watermark, age and refresh path); a 4-path corridor experiment declared by T. Nakamura, approved by J. Weber,
 *          started and CANCELLED after its first chunk — the residual state (paths done, the outputs digest, NOT rolled back).
 *   B81-3  CONTENT AND TERMS (F-P7-E-18) — the principle design.content-governed; the canonical term ASSESSED (TS-04) proposed by L. Haddad,
 *          reviewed by P. Castellano, the proposer's approval REFUSED, approved and published by S. Iversen; "Close warning" with its
 *          non-canonical synonym "withdraw (a warning)" the same way; the domain catalogue read by L. Brandt (the executive explanation); the
 *          content lint (dg-lint-3) run as a RATCHET (counts stated, the ratchet holds).
 *   B81-4  OBJECT PAGES (F-P7-E-06) — the same header grammar read on the B28 warning, an N. Eriksen forecast, a T. Nakamura twin snapshot
 *          and the reroute package; the warning compared at two recorded instants ("acted by" — a warning carries no approval); the package's
 *          versions with their actual approvers.
 *   B81-5  LAYOUT AND WINDOWS (F-P7-E-04) — L. Brandt's density preference (strategic, DEN-01); his operations room published to the display;
 *          a handoff of the package review OFFERED by his desk session and CLAIMED by his second session (a receipt, the roles re-read, never
 *          inherited); the desk's next publish REFUSED (the display moved with the handoff).
 *   B81-6  SEARCH AND INTENT (F-P7-E-02) — A. Hoffmann's "Bab el-Mandeb exposure Regensburg" read by the deterministic interpreter over the
 *          five governed reads; the bounded clarification recorded as an intent record with nothing preselected; her choice; the search saved
 *          with its cutoff and policy version and reopened exactly; "approve corridor reroute" recorded only as the hand-off to the package's
 *          Command Review — nothing executed.
 *   B81-7  §RE (B80's residues) — the inventory re-read (B81's library registered; the drift STATED); the library lint (dg-lint-2: the Field
 *          forks gone — CONFORMANT, 0 findings); the B107 contributions for GovernedButton (frozen status), TruthBadge (glyphs) and
 *          LifecycleBadge (LS) proposed by S. Iversen, her own acceptance REFUSED, reviewed, accepted (signed) and published by L. Haddad; the
 *          AIS source's upload mode read (the walk shows FileIntake); the sign-in return is the walk's.
 *   B81-8  THE INVENTORY AND THE ACCEPTANCE DEMONSTRATION RECORDS — B81's new library components approved with ONE owner; a B81 design
 *          baseline proposed and attested; a design acceptance record per B81 chapter scope (design, assurance, customer) — `claim =
 *          demonstration`.
 *   B81-9  THE STATE, the env lines for the walks, THE LIMITS.
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument). Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment; the signing keys are bound in the API's environment by reference and never read here.
 */
import { closeSync, existsSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, register } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, ok, bad, note, failureCount } from '../phase4/governed.mjs';

// THE OUTPUT FILE (ACT_OUT or argv[2]): every console line is also written there (synchronously — process.exit() never waits for a stream)
const OUT = process.env.ACT_OUT ?? process.argv[2] ?? null;
if (OUT) {
  const fd = openSync(OUT, 'w');
  const orig = console.log.bind(console);
  console.log = (...a) => { orig(...a); writeSync(fd, `${format(...a)}\n`); };
  process.on('exit', () => closeSync(fd));
}

const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(SELF_ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);

/* THE WEB'S OWN PURE RULES, imported (never re-implemented): the deterministic interpreter (lib/intent-b81.ts) and the typed confirmation
   (lib/authority-b81.ts). Node strips their types; a resolve hook gives their extensionless relative imports the .ts the bundler adds. */
process.removeAllListeners('warning');
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
  if ((s.startsWith('./') || s.startsWith('../')) && c.parentURL && c.parentURL.includes('/apps/web/lib/') && !/\\.[a-z]+$/.test(s)) { try { return await n(s + '.ts', c); } catch {} }
  return n(s, c); }`)}`);
const WEB = (f) => pathToFileURL(join(SELF_ROOT, 'apps', 'web', 'lib', f)).href;
const { interpret, intentRecordOf, INTERPRETER_VERSION, STRATEGY_KINDS } = await import(WEB('intent-b81.ts'));
const { typedPhrase, typedState } = await import(WEB('authority-b81.ts'));

const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const dg = (x) => (x ? `${String(x).slice(0, 12)}…` : '—');
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 420)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const rcpt = (r) => (r?.body?.receipt ? `POL ${String(r.body.receipt.policyDecisionId).slice(0, 13)}… · audit seq ${r.body.receipt.auditSeq}` : 'no receipt');
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const tStart = Date.now();
console.log(`THE B81 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, statuses, re) => {
  const st = Array.isArray(statuses) ? statuses : [statuses];
  if (!r.ok && st.includes(r.status) && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${st.join('/')} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const isRead = (action) => /\.(read|preview|search)$/.test(action);
const over = (s, sc, action, objectType, objectId, purposeId, consequence) => ({
  scope: sc, tenantId: sc === 'PLATFORM' ? null : T, domainId: sc === 'DOMAIN' ? D : null, principalId: `principal:${s.principalId}`, purposeId,
  action, objectType, objectId, sideEffect: isRead(action) ? 'none' : 'reversible', consequence: consequence ?? (isRead(action) ? 'C1' : 'C2'), trace: 'phase6-b81' });
const P = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => call(path, over(s, 'PLATFORM', action, objectType, objectId, purpose), payload, s.token);
const DM = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance', consequence) => call(path, over(s, 'DOMAIN', action, objectType, objectId, purpose, consequence), payload, s.token);
const BASE = `/v1/tenants/${T}/domains/${D}`;
const DEC = `${BASE}/decisions`;
const SHL = `${BASE}/shell`;
const SIMO = `${BASE}/simulations/orchestration`;
const DG = '/v1/governance/design';
const DGD = `${BASE}/governance/design`;
const TERMS = `${DG}/terms`;

/* ── B81-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB81-0 THE STATE — 0119, the NORDWERK cast, the build identity');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0119%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0119 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D])).n > 0;
const CAST = [['l.brandt', 'decision_owner', 'DOMAIN'], ['l.brandt', 'decision_authority', 'DOMAIN'], ['s.okafor', 'decision_approver', 'DOMAIN'], ['f.kraus', 'board_member', 'DOMAIN'],
  ['k.mensah', 'operations_authority', 'PLATFORM'], ['a.hoffmann', 'domain_analyst', 'DOMAIN'], ['t.nakamura', 'twin_owner', 'DOMAIN'], ['j.weber', 'strategy_owner', 'DOMAIN'],
  ['n.eriksen', 'forecast_owner', 'DOMAIN'], ['l.haddad', 'design_system_authority', 'PLATFORM'], ['s.iversen', 'design_system_authority', 'PLATFORM'],
  ['p.castellano', 'conformance_steward', 'PLATFORM'], ['h.achterberg', 'independent_assurance', 'PLATFORM'], ['w.zielinska', 'customer_sponsor', 'TENANT']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}${sc === 'DOMAIN' ? ' (the corridor domain "Supply Corridor Intelligence")' : ''}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n !== null) Object.assign(s, n); } };
const brandt = await persona('l.brandt'); const okafor = await persona('s.okafor'); const kraus = await persona('f.kraus'); const mensah = await persona('k.mensah');
const hoffmann = await persona('a.hoffmann'); const nakamura = await persona('t.nakamura'); const weber = await persona('j.weber'); const eriksen = await persona('n.eriksen');
const dsa = await persona('l.haddad'); const dsaOwner = await persona('s.iversen'); const steward = await persona('p.castellano'); const assurance = await persona('h.achterberg');
const sponsor = await persona('w.zielinska');
const NAME = { [brandt.principalId]: 'L. Brandt', [okafor.principalId]: 'S. Okafor', [kraus.principalId]: 'F. Kraus', [mensah.principalId]: 'K. Mensah', [hoffmann.principalId]: 'A. Hoffmann',
  [nakamura.principalId]: 'T. Nakamura', [weber.principalId]: 'J. Weber', [eriksen.principalId]: 'N. Eriksen', [dsa.principalId]: 'L. Haddad', [dsaOwner.principalId]: 'S. Iversen',
  [steward.principalId]: 'P. Castellano', [assurance.principalId]: 'H. Achterberg', [sponsor.principalId]: 'W. Zielińska' };
const nm = (id) => NAME[id] ?? short(id);
{
  const c = await P(admin, '/v1/governance/conformance/read', 'governance.read', {}, 'GOV', null, 'governance');
  const b = c.ok ? (c.body.build ?? c.body.identity ?? {}) : {};
  if (c.ok) note(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}`);
  else note(`the build identity was not read (${refusalLine(c)})`);
}

/* ── B81-1 HUMAN AUTHORITY ───────────────────────────────────────────────────────────── */
console.log('\nB81-1 HUMAN AUTHORITY (F-P7-E-20) — the reroute decision: proposed with its digest frozen, a recusal, S. Okafor approves and signs, L. Brandt commits and signs as decision authority');
const PACKAGE_TITLE = 'Bab el-Mandeb corridor reroute (SYNTHETIC)';
const OBJ_TITLE = 'Keep the Regensburg line supplied through Q1';
const TWIN_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const W_TITLE = 'Stream rule Bab el-Mandeb corridor collapse on event time (B28): 5 of 5 observed days < 30 in 2024-02-11..2024-02-16';
const dc = (s, path, action, payload, objectType = 'DPK', objectId = null, consequence) => DM(s, `${DEC}/${path}`, action, payload, objectType, objectId, 'decision', consequence);
const PKGROW = await q1(`select package_id::text id, state, current_version v, committed_version cv from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, PACKAGE_TITLE]);
const OBJ = await q1(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = $3 limit 1`, [T, D, OBJ_TITLE]);
const TWIN = await q1(`select twin_id::text id, title from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, TWIN_TITLE]);
const AGENT = await q1(`select agent_id::text id, principal_id::text principal from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'decision' and status = 'active' order by created_at desc limit 1`, [T, D]);
if (PKGROW === null || OBJ === null || TWIN === null) { bad(`an input is missing: the package ${!!PKGROW} (act-b80), the objective ${!!OBJ}, the corridor twin ${!!TWIN}`); process.exit(1); }
const PKG = PKGROW.id;
const V = PKGROW.v ?? 1;
ENV_OUT.EYE_B81_PACKAGE = PKG;
const vrow = async () => q1(`select state, version_digest, header_digest, approver_policy from decision.package_versions where package_id = $1 and version = $2`, [PKG, V]);
const gateRecord = async (s) => { const r = await dc(s, `${PKG}/versions/${V}/gate-record`, 'decision.read', {}, 'DPK', PKG); return r.ok ? r.body.record : null; };
{
  let vs = await vrow();
  note(`the package ${short(PKG)} "${PACKAGE_TITLE}" (declared in act-b80) — version ${V} is ${String(vs?.state).toUpperCase()}`);
  if (vs?.state === 'draft') {
    const opts = await q(`select key from decision.options where package_id = $1 and version = $2`, [PKG, V]);
    if (!opts.some((o) => o.key === 'status-quo')) {
      const r = await dc(brandt, `${PKG}/versions/${V}/options`, 'decision.package.option', { key: 'status-quo', title: 'Hold the booked Suez routing and wait for the corridor to reopen', kind: 'status_quo',
        consequences: [], unsimulatedReason: 'not simulated here: the status quo is the booked routing, its delay the corridor warning states (SYNTHETIC)', risks: ['line stops at Regensburg while the corridor stays closed'], opportunities: [] }, 'DPK', PKG);
      if (!r.ok) fail('L. Brandt adds the status quo', r); else ok(`L. Brandt ADDED the option "status-quo" (the booked routing) beside "reroute-cape" — ${rcpt(r)}`);
    }
    const terms = await dc(brandt, `${PKG}/versions/${V}/terms`, 'decision.package.terms', { objectives: [OBJ.id], constraints: ['no air freight above 60 t/week'],
      approverPolicy: { quorum: 1, principals: [okafor.principalId, kraus.principalId], expires_after_days: 14 },
      monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }], reversibility: 'reversible until the rerouted bookings are confirmed with the carrier',
      informationValue: 'the insurer\'s reopening notice decides the timing, not the option' }, 'DPK', PKG);
    if (!terms.ok) fail('L. Brandt sets the terms', terms); else ok(`L. Brandt SET the terms: the objective "${OBJ_TITLE}", the approver policy — quorum 1 of S. Okafor and F. Kraus, expiring after 14 days — and a weekly review he owns — ${rcpt(terms)}`);
    const choice = await dc(brandt, `${PKG}/versions/${V}/choice`, 'decision.package.choice', { option_key: 'reroute-cape', rationale: 'The corridor stays closed beyond the line\'s buffer; the Cape adds transit days but keeps the bearings and magnets arriving (SYNTHETIC).',
      decision_deadline: '2027-01-15', accepted_trade_offs: ['ten to fourteen more transit days via the Cape'], action_owner: brandt.principalId,
      outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10',
        observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TWIN.id, period: { from: '2024-01-11', to: '2024-04-10' } }] }, 'DPK', PKG);
    if (!choice.ok) fail('L. Brandt sets the choice', choice); else ok(`L. Brandt SET the choice: "reroute-cape", action owner himself, the outcome criterion line-stop days ≤ 0 on the corridor twin — ${rcpt(choice)}`);
    // THE COMMAND REVIEW BEFORE PROPOSE: the draft is still open — nothing is frozen until the proposal; the named reviewers are the policy's
    const pv = await vrow();
    note(`BEFORE THE PROPOSAL: version ${V} is ${pv.state} (no digest frozen: ${pv.version_digest === null ? 'none yet' : dg(pv.version_digest)}); the named reviewers — ${(pv.approver_policy?.principals ?? []).map(nm).join(' and ')} (quorum ${pv.approver_policy?.quorum})`);
    const pr = await dc(brandt, `${PKG}/versions/${V}/propose`, 'decision.package.propose', {}, 'DPK', PKG);
    if (!pr.ok) fail('L. Brandt proposes', pr);
    else ok(`L. Brandt PROPOSED version ${V}: the DecisionDigest FROZEN at ${dg(pr.body.proposal.versionDigest)} — an approval binds exactly this digest — ${rcpt(pr)}`);
    vs = await vrow();
  } else note(`version ${V} was proposed earlier (digest ${dg(vs?.version_digest)}): stands — an earlier run`);
  const DIGEST = vs?.version_digest ?? null;
  const committed = async () => q1(`select commitment_id::text id, committed_by::text by, committed_at, version_digest from decision.commitments where package_id = $1 and version = $2 order by committed_at desc limit 1`, [PKG, V]);
  // B81's defer intake: the conditions' owner is a named member — an AGENT never is; nothing is recorded
  if (AGENT && (await committed()) === null) {
    expectRefused('L. Brandt defers the version naming the Decision Agent as the owner of its conditions', await dc(brandt, `${PKG}/versions/${V}/gate/defer`, 'decision.gate.defer',
      { rationale: 'deferred until the insurer reopens the corridor (refused: an agent owns nothing at the gate)', nextReviewAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        conditions: ['the insurer withdraws its notice for the corridor'], owner: AGENT.principal }, 'DPK', PKG), 422, /^gate rejected \(owner\)/);
  }
  // F. Kraus recuses (B36's recusal): the AuthorityBanner names the eligibility, the recusal and the gate
  const rec = await q1(`select recusal_id::text id, reason, live_before, live_after from decision.recusals where package_id = $1 and version = $2 and approver_principal_id = $3`, [PKG, V, kraus.principalId]);
  if (rec) note(`F. Kraus's recusal stands — an earlier run ("${rec.reason}")`);
  else {
    const r = await dc(kraus, `${PKG}/versions/${V}/recuse`, 'decision.recuse', { reason: 'a family member works for the Cape routing\'s carrier — I recuse myself from this decision (SYNTHETIC)' }, 'DPK', PKG);
    if (!r.ok) fail('F. Kraus recuses', r); else ok(`F. Kraus (board member, named by the policy) RECUSED: live approvers ${r.body.recusal.live_before ?? '—'} → ${r.body.recusal.live_after ?? '—'}, quorum ${r.body.recusal.quorum}${r.body.recusal.quorum_lost ? ' — LOST' : ' — still reachable'} — ${rcpt(r)}`);
  }
  // S. Okafor: the stale digest refused, then the approval over the frozen digest, then her signature
  const appr = async () => q1(`select approval_id::text id, header_digest, version_digest, decision from decision.approvals where package_id = $1 and version = $2 and approver_principal_id = $3 and revoked_at is null order by recorded_at desc limit 1`, [PKG, V, okafor.principalId]);
  let A = await appr();
  if (A === null && DIGEST !== null) {
    expectRefused('S. Okafor approves over a STALE digest (not the version\'s)', await dc(okafor, `${PKG}/versions/${V}/approve`, 'decision.approve', { decision: 'approve', versionDigest: 'a'.repeat(64), rationale: 'an approval over a digest I did not read (refused)' }, 'APR', null), 409, /the digest approved is not the digest of version/);
    const r = await dc(okafor, `${PKG}/versions/${V}/approve`, 'decision.approve', { decision: 'approve', versionDigest: DIGEST, rationale: 'The Cape reroute keeps the line supplied within the stated trade-off; the status quo does not (SYNTHETIC).' }, 'APR', null);
    if (!r.ok) fail('S. Okafor approves', r); else ok(`S. Okafor (decision approver) APPROVED version ${V} over the frozen digest ${dg(DIGEST)}: state ${r.body.approval.state}, ${r.body.approval.liveApprovals} of quorum ${r.body.approval.quorum} — ${rcpt(r)}`);
    A = await appr();
  } else if (A) note(`S. Okafor's approval ${short(A.id)} stands — an earlier run`);
  if (A) {
    const sig = await q1(`select signature_id::text id, key_id from executive.signatures where subject_kind = 'approval' and subject_id = $1 and signer = $2`, [A.id, okafor.principalId]);
    if (sig) note(`S. Okafor's signature on her approval stands — an earlier run (key ${sig.key_id})`);
    else {
      const r = await dc(okafor, `${PKG}/versions/${V}/sign`, 'decision.sign.approval', { kind: 'approval', digest: A.header_digest, approvalId: A.id }, 'DPK', PKG);
      if (!r.ok) fail('S. Okafor signs her approval', r); else ok(`S. Okafor SIGNED her approval: key ${r.body.signature.key_id}, over ${dg(r.body.signature.subject_digest)}, VERIFIED ${r.body.signature.verified} — ${rcpt(r)}`);
    }
  }
  // separation of duties: L. Brandt — the owner, the proposer and the action owner — never approves his own version
  if (DIGEST !== null) expectRefused('L. Brandt (owner, proposer, decision authority) approves his own version', await dc(brandt, `${PKG}/versions/${V}/approve`, 'decision.approve', { decision: 'approve', versionDigest: DIGEST, rationale: 'approving my own version (refused)' }, 'APR', null), 403);
  note('an AGENT\'s attempt at the approval is refused in the harness (phase6-authority-b81 "eligibility and separation of duties"): the Decision Agent holds no approver role and no human gate admits it; this act opens no agent session');
  // THE TYPED CONFIRMATION (the page's own rule — lib/authority-b81.ts typedPhrase / typedState): the phrase is the digest's first 8 characters
  let C = await committed();
  if (C === null && DIGEST !== null && A) {
    const phrase = typedPhrase({ digest: DIGEST });
    const wrong = typedState(phrase, 'reroute');
    const right = typedState(phrase, phrase);
    (wrong.ok === false && right.ok === true ? ok : bad)(`THE TYPED CONFIRMATION on the commit: the phrase is ${phrase} (the frozen digest's first 8 characters); "reroute" is REFUSED in the client — ${wrong.reason}; the phrase itself is admitted — and the server still decides`);
    const preview = await dc(brandt, `${PKG}/versions/${V}/preview`, 'decision.commit.preview', { versionDigest: DIGEST }, 'DPK', PKG);
    if (!preview.ok) fail('L. Brandt previews the commitment', preview);
    else {
      const p = preview.body.preview;
      ok(`L. Brandt PREVIEWED the commitment (the ConsequencePreview): would commit ${p.preview?.would_commit}; reversibility "${p.preview?.reversibility ?? '—'}"; blockers ${(p.preview?.blockers ?? []).length}; preview ${dg(p.preview_digest)} valid until ${iso(p.valid_until)}`);
      expectRefused('L. Brandt commits over a STALE digest', await dc(brandt, `${PKG}/versions/${V}/commit`, 'decision.commit', { versionDigest: 'b'.repeat(64), previewDigest: p.preview_digest }, 'CMT', null, 'C3'), [409, 422]);
      const c = await dc(brandt, `${PKG}/versions/${V}/commit`, 'decision.commit', { versionDigest: DIGEST, previewDigest: p.preview_digest }, 'CMT', null, 'C3');
      if (!c.ok) fail('L. Brandt commits', c);
      else if (c.body.commitment === null) bad(`L. Brandt's commitment was HELD: ${JSON.stringify(c.body.held).slice(0, 300)}`);
      else ok(`L. Brandt (decision authority, human gate, C3) COMMITTED version ${V}: commitment ${short(c.body.commitment.commitmentId)}, the approvals bound ${c.body.commitment.approvals.map((x) => nm(x.approver)).join(', ')} — ${rcpt(c)}`);
    }
    C = await committed();
  } else if (C) note(`the commitment ${short(C.id)} by ${nm(C.by)} (${iso(C.committed_at)}) stands — an earlier run`);
  if (C) {
    const hd = (await vrow()).header_digest;
    const sig = await q1(`select signature_id::text id, key_id from executive.signatures where subject_kind = 'decision' and subject_id = $1 and subject_version = $2 and signer = $3`, [PKG, V, brandt.principalId]);
    if (sig) note(`L. Brandt's signature on the decision stands — an earlier run (key ${sig.key_id})`);
    else {
      const phrase = typedPhrase({ digest: hd });
      note(`the decision signature's typed phrase is ${phrase} (the header digest's first 8 characters)`);
      const r = await dc(brandt, `${PKG}/versions/${V}/sign`, 'decision.sign.decision', { kind: 'decision', digest: hd }, 'DPK', PKG);
      if (!r.ok) fail('L. Brandt signs the decision', r); else ok(`L. Brandt SIGNED the decision as its authority: key ${r.body.signature.key_id}, over the header ${dg(hd)}, VERIFIED ${r.body.signature.verified} — ${rcpt(r)}`);
    }
  }
  // THE RECORD AS THE PAGE READS IT (the AuthorityBanner, the gate, the SignatureReceipt)
  const g = await gateRecord(brandt);
  if (g === null) bad('the gate record could not be read');
  else {
    const approvals = (g.approvals ?? []).filter((x) => !x.recused);
    const signed = approvals.flatMap((x) => x.signatures ?? []);
    const decSig = g.decision_signatures ?? [];
    const recused = (g.recusals ?? []).map((x) => nm(x.approver ?? x.approver_principal_id));
    const good = String(g.state).match(/committed|monitoring/) && approvals.some((x) => x.approver === okafor.principalId) && recused.includes('F. Kraus')
      && signed.some((x) => x.verified !== false) && decSig.some((x) => (x.signer === brandt.principalId) && x.verified !== false) && g.commitment;
    (good ? ok : bad)(`THE GATE RECORD: package ${String(g.state).toUpperCase()} · gate ${g.gate?.state ?? '—'} · approved by ${approvals.map((x) => nm(x.approver)).join(', ')} (signature ${signed.map((x) => `${x.key_id} ${x.verified === false ? 'NOT verified' : 'VERIFIED'}`).join(', ') || 'none'}) · recused ${recused.join(', ') || 'none'} · committed by ${nm(g.commitment?.committed_by ?? C?.by)} · the decision signed by ${decSig.map((x) => `${nm(x.signer)} (${x.key_id}, ${x.verified === false ? 'NOT verified' : 'VERIFIED'})`).join(', ') || 'nobody'} · ${(g.denials ?? []).length} denial(s) on the package`);
  }
  ENV_OUT.EYE_B81_PACKAGE_VERSION = V;
}

/* ── B81-2 DEGRADED STATE AND RECOVERY ───────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-2 DEGRADED STATE AND RECOVERY (F-P7-E-19) — the AIS source\'s degraded contract by the operations authority, its signal by the database clock; the stale carrier advisories; a corridor experiment started and CANCELLED');
const SDG = `${SHL}/degraded`;
const dgState = (s, filter = {}) => DM(s, `${SDG}/state`, 'shell.degraded.read', filter, 'SDG', null, 'observation');
const fmtAge = (sec) => (sec === null || sec === undefined ? '—' : sec >= 86_400 ? `${(sec / 86_400).toFixed(1)} days` : sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${sec} s`);
async function declareContract(key, spec) {
  const have = await q1(`select contract_id::text id, version from shell.degraded_contracts where tenant_id = $1 and domain_id = $2 and dependency_kind = 'source' and dependency_key = $3 order by version desc limit 1`, [T, D, key]);
  if (have) { note(`the degraded contract for source ${key} v${have.version} (${short(have.id)}) stands — an earlier run`); return have.id; }
  const r = await DM(mensah, `${SDG}/contracts/declare`, 'shell.degraded.contract.declare', { requestId: randomUUID(), kind: 'source', key, expectedVersion: 0, ...spec }, 'SDG', null, 'observation');
  if (!r.ok) { fail(`K. Mensah declares the degraded contract for ${key}`, r); return null; }
  const c = r.body.contract;
  ok(`K. Mensah (operations authority, human gate) DECLARED the degraded contract for source ${key} v${c.version} (${short(c.contract_id)}): owner ${nm(c.owner_principal_id)}, at most ${fmtAge(spec.maxDurationSeconds)}; unavailable — ${spec.unavailable.map((f) => f.label).join('; ')}; still available — ${spec.available.map((f) => f.label).join('; ')} — ${rcpt(r)}`);
  return c.contract_id;
}
{
  const AIS = 'red-sea-ais-positions';
  const owner = await q1(`select owner_principal_id::text id from products.catalog_assets where tenant_id = $1 and domain_id = $2 and kind = 'source' and ref = $3 limit 1`, [T, D, AIS]).catch(() => null);
  const AIS_OWNER = owner?.id ?? hoffmann.principalId;
  note(`the AIS source ${AIS}: its catalog owner is ${nm(AIS_OWNER)} — the owner of its degraded mode`);
  const aisId = await declareContract(AIS, {
    available: [{ action: 'prediction.read', label: 'Read the corridor warnings, forecasts and twin state — marked stale' }, { action: 'observation.read', label: 'Read the AIS source and the evidence it holds' }],
    unavailable: [{ action: 'prediction.forecast.run', label: 'Issue a new corridor forecast from the AIS positions' }],
    limitations: ['Transit counts derived from AIS positions may lag the corridor by the source\'s age', 'Do not present the corridor\'s AIS-derived figures as current'],
    maxDurationSeconds: 14 * 86_400, ownerPrincipalId: AIS_OWNER,
    exitEvidence: 'a new upload under source contract v1 is admitted and the source reads fresh by the clock; the owner records the exit',
    reason: 'the corridor\'s AIS positions arrive by replay upload only; when they age beyond the freshness threshold the corridor views must say so (SYNTHETIC)' });
  const st = await dgState(hoffmann, { kind: 'source', key: AIS });
  if (!st.ok) fail('A. Hoffmann reads the degraded state', st);
  else {
    const c = (st.body.degraded.contracts ?? []).find((x) => x.contract_id === aisId) ?? (st.body.degraded.contracts ?? [])[0];
    const d = c?.signal?.details ?? {};
    if (c?.signal?.state === 'degraded') ok(`THE AIS SIGNAL by the database clock: DEGRADED — ${c.signal.reason}; mode ${String(c.mode).toUpperCase()} (in force ${c.in_force}); watermark ${d.watermark ?? 'none'} (${d.reference_basis}), age ${fmtAge(d.age_seconds)}, threshold ${fmtAge(d.threshold_seconds)}; refresh path: ${d.refresh_path}`);
    else if (c) {
      const turns = d.reference_at && d.threshold_seconds ? new Date(new Date(d.reference_at).getTime() + d.threshold_seconds * 1000).toISOString().slice(0, 19) + 'Z' : '—';
      ok(`THE AIS SIGNAL by the database clock: ${String(c.signal.state).toUpperCase()} — not stale, and the act plants nothing to make it so: the reference is the ${d.reference_basis} at ${iso(d.reference_at)} (age ${fmtAge(d.age_seconds)} of a ${fmtAge(d.threshold_seconds)} freshness threshold), so it reads STALE from ${turns}; the contract is ${String(c.mode).toUpperCase()} until then (declared, owner ${c.owner?.name ?? nm(c.owner?.principal_id)})`);
      ENV_OUT.EYE_B81_AIS_STALE_FROM = turns;
    } else bad('the AIS contract is absent from the degraded state');
  }
  // the Red Sea carrier advisories: an upload source STALE by the clock (its last arrival far beyond its threshold) — the same contract shape
  const CARRIER = 'carrier-advisories';
  const owner2 = await q1(`select owner_principal_id::text id from products.catalog_assets where tenant_id = $1 and domain_id = $2 and kind = 'source' and ref = $3 limit 1`, [T, D, CARRIER]).catch(() => null);
  const pre = await dgState(hoffmann, { kind: 'source', key: CARRIER });
  const sig0 = pre.ok ? [...(pre.body.degraded.contracts ?? []).map((x) => x.signal), ...(pre.body.degraded.undeclared ?? []).map((x) => x.signal)][0] : null;
  if (sig0?.state !== 'degraded' && !(await q1(`select 1 from shell.degraded_contracts where tenant_id = $1 and domain_id = $2 and dependency_key = $3`, [T, D, CARRIER]))) note(`the carrier advisories read ${sig0?.state ?? 'unknown'} by the clock — not stale here, so no contract is declared for them`);
  else {
    const cid = await declareContract(CARRIER, {
      available: [{ action: 'prediction.read', label: 'Read the corridor warnings and forecasts — the advisories marked stale' }],
      unavailable: [{ action: 'prediction.forecast.run', label: 'Issue a corridor forecast that cites the carrier advisories' }],
      limitations: ['The carrier advisories are older than their freshness threshold; their routing statements may no longer hold'],
      maxDurationSeconds: 60 * 86_400, ownerPrincipalId: owner2?.id ?? hoffmann.principalId,
      exitEvidence: 'a new upload of the carrier advisories is admitted and the source reads fresh by the clock; the owner records the exit',
      reason: 'the carrier advisories feed the corridor warnings and are stale by the clock; the corridor views must declare it (SYNTHETIC)' });
    const st2 = await dgState(hoffmann, {});
    if (!st2.ok) fail('A. Hoffmann reads the domain\'s degraded state', st2);
    else {
      const s2 = st2.body.degraded;
      const c = (s2.contracts ?? []).find((x) => x.contract_id === cid);
      const d = c?.signal?.details ?? {};
      (c && c.in_force && c.signal.state === 'degraded' && d.stale === true ? ok : bad)(`THE STALE DECLARATION (what every corridor view shows): source ${CARRIER} — mode ${String(c?.mode).toUpperCase()}${c?.overdue ? ' (OVERDUE beyond its maximum)' : ''}, owner ${c?.owner?.name ?? '—'}; watermark ${iso(d.watermark)} (${d.reference_basis}), age ${fmtAge(d.age_seconds)} beyond ${fmtAge(d.threshold_seconds)}; refresh path: ${d.refresh_path}`);
      note(`the domain's degraded state now: ${(s2.contracts ?? []).length} contract(s) (${(s2.contracts ?? []).filter((x) => x.in_force).length} in force), ${(s2.undeclared ?? []).length} undeclared degraded dependenc${(s2.undeclared ?? []).length === 1 ? 'y' : 'ies'}; unavailable functions in force: ${(s2.unavailable_functions ?? []).map((f) => f.action).join(', ') || 'none'}; evaluated by ${s2.evaluated?.rule} on the ${s2.evaluated?.clock} clock`);
    }
  }
}
{
  // THE CANCELLED RUN: a 4-path corridor experiment (1 path a chunk, 1 chunk a tick) — cancelled after its first chunk lands
  const EXP_TITLE = 'Corridor closure — a 4-path probe, cancelled after its first chunk (B81, SYNTHETIC)';
  const sim = (s, path, action, payload, objectId = null) => DM(s, `${SIMO}/${path}`, action, payload, 'SXP', objectId, 'simulation');
  const expRow = async () => q1(`select experiment_id::text id, state, run_id::text run, progress, outcome, manifest ->> 'outputs_digest' outputs from simulation.experiments where tenant_id = $1 and domain_id = $2 and title = $3 order by declared_at desc limit 1`, [T, D, EXP_TITLE]);
  let e = await expRow();
  const VER = await q1(`select v.version from twin.twin_versions v where v.twin_id = $1 and v.state = 'admitted' and v.branch_id = 'actual' and v.completeness = 'complete' and v.observed_through is not null
       and not exists (select 1 from twin.state_elements x, jsonb_array_elements(coalesce(x.citations, '[]'::jsonb)) fc join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid
                       where x.twin_id = v.twin_id and x.version = v.version and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn') order by v.version desc limit 1`, [TWIN.id]);
  if (e && ['cancelled'].includes(e.state)) note(`the experiment ${short(e.id)} "${EXP_TITLE}" stands — CANCELLED in an earlier run`);
  else if (e && !['declared', 'approved', 'running', 'paused'].includes(e.state)) bad(`the experiment "${EXP_TITLE}" is ${e.state} (an earlier run did not cancel it)`);
  else {
    if (e === null) {
      const r = await sim(nakamura, 'declare', 'simulation.experiment.declare', { title: EXP_TITLE, question: 'Does a short probe of the corridor closure leave its completed paths recorded when it is cancelled?',
        run: { twinId: TWIN.id, twinVersion: VER.version, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, scenarioId: null, scenarioBranchId: null },
        paths: 4, chunkSize: 1, seed: 81, jitter: { 0: 0.5, 3: 0.3, 7: 0.2 }, measures: ['total_cost', 'line_stop_days'], budget: { max_paths: 4, max_wall_seconds: 900, max_chunks: 4 }, pace: { chunks_per_tick: 1 } });
      if (!r.ok) { fail('T. Nakamura declares the probe', r); }
      else ok(`T. Nakamura (twin owner) DECLARED the probe ${short(r.body.experiment.experiment_id)} on "${TWIN.title}" v${VER.version}: 4 paths, 1 a chunk, 1 chunk a tick — ${rcpt(r)}`);
      e = await expRow();
    }
    if (e && e.state === 'declared') {
      const x = await sim(weber, `${e.id}/read`, 'simulation.experiment.read', {}, e.id);
      const r = await sim(weber, `${e.id}/approve`, 'simulation.experiment.approve', { budgetDigest: x.body?.experiment?.budget_digest, note: 'a four-path probe within the corridor budget (SYNTHETIC)' }, e.id);
      if (!r.ok) fail('J. Weber approves the budget', r); else ok(`J. Weber (strategy owner — never the declarer) APPROVED the budget by the digest he read ${dg(x.body?.experiment?.budget_digest)} — ${rcpt(r)}`);
      e = await expRow();
    }
    if (e && e.state === 'approved') {
      const r = await sim(nakamura, `${e.id}/start`, 'simulation.experiment.start', {}, e.id);
      if (!r.ok) fail('T. Nakamura starts the probe', r); else ok(`T. Nakamura STARTED the probe: run ${short(r.body.experiment?.run_id ?? r.body.experiment?.run?.run_id)} — its chunks run in the attention agent's after-tick hook — ${rcpt(r)}`);
      e = await expRow();
    }
    if (e && e.state === 'running') {
      const t0 = Date.now();
      while (Number(e.progress?.chunks_done ?? 0) < 1 && Date.now() - t0 < 240_000 && e.state === 'running') { await sleep(5000); e = await expRow(); }
      note(`after ${Math.round((Date.now() - t0) / 1000)} s: ${e.progress?.chunks_done ?? 0} chunk(s) of 4 done (state ${e.state})`);
      if (e.state === 'running') {
        let r = await sim(nakamura, `${e.id}/cancel`, 'simulation.experiment.cancel', { reason: 'the probe has shown its first path; the rest is not needed — cancelled (SYNTHETIC)' }, e.id);
        if (!r.ok && r.status === 409 && /\(stale\)/.test(String(r.body?.message))) r = await sim(nakamura, `${e.id}/cancel`, 'simulation.experiment.cancel', { reason: 'the probe has shown its first path; the rest is not needed — cancelled (SYNTHETIC)' }, e.id);
        if (!r.ok) fail('T. Nakamura cancels the probe', r); else ok(`T. Nakamura CANCELLED the probe with a reason — ${rcpt(r)}`);
      }
      e = await expRow();
    }
    if (e && e.state !== 'cancelled') bad(`the probe is ${e?.state} — not cancelled`);
  }
  e = await expRow();
  if (e?.state === 'cancelled') {
    const o = e.outcome ?? {};
    const run = e.run ? await q1(`select state, partial, outputs_digest from simulation.runs_current where run_id = $1`, [e.run]) : null;
    (o.outcome === 'cancelled' ? ok : bad)(`THE RESIDUAL STATE: CANCELLED — new work stopped; ${o.completed_paths ?? 0} of ${o.declared_paths ?? 4} path(s) completed and recorded — NOT rolled back; the run ${String(run?.state ?? o.run_state).toUpperCase()}${run?.partial ? ' (partial)' : ''}, outputs digest ${dg(e.outputs ?? run?.outputs_digest)}; reason "${o.reason ?? '—'}"`);
    ENV_OUT.EYE_B81_EXPERIMENT = e.id;
  }
  note('a refused read hands back to the last verified location — the walk opens a warning link that does not exist (the RecoveryPanel: "Not opened", nothing changed, the safe next steps)');
}

/* ── B81-3 CONTENT AND TERMS ─────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-3 CONTENT AND TERMS (F-P7-E-18) — ASSESSED and "Close warning" made canonical by the Design System Authority (never the proposer); the catalogue; the content lint as a ratchet');
{
  const PRIN = 'design.content-governed';
  const pr = await q1(`select principle_key, version from governance.design_principles where principle_key = $1 and state <> 'superseded' limit 1`, [PRIN]);
  if (pr) note(`the principle ${PRIN} v${pr.version} stands — an earlier run`);
  else {
    const r = await P(dsa, `${DG}/principles/declare`, 'governance.design.principle.declare', { key: PRIN, expectedVersion: 0, kind: 'principle',
      statement: 'Product language is governed: every label names its verb and object, a destructive act states its scope and reversibility, an error says how to recover, and a canonical term is never diluted.',
      patterns: [], remediation: 'correct the label, the error text, the explanation or the title; else record a narrow, expiring design exception',
      reason: 'B81: the content lint dg-lint-3 evidences this principle (SYNTHETIC demonstration)' }, 'DSP');
    if (!r.ok) fail(`L. Haddad declares the principle ${PRIN}`, r); else ok(`L. Haddad (human gate) DECLARED the principle ${PRIN} — dg-lint-3's findings evidence it — ${rcpt(r)}`);
  }
  const termRow = async (key) => q1(`select term_id::text id, version, state, digest, proposed_by::text proposed_by from governance.terms where term_key = $1 and locale = 'en' order by version desc limit 1`, [key]);
  async function canonical(key, entry, what) {
    let t = await termRow(key);
    if (t?.state === 'published') { note(`${what} (${key}) v${t.version} is PUBLISHED: stands — an earlier run`); return t; }
    if (t === null) {
      const r = await P(dsa, `${TERMS}/propose`, 'governance.design.term.propose', { key, locale: 'en', expectedVersion: 0, entry }, 'TRM');
      if (!r.ok) { fail(`L. Haddad proposes ${what}`, r); return null; }
      ok(`L. Haddad PROPOSED ${what} (${key}) v${r.body.term.version}: digest ${dg(r.body.term.digest)}, reading levels ${Object.entries(r.body.term.reading_levels ?? {}).map(([k, v]) => `${k} ${typeof v === 'object' ? v.grade : v}`).join(', ')} — ${rcpt(r)}`);
      t = await termRow(key);
    }
    if (t.state === 'proposed') {
      const r = await P(steward, `${TERMS}/${t.id}/review`, 'governance.design.term.review', { version: t.version, digest: t.digest, outcome: 'ready', notes: 'read against the content principle: no dilution, every reading level within its ceiling (SYNTHETIC)' }, 'TRM', t.id);
      if (!r.ok) { fail(`P. Castellano reviews ${what}`, r); return null; }
      const c = r.body.review.checks ?? {};
      ok(`P. Castellano (conformance steward) REVIEWED it READY: dilution ${c.dilution?.length ?? c.dilution ?? 0 ? 'found' : 'none'}, reading ${Object.entries(c.reading ?? {}).map(([k, v]) => `${k} grade ${v.grade} ≤ ${v.ceiling}`).join(', ')} (rules ${c.rules_version}) — ${rcpt(r)}`);
      t = await termRow(key);
    }
    if (t.state === 'reviewed') {
      expectRefused(`L. Haddad (the PROPOSER) approves ${what}`, await P(dsa, `${TERMS}/${t.id}/approve`, 'governance.design.term.approve', { version: t.version, digest: t.digest, reason: 'approving my own proposal (refused)' }, 'TRM', t.id), 403, /separation_of_duties/);
      const r = await P(dsaOwner, `${TERMS}/${t.id}/approve`, 'governance.design.term.approve', { version: t.version, digest: t.digest, reason: 'the canonical term, its three explanations and its example are right (SYNTHETIC)' }, 'TRM', t.id);
      if (!r.ok) { fail(`S. Iversen approves ${what}`, r); return null; }
      ok(`S. Iversen (Design System Authority — never the proposer) APPROVED ${what} v${t.version} — ${rcpt(r)}`);
      t = await termRow(key);
    }
    if (t.state === 'approved') {
      const r = await P(dsaOwner, `${TERMS}/${t.id}/publish`, 'governance.design.term.publish', { version: t.version, digest: t.digest, reason: 'published as the canonical product term (SYNTHETIC)' }, 'TRM', t.id);
      if (!r.ok) { fail(`S. Iversen publishes ${what}`, r); return null; }
      ok(`S. Iversen PUBLISHED ${what} v${t.version}: ${r.body.term.state}${r.body.term.supersedes ? `, superseding v${r.body.term.supersedes}` : ''} — ${rcpt(r)}`);
      t = await termRow(key);
    }
    (t.state === 'published' ? ok : bad)(`${what} (${key}) v${t.version}: ${String(t.state).toUpperCase()}, proposed by ${nm(t.proposed_by)}`);
    return t;
  }
  await canonical('truth.assessed', { category: 'truth_state', label: 'ASSESSED', definition: 'Reviewed analytical judgment with uncertainty (TS-04): a named reviewer has judged the evidence and states how sure the judgment is.',
    explanations: { executive: 'ASSESSED means a reviewer has judged the evidence. The judgment can still be wrong. Read the uncertainty before you act.',
      analyst: 'ASSESSED: a reviewed analytical judgment. It states its uncertainty and its method.', operator: 'ASSESSED means a person checked it. There is still uncertainty.' },
    example: 'The corridor exposure is ASSESSED: the risk owner reviewed the transit evidence and states a medium uncertainty.', protected: ['uncertainty'],
    conditions: ['A named reviewer has reviewed the claim.'] }, 'the canonical term ASSESSED');
  await canonical('action.close-warning', { category: 'action', label: 'Close warning', definition: 'Ends a warning\'s open life with a stated criterion; the warning, its context and its feedback stay recorded and it is not reopened.',
    explanations: { executive: 'Close warning ends the alert. It stays on record. It cannot be opened again.', analyst: 'Close warning records the criterion that ended the alert; the record and its context are kept.',
      operator: 'Close warning ends the alert. The record stays. You cannot undo it.' },
    example: 'The risk owner used Close warning with the criterion "no longer relevant" when the corridor reopened.', synonyms: ['withdraw (a warning)'],
    conditions: ['The closer states the criterion and the reason.'] }, 'the canonical action "Close warning" (its non-canonical synonym "withdraw (a warning)")');
  const cat = await DM(brandt, `${DGD}/terms/catalogue/read`, 'governance.design.term.catalogue.read', { locale: 'en' }, 'TRM');
  if (!cat.ok) fail('L. Brandt reads the domain catalogue', cat);
  else {
    const a = (cat.body.terms ?? []).find((x) => x.key === 'truth.assessed');
    (a?.mark === 'canonical' && /reviewer has judged/.test(a?.entry?.explanations?.executive ?? '') ? ok : bad)(`L. Brandt's DOMAIN catalogue (what Term shows on hover and focus): ${(cat.body.terms ?? []).length} term(s); ASSESSED ${a?.mark ?? 'absent'} v${a?.entry?.version ?? '—'} — for executives: "${a?.entry?.explanations?.executive ?? '—'}"; content version ${cat.body.content_version?.value ?? '—'}`);
  }
  // the content lint (dg-lint-3) — a RATCHET: today's findings listed, the list only shrinks
  const L3 = await q1(`select evaluation_id::text id, verdict, counts, evaluated_at from governance.design_evaluations where source = 'lint' and rules_version = 'dg-lint-3' order by evaluated_at desc limit 1`).catch(() => null);
  if (L3) note(`the content lint ${short(L3.id)} (${L3.verdict}, ${JSON.stringify(L3.counts)}, ${iso(L3.evaluated_at)}) stands — an earlier run`);
  else {
    const r = await P(steward, `${TERMS}/content-lint`, 'governance.design.evaluate', {}, 'DSE');
    if (!r.ok) fail('P. Castellano runs the content lint', r);
    else {
      const e = r.body.evaluation; const rt = r.body.ratchet;
      (rt.holds ? ok : bad)(`P. Castellano ran the CONTENT LINT (dg-lint-3) over the real web source: ${e.files} files, verdict ${String(e.verdict).toUpperCase()}, ${e.open} open finding(s) STATED (${Object.entries(e.counts ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}); THE RATCHET ${rt.holds ? 'HOLDS' : 'BROKEN'} — baseline ${rt.baseline}, current ${rt.current}, ${rt.resolved} resolved, ${(rt.regressions ?? []).length} regression(s) (evidence ${short(e.evaluation_id)}) — ${rcpt(r)}`);
    }
  }
  note('the warning\'s destructive command (Close warning, criterion "no longer relevant") states its scope, that it cannot be undone and what is kept — the walk reads it on the warning page (never closed here)');
}

/* ── B81-4 OBJECT PAGES ──────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-4 OBJECT PAGES (F-P7-E-06) — one header grammar on the warning, a forecast, a twin snapshot and the package; the warning at two recorded instants ("acted by"); the package\'s approvers');
{
  const W = await q1(`select warning_id::text id, state, routed_to::text routed from prediction.warnings_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, W_TITLE]);
  const F = await q1(`select forecast_id::text id, series_key, horizon_code from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and issued_by = $3 and series_key like 'portwatch:%' and state <> 'withdrawn' order by issued_at desc limit 1`, [T, D, eriksen.principalId]);
  const TV = await q1(`select (details ->> 'version')::int v from twin.twin_events where twin_id = $1 and event = 'version.admitted' and actor_principal_id = $2 order by occurred_at desc limit 1`, [TWIN.id, nakamura.principalId]);
  if (!W || !F || !TV) bad(`an object is missing: the warning ${!!W}, N. Eriksen's forecast ${!!F}, T. Nakamura's twin snapshot ${!!TV}`);
  const read = async (s, path, action, objectType, id, purpose) => DM(s, path, action, {}, objectType, id, purpose);
  const lines = [];
  if (W) { const r = await read(brandt, `${BASE}/prediction/warnings/${W.id}/get`, 'prediction.read', 'WRN', W.id, 'prediction'); lines.push(r.ok ? `WARNING ${short(W.id)} "${r.body.warning.title.slice(0, 60)}…" — state ${r.body.warning.state}, routed owner ${nm(r.body.warning.routed_to)}, durable reference eye:WRN:${W.id}` : `warning: ${refusalLine(r)}`); if (!r.ok) fail('the warning read', r); }
  if (F) { const r = await read(brandt, `${BASE}/prediction/forecasts/${F.id}/get`, 'prediction.read', 'FCT', F.id, 'prediction'); lines.push(r.ok ? `FORECAST ${short(F.id)} "${r.body.forecast.series_key} · ${r.body.forecast.horizon_code}" — issuing owner ${nm(r.body.forecast.issued_by)}, an immutable record, eye:FCT:${F.id}` : `forecast: ${refusalLine(r)}`); if (!r.ok) fail('the forecast read', r); }
  if (TV) { const r = await read(brandt, `${BASE}/twins/${TWIN.id}/get`, 'twin.read', 'TWN', TWIN.id, 'twin'); lines.push(r.ok ? `TWIN SNAPSHOT "${r.body.twin.title} — v${TV.v}" — owner ${nm(r.body.twin.owner_principal_id)}, admitted by T. Nakamura, eye:TWN:${TWIN.id}:v${TV.v}` : `twin: ${refusalLine(r)}`); if (!r.ok) fail('the twin read', r); }
  { const r = await read(brandt, `${DEC}/${PKG}/get`, 'decision.read', 'DPK', PKG, 'decision'); lines.push(r.ok ? `DECISION PACKAGE "${r.body.package.title}" — state ${r.body.package.state}, owner ${nm(r.body.package.owner_principal_id)}, eye:DPK:${PKG}:v${V}` : `package: ${refusalLine(r)}`); if (!r.ok) fail('the package read', r); }
  (lines.length === 4 ? ok : bad)(`THE SAME HEADER GRAMMAR (type · canonical name · immutable identifier · version · owner · lifecycle · durable reference) on four types:\n      ${lines.join('\n      ')}`);
  if (W) {
    const ev = await q(`select event, occurred_at, actor_principal_id::text actor, to_char((date_trunc('second', occurred_at) + interval '1 second') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') at_s from prediction.warning_events where warning_id = $1 order by occurred_at, event_id`, [W.id]);
    const asOf = (at) => DM(brandt, `${SHL}/links/warnings/${W.id}/as-of`, 'prediction.read', { at }, 'WRN', W.id, 'navigation');
    const first = ev[0]; const last = ev[ev.length - 1];
    const a = await asOf(first.at_s); const b = await asOf(last.at_s);
    if (!a.ok || !b.ok) fail('the warning compared at two instants', a.ok ? b : a);
    else {
      const names = new Map((await q(`select id::text id, kind, split_part(display_name, ' — ', 1) n from identity.principals where id = any($1::uuid[])`, [ev.map((x) => x.actor).filter(Boolean)])).map((x) => [x.id, `${x.n}${x.kind === 'agent' ? ' (an agent)' : ''}`]));
      const actor = (x) => (x ? NAME[x] ?? names.get(x) ?? short(x) : 'the system (no person recorded)');
      ok(`THE WARNING AT TWO RECORDED INSTANTS: before — instant 1 "${first.event.replace('warning.', '')}" ${iso(first.occurred_at)} · ${String(a.body.warning.as_of.state).toUpperCase()} · acted by ${actor(first.actor)}; after — instant ${ev.length} "${last.event.replace('warning.', '')}" ${iso(last.occurred_at)} · ${String(b.body.warning.as_of.state).toUpperCase()} · acted by ${actor(last.actor)}; context versions ${a.body.warning.as_of.context_version} → ${b.body.warning.as_of.context_version} — the column reads "acted by": a warning carries no approval`);
      ENV_OUT.EYE_B81_WARNING = W.id; ENV_OUT.EYE_B81_AS_OF_FIRST = first.at_s; ENV_OUT.EYE_B81_WARNING_OWNER = W.routed === eriksen.principalId ? 'n.eriksen' : (await q1(`select login_name from identity.principals where id = $1`, [W.routed]))?.login_name ?? 'n.eriksen';
    }
  }
  const apv = await q(`select v.version, v.state, a.approver_principal_id::text approver, a.decision, a.revoked_at from decision.package_versions v left join decision.approvals a on a.package_id = v.package_id and a.version = v.version where v.package_id = $1 order by v.version`, [PKG]);
  (apv.some((x) => x.approver === okafor.principalId && x.decision === 'approve' && x.revoked_at === null) ? ok : bad)(`THE PACKAGE'S VERSIONS with their ACTUAL approvers: ${apv.map((x) => `v${x.version} ${x.state} — ${x.approver ? `${x.decision} by ${nm(x.approver)}${x.revoked_at ? ' (revoked)' : ''}` : 'no approval recorded'}`).join('; ')}`);
  if (F) ENV_OUT.EYE_B81_FORECAST = F.id;
  if (TV) { ENV_OUT.EYE_B81_TWIN = TWIN.id; ENV_OUT.EYE_B81_TWIN_VERSION = TV.v; }
}

/* ── B81-5 LAYOUT AND WINDOWS ────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-5 LAYOUT AND WINDOWS (F-P7-E-04) — L. Brandt\'s density; the operations room on the display; the review handed off from his desk to his second session; the desk\'s next publish refused');
{
  const DISPLAY = 'operations-room';
  const prefs = (s) => DM(s, `${SHL}/preferences/read`, 'shell.preferences.read', { composition: 'default', history: 3 }, 'PRF', null, 'navigation');
  const p0 = await prefs(brandt);
  if (!p0.ok) fail('L. Brandt reads his preferences', p0);
  else {
    const cur = (p0.body.preferences.compositions ?? []).find((c) => c.composition === 'default')?.current ?? null;
    if (cur?.density === 'DEN-01') note(`L. Brandt's density is STRATEGIC (DEN-01) v${cur.version}: stands — an earlier run`);
    else {
      const r = await DM(brandt, `${SHL}/preferences/save`, 'shell.preferences.save', { composition: 'default', expectedVersion: cur?.version ?? 0, density: 'DEN-01', layout: cur?.layout ?? {} }, 'PRF', null, 'navigation');
      if (!r.ok) fail('L. Brandt switches to the strategic density', r); else ok(`L. Brandt SWITCHED his density to STRATEGIC (DEN-01 — 44 px controls) v${r.body.preference.version} — his own preference, never anyone else's — ${rcpt(r)}`);
    }
  }
  // THE DESK (session A — the act's own L. Brandt session) and THE TABLET (session B — a second sign-in of the same person)
  const desk = brandt;
  const tablet = { ...(await who('l.brandt')), login: 'l.brandt' };
  const presRead = (s) => DM(s, `${SHL}/presentations/read`, 'shell.presentation.read', { display: DISPLAY, history: 3 }, 'PRS', null, 'navigation');
  const claimedEarlier = await q1(`select h.handoff_id::text id, r.closed_at, r.roles_at_claim from shell.session_handoffs h join shell.session_handoff_receipts r on r.handoff_id = h.handoff_id
      where h.principal_id = $1 and h.display = $2 and r.outcome = 'claimed' order by r.closed_at desc limit 1`, [brandt.principalId, DISPLAY]).catch(() => null);
  const pkgLocation = { route: '/decisions', query: `package=${PKG}`, selection: [{ kind: 'package', id: PKG, version: V }], title: `${PACKAGE_TITLE} — v${V}` };
  if (claimedEarlier) note(`the handoff ${short(claimedEarlier.id)} of the room was claimed by L. Brandt's second session at ${iso(claimedEarlier.closed_at)} (roles re-read: ${(claimedEarlier.roles_at_claim ?? []).join(', ')}): stands — an earlier run`);
  else {
    const r0 = await presRead(desk);
    const cur = r0.ok ? (r0.body.presentations.displays ?? []).find((d) => d.display === DISPLAY)?.current ?? null : null;
    const pub = await DM(desk, `${SHL}/presentations/publish`, 'shell.presentation.publish', { display: DISPLAY, expectedVersion: cur?.version ?? 0, status: 'presenting',
      location: { route: '/home/operations-room', title: 'Operations room — the corridor, the warning queue, the twin state' }, viewContext: { classification: 'internal' },
      watermark: new Date(Date.now() - 1000).toISOString(), classification: 'internal', audience: 'operations_centre' }, 'PRS', null, 'navigation');
    if (!pub.ok) fail('L. Brandt\'s desk publishes the room to the display', pub);
    else ok(`L. Brandt's DESK PUBLISHED the operations room to the display ${DISPLAY} v${pub.body.presentation.version} (presenting, internal, an operations centre) — the desk is its ONE control surface; the display renders no control — ${rcpt(pub)}`);
    const off = await DM(desk, `${SHL}/handoffs/offer`, 'shell.handoff.offer', { workspace: 'decisions', location: pkgLocation, viewContext: { classification: 'internal' }, display: DISPLAY, targetDevice: 'tablet', expiresInSeconds: 600 }, 'HND', null, 'navigation');
    if (!off.ok) fail('L. Brandt offers the handoff', off);
    else {
      const h = off.body.handoff;
      ok(`L. Brandt's desk OFFERED a handoff ${short(h.handoff_id)} of the package review (route /decisions, the package selected at v${V}) with the display's control, for 10 minutes — single use — ${rcpt(off)}`);
      expectRefused('the DESK claims its own offer', await DM(desk, `${SHL}/handoffs/claim`, 'shell.handoff.claim', { handoffId: h.handoff_id }, 'HND', null, 'navigation'), 409, /this is the session that offered the handoff/);
      const cl = await DM(tablet, `${SHL}/handoffs/claim`, 'shell.handoff.claim', { handoffId: h.handoff_id }, 'HND', null, 'navigation');
      if (!cl.ok) fail('L. Brandt\'s second session claims the handoff', cl);
      else {
        const c = cl.body.handoff;
        (c.status === 'claimed' && c.authority?.inherited === false ? ok : bad)(`L. Brandt's SECOND SESSION (the tablet, signed in on its own) CLAIMED it: receipt ${short(c.receipt?.receipt_id)} at ${iso(c.receipt?.closed_at)}; the review restored at ${c.location?.route}?${c.location?.query ?? ''} (selection ${c.location?.selection?.map((x) => `${x.kind} v${x.version}`).join(', ')}); authority NOT inherited — the roles re-read: ${(c.authority?.roles ?? []).join(', ')}; the display moved with it${c.presentation ? ` (v${c.presentation.version}, transfer ${c.presentation.transfer})` : ''} — ${c.claim ?? ''}`);
        expectRefused('the SAME handoff claimed a second time', await DM(tablet, `${SHL}/handoffs/claim`, 'shell.handoff.claim', { handoffId: h.handoff_id }, 'HND', null, 'navigation'), 409, /single use|already/);
      }
    }
  }
  // the desk's next publish: the display is controlled by another of his sessions now — refused (a second window never takes control silently)
  const r1 = await presRead(desk);
  const cur1 = r1.ok ? (r1.body.presentations.displays ?? []).find((d) => d.display === DISPLAY)?.current ?? null : null;
  if (cur1 === null) bad('the display\'s state could not be read');
  else if (cur1.control_session_here === true) bad(`the desk still controls the display ${DISPLAY} v${cur1.version} — the handoff did not move it`);
  else if (cur1.control_available !== true) note(`the display ${DISPLAY} v${cur1.version}: the session that claimed its control has ended — no live control session, so the desk's refusal is not shown on this run (it was when the handoff ran)`);
  else {
    expectRefused('L. Brandt\'s DESK publishes to the display again', await DM(desk, `${SHL}/presentations/publish`, 'shell.presentation.publish', { display: DISPLAY, expectedVersion: cur1.version, status: 'presenting',
      location: { route: '/home/operations-room', title: 'Operations room (the desk again)' }, viewContext: { classification: 'internal' }, watermark: new Date(Date.now() - 1000).toISOString(), classification: 'internal', audience: 'operations_centre' }, 'PRS', null, 'navigation'),
      409, /^presentation state rejected \(state\): the display operations-room is controlled by another of your signed-in sessions/);
    note(`the display ${DISPLAY} v${cur1.version}: ${cur1.status}, transfer ${cur1.transfer ?? '—'}, watermark ${iso(cur1.watermark)}, ${cur1.classification}, ${cur1.audience} — the presentation route (/present) shows it without a single control`);
  }
  ENV_OUT.EYE_B81_DISPLAY = DISPLAY;
}

/* ── B81-6 SEARCH AND INTENT ─────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-6 SEARCH AND INTENT (F-P7-E-02) — A. Hoffmann asks "Bab el-Mandeb exposure Regensburg": the deterministic reading, the bounded clarification with nothing preselected, the saved search, a command handed to its review — nothing executed');
const INPUT = 'Bab el-Mandeb exposure Regensburg';
const SAVED_NAME = 'Bab el-Mandeb exposure — Regensburg (B81, SYNTHETIC)';
{
  const s = hoffmann;
  // THE FIVE GOVERNED READS the search page runs (search-b81.ts runFederated), each its own audited read with its own receipt
  const legs = []; const hits = [];
  const contains = (label, ps) => ps.some((p) => label.toLowerCase().includes(p.toLowerCase()));
  const reading0 = interpret(INPUT, { mode: 'ask' });
  const phrases = reading0.phrases.slice(0, 4);
  note(`the palette's reading BEFORE any read (Ask mode, ${INTERPRETER_VERSION}): kinds ${JSON.stringify(reading0.kinds)}, phrases ${JSON.stringify(phrases)}, scoped query "${reading0.scopedQuery}" — ${reading0.uncertainty.join('; ')}`);
  for (const p of phrases) {
    const r = await DM(s, `${BASE}/graph/search`, 'graph.read', { query: p }, 'SRC', null, 'graph');
    if (!r.ok) { legs.push({ leg: 'graph', receipt: null, state: r.status === 403 ? 'refused' : 'failed', note: String(r.body?.message ?? 'the read could not be completed').slice(0, 500) }); continue; }
    const x = r.body.search;
    const bounded = !(x.complete?.entities && x.complete?.objects);
    legs.push({ leg: 'graph', receipt: r.body.receipt.policyDecisionId, state: bounded ? 'bounded' : 'complete', note: x.note ?? null });
    for (const h of [...(x.entities ?? []), ...(x.claims ?? []), ...(x.evidence ?? [])]) {
      const type = h.kind === 'entity' ? 'ENT' : h.kind === 'claim' ? 'CLM' : 'EVD';
      const v = h.extra?.object_version;
      hits.push({ key: `${type}:${h.id}`, leg: 'graph', kind: h.kind, id: h.id, version: typeof v === 'number' ? v : null, label: h.label, href: '/graph/search' });
    }
  }
  const leg = async (name, path, action, objectType, purpose, payload, take) => {
    const r = await DM(s, `${BASE}${path}`, action, payload, objectType, null, purpose);
    if (!r.ok) { legs.push({ leg: name, receipt: null, state: r.status === 403 ? 'refused' : 'failed', note: String(r.body?.message ?? 'the read could not be completed').slice(0, 500) }); return; }
    legs.push({ leg: name, receipt: r.body.receipt.policyDecisionId, state: 'complete', note: null });
    hits.push(...take(r.body));
  };
  await leg('strategy', '/graph/strategy/list', 'graph.read', 'OBJ', 'graph', { limit: 300 }, (b) => (b.strategy ?? []).filter((x) => x.status !== 'withdrawn' && contains(x.title, phrases))
    .map((x) => ({ key: `${x.object_type}:${x.strategy_object_id}`, leg: 'strategy', kind: STRATEGY_KINDS[x.object_type] ?? x.object_type.toLowerCase(), id: x.strategy_object_id, version: x.object_version, label: x.title, href: '/graph/strategy' })));
  await leg('catalog', '/products/catalog/search', 'products.catalog.search', 'CAT', 'executive', { q: phrases.join(' '), kinds: null, limit: 50 }, (b) => (b.search?.hits ?? [])
    .map((a) => ({ key: `CAT:${a.asset_id}`, leg: 'catalog', kind: a.kind, id: a.asset_id, version: null, label: a.title, href: '/graph/data/catalog' })));
  await leg('exposures', '/prediction/exposures/list', 'prediction.exposure.read', 'RSK', 'prediction', {}, (b) => [...(b.risks ?? []), ...(b.opportunities ?? [])].filter((e) => contains(`${e.title ?? ''} ${e.statement ?? ''}`, phrases))
    .map((e) => ({ key: `RSK:${e.exposure_id}`, leg: 'exposures', kind: 'exposure', id: e.exposure_id, version: e.current_version, label: e.title ?? e.exposure_id, href: '/prediction/exposures' })));
  await leg('packages', '/decisions/list', 'decision.read', 'DPK', 'decision', {}, (b) => (b.packages ?? []).filter((p) => contains(`${p.title} ${p.statement}`, phrases))
    .map((p) => ({ key: `DPK:${p.package_id}`, leg: 'packages', kind: 'package', id: p.package_id, version: p.current_version, label: p.title, href: `/decisions/packages/${p.package_id}` })));
  const seen = new Map(); for (const h of hits) if (!seen.has(`${h.leg}|${h.key}`)) seen.set(`${h.leg}|${h.key}`, h);
  const all = [...seen.values()];
  ok(`the FEDERATED READS (one receipt each): ${legs.map((l) => `${l.leg} ${l.state.toUpperCase()}${l.receipt ? '' : ` — ${l.note}`}`).join(' · ')}; ${all.length} record(s) — ${['graph', 'strategy', 'catalog', 'exposures', 'packages'].map((k) => `${k} ${all.filter((h) => h.leg === k).length}`).join(', ')}`);
  const reading = interpret(INPUT, { mode: 'ask', hits: all });
  if (reading.kind !== 'ambiguous') bad(`the reading is ${reading.kind}, not a clarification — ${reading.uncertainty.join('; ')}`);
  else {
    const preselected = reading.alternatives.some((a) => ['selected', 'preselected', 'default', 'chosen', 'recommended'].some((k) => k in a)) || reading.chosen !== null;
    (reading.alternatives.length >= 2 && !preselected ? ok : bad)(`THE BOUNDED CLARIFICATION (the phrase "${reading.ambiguousPhrase}"): ${reading.clarification} — ${reading.alternatives.length} alternative(s), NOTHING PRESELECTED; the original input kept as typed`);
    if (reading.ambiguousPhrase !== 'Regensburg') note(`the interpreter asks about the FIRST phrase that names more than one record — "${reading.ambiguousPhrase}" — before "Regensburg" (deterministic, ${INTERPRETER_VERSION}); the Regensburg objects (${all.filter((h) => /regensburg/i.test(h.label) && h.leg === 'strategy').map((h) => `${h.kind} "${h.label}"`).join(', ') || 'none'}) are among the results it scopes`);
  }
  // her CHOICE (the exposure, when offered; else the first alternative) — the intent record: the input, the reading, the alternatives, the choice
  const pick = reading.kind === 'ambiguous' ? (reading.alternatives.find((a) => a.kind === 'exposure') ?? reading.alternatives.find((a) => a.label === PACKAGE_TITLE) ?? reading.alternatives[0]) : null;
  const intents = async () => q(`select intent_id::text id, outcome, choice, clarification, command_action, interpreter from shell.intent_records where principal_id = $1 and input = $2 order by recorded_at`, [s.principalId, INPUT]).catch(() => []);
  let INT = (await intents()).find((x) => x.outcome === 'chosen') ?? null;
  if (INT) note(`A. Hoffmann's intent record ${short(INT.id)} (chosen, ${INT.interpreter}) stands — an earlier run`);
  else if (pick) {
    const intake = intentRecordOf(reading, { outcome: 'chosen', choice: pick.key });
    if (typeof intake === 'string') bad(`the intent record could not be formed: ${intake}`);
    else {
      expectRefused('an intent record with an alternative PRESELECTED', await DM(s, `${SHL}/intents/record`, 'shell.intent.record', { ...intake, alternatives: intake.alternatives.map((a, i) => (i === 0 ? { ...a, preselected: true } : a)) }, 'ITN', null, 'navigation'), 422, /\(preselected\)/);
      const r = await DM(s, `${SHL}/intents/record`, 'shell.intent.record', intake, 'ITN', null, 'navigation');
      if (!r.ok) fail('A. Hoffmann\'s intent record', r);
      else ok(`A. Hoffmann CHOSE "${pick.label}" (${pick.kind}) — the INTENT RECORD ${short(r.body.intent.intent_id)}: mode ask, interpreter ${r.body.intent.interpreter}, ${r.body.intent.alternatives.length} alternatives offered, the clarification kept, outcome ${r.body.intent.outcome}, executed ${r.body.intent.executed} — ${rcpt(r)}`);
    }
    INT = (await intents()).find((x) => x.outcome === 'chosen') ?? null;
  }
  // THE SAVED SEARCH: the exact result set (narrowed by her choice), its legs' receipts, the cutoff and the policy version — reopened exactly
  const rd = await DM(s, `${SHL}/search/read`, 'shell.search.read', { savedSearchId: null, history: 5 }, 'SRH', null, 'navigation');
  const mine = rd.ok ? (rd.body.searches.saved ?? []).find((x) => x.name === SAVED_NAME) : null;
  let SAVED = mine?.current ?? null;
  if (SAVED) note(`the saved search "${SAVED_NAME}" v${SAVED.version} stands — an earlier run (cutoff ${iso(SAVED.cutoff)}, policy ${SAVED.policy_version}, ${SAVED.result_count} records)`);
  else {
    const others = new Set(reading.kind === 'ambiguous' ? reading.alternatives.map((a) => a.key).filter((k) => k !== pick?.key) : []);
    const whole = (v) => (v === null || v === undefined || !Number.isInteger(Number(v)) ? null : Number(v));
    const results = all.filter((h) => !others.has(h.key)).slice(0, 500).map((h) => ({ leg: h.leg, kind: h.kind, id: h.id, version: whole(h.version), label: String(h.label).slice(0, 300) }));
    const legsOut = []; const refused = new Set();
    for (const l of legs) { if (l.receipt === null) { if (refused.has(l.leg)) continue; refused.add(l.leg); } legsOut.push(l); }
    const r = await DM(s, `${SHL}/search/save`, 'shell.search.save', { name: SAVED_NAME, expectedVersion: 0, query: INPUT,
      intent: { mode: 'ask', interpreter: INTERPRETER_VERSION, kind: reading.kind, scoped_query: reading.scopedQuery, kinds: reading.kinds, terms: reading.phrases, choice: pick?.key ?? null },
      filters: { kinds: reading.kinds }, legs: legsOut, results, intentRecordId: INT?.id ?? null }, 'SRH', null, 'navigation');
    if (!r.ok) fail('A. Hoffmann saves the search', r);
    else { SAVED = r.body.savedSearch; ok(`A. Hoffmann SAVED the search "${SAVED_NAME}" v${SAVED.version}: ${SAVED.result_count} records (digest ${dg(SAVED.result_digest)}), CUTOFF ${iso(SAVED.cutoff)} (read from ${iso(SAVED.read_from)}), POLICY ${SAVED.policy_version} — ${rcpt(r)}`); }
  }
  if (SAVED) {
    const ex = await DM(s, `${SHL}/search/read`, 'shell.search.read', { savedSearchId: SAVED.saved_search_id, history: 1 }, 'SRH', null, 'navigation');
    (ex.ok && ex.body.searches.exact?.digest_ok === true ? ok : bad)(`the saved search REOPENED EXACTLY: v${ex.body?.searches?.exact?.version} — ${ex.body?.searches?.exact?.result_count} records, the digest ${ex.body?.searches?.exact?.digest_ok ? 'VERIFIED' : 'NOT verified'}; the live re-run is shown BESIDE it (the drift), never as the saved result`);
    ENV_OUT.EYE_B81_SAVED_SEARCH = SAVED.saved_search_id;
  }
  // THE COMMAND: "approve corridor reroute" — recorded only as the hand-off to the package's Command Review; nothing executed
  const CMD = 'approve corridor reroute';
  const cr = interpret(CMD, { mode: 'command', hits: all.filter((h) => h.leg === 'packages').length > 0 ? all : [{ key: `DPK:${PKG}`, leg: 'packages', kind: 'package', id: PKG, label: PACKAGE_TITLE, href: `/decisions/packages/${PKG}` }] });
  const handoff = cr.handoffs[0]?.href ?? null;
  const cmdRec = await q1(`select intent_id::text id, command_action from shell.intent_records where principal_id = $1 and input = $2 and outcome = 'command_review' limit 1`, [s.principalId, CMD]).catch(() => null);
  const approvalsBefore = (await q1(`select count(*)::int n from decision.approvals where package_id = $1`, [PKG])).n;
  if (cmdRec) note(`the command's intent record ${short(cmdRec.id)} (command_review → ${cmdRec.command_action}) stands — an earlier run`);
  else {
    const intake = intentRecordOf(cr, { outcome: 'command_review', choice: cr.alternatives.length > 1 ? cr.alternatives[0].key : (cr.alternatives[0]?.key ?? null) });
    if (typeof intake === 'string') bad(`the command's intent record could not be formed: ${intake}`);
    else {
      expectRefused('the command recorded as EXECUTED', await DM(s, `${SHL}/intents/record`, 'shell.intent.record', { ...intake, outcome: 'executed' }, 'ITN', null, 'navigation'), 422);
      const r = await DM(s, `${SHL}/intents/record`, 'shell.intent.record', intake, 'ITN', null, 'navigation');
      if (!r.ok) fail('the command\'s intent record', r);
      else ok(`"${CMD}" read as the command ${cr.command?.action} (${cr.kind}) — recorded ONLY as the hand-off to its Command Review: ${handoff} (outcome ${r.body.intent.outcome}, executed ${r.body.intent.executed}) — ${rcpt(r)}`);
    }
  }
  const approvalsAfter = (await q1(`select count(*)::int n from decision.approvals where package_id = $1`, [PKG])).n;
  (approvalsAfter === approvalsBefore ? ok : bad)(`NOTHING EXECUTED: the package carries ${approvalsAfter} approval(s) before and after the command's hand-off`);
  ENV_OUT.EYE_B81_ANALYST = 'a.hoffmann'; ENV_OUT.EYE_B81_PALETTE_INPUT = INPUT;
}

/* ── B81-7 §RE ───────────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB81-7 §RE (B80\'s residues) — the inventory re-read, the library lint conformant, the contributions for GovernedButton, TruthBadge and LifecycleBadge, the upload mode on the AIS source');
const B81_FILES = ['authority', 'recovery', 'object', 'help', 'layout', 'command-environment'];
const libRows = async () => q(`select asset_id::text id, asset_key k, version, status, digest, owner_principal_id::text owner from governance.design_assets where superseded_at is null and asset_key ~ $1 order by asset_key`, [`^web\\.(${B81_FILES.join('|')})\\.`]);
let EVAL2 = null;
{
  let lib = await libRows();
  const reg = lib.length > 0 ? null : await P(steward, `${DG}/assets/register`, 'governance.design.asset.register', {}, 'DSA');
  if (reg === null) note(`B81's library is in the inventory (${lib.length} components): stands — an earlier run`);
  else if (!reg.ok) fail('P. Castellano re-reads and registers the design inventory', reg);
  else {
    const inv = reg.body.inventory;
    const mine = (inv.registered ?? []).filter((x) => B81_FILES.some((f) => x.key.startsWith(`web.${f}.`)));
    (mine.length > 0 ? ok : bad)(`P. Castellano (conformance steward) re-read the inventory from the repository: ${(inv.registered ?? []).length} new asset(s) registered (${mine.length} of B81's library), ${inv.unchanged} unchanged; DRIFT STATED (the inventory changes nothing — a contribution records it): ${(inv.drift ?? []).map((x) => x.key).join(', ') || 'none'}`);
  }
  // THE LIBRARY LINT (dg-lint-2) — the 20 local Field forks are gone: CONFORMANT, 0 findings (and the contributions' conformant evaluation)
  const regAt = (await q1(`select min(registered_at) t from governance.design_assets where asset_key ~ $1`, [`^web\\.(${B81_FILES.join('|')})\\.`]))?.t ?? null;
  EVAL2 = await q1(`select evaluation_id::text id, verdict, counts, evaluated_at, digest from governance.design_evaluations where source = 'lint' and rules_version = 'dg-lint-2' and verdict = 'conformant' and evaluated_at >= $1 order by evaluated_at desc limit 1`, [regAt ?? new Date(0)]);
  if (EVAL2) note(`the conformant library lint ${short(EVAL2.id)} (${JSON.stringify(EVAL2.counts)}, ${iso(EVAL2.evaluated_at)}) stands — an earlier run`);
  else {
    const l = await P(steward, `${DG}/library/lint`, 'governance.design.evaluate', {}, 'DSE');
    if (!l.ok) fail('P. Castellano runs the library lint', l);
    else {
      const e = l.body.evaluation;
      (e.verdict === 'conformant' && (e.findings ?? []).length === 0 ? ok : bad)(`P. Castellano ran the LIBRARY LINT (dg-lint-2) over the real web source: ${e.files} files, ${e.library} library components, verdict ${String(e.verdict).toUpperCase()}, ${(e.findings ?? []).length} finding(s) — library-fork ${e.counts?.['library-fork'] ?? 0}, token-redefinition ${e.counts?.['token-redefinition'] ?? 0}: the local Field forks are migrated onto the library (evidence ${short(e.evaluation_id)}) — ${rcpt(l)}`);
    }
    EVAL2 = await q1(`select evaluation_id::text id, verdict, counts, evaluated_at, digest from governance.design_evaluations where source = 'lint' and rules_version = 'dg-lint-2' and verdict = 'conformant' order by evaluated_at desc limit 1`);
  }
  // THE CONTRIBUTIONS (B107's queue): proposed by S. Iversen, her own acceptance refused, reviewed / accepted (signed) / published by L. Haddad
  const CONTRIBS = [
    ['web.observation.governed-button', 'GovernedButton holds when its region is frozen: disabled, the reason beside it, never run (PR-05-005, UX-09-005; B81 §RE) (SYNTHETIC)', 'additive: an optional frozen prop; the receipt contract is unchanged'],
    ['web.ui.truth-badge', 'TruthBadge renders the symbol set\'s glyph beside the truth word — the name kept, colour never alone (UX-20-001; B81 §RE) (SYNTHETIC)', 'additive: the glyph joins the word; the props are unchanged'],
    ['web.ui.lifecycle-badge', 'LifecycleBadge names the LS lifecycle code and its definition per object type (LS-01…LS-12; B81 §OB/§RE) (SYNTHETIC)', 'additive: one optional type prop; the props contract is kept'],
  ];
  const lines = [];
  for (const [key, summary, compat] of CONTRIBS) {
    const asset = await q1(`select asset_id::text id, version, package_version, owner_principal_id::text owner from governance.design_assets where superseded_at is null and asset_key = $1`, [key]);
    if (!asset) { bad(`the asset ${key} is not in the inventory`); continue; }
    let c = await q1(`select contribution_id::text id, revision, stage, digest, published_version from governance.design_contributions where summary = $1 order by revision desc limit 1`, [summary]);
    if (c === null) {
      const next = asset.package_version === '0.0.1' ? '0.0.2' : `0.0.${Number(asset.package_version.split('.')[2] ?? 1) + 1}`;
      const r = await P(dsaOwner, `${DG}/contributions/propose`, 'governance.design.contribution.propose', { kind: 'component_change', targetAssetId: asset.id, summary,
        proposal: { packageVersion: next, ownerPrincipalId: asset.owner ?? dsaOwner.principalId },
        plans: { compatibility: compat, consumers: 'every page that renders it keeps rendering; the compatibility gate reads the props contract', migration: 'none required — the change is in the shared component',
          rollback: `revert to ${asset.package_version}`, tests: ['apps/web/lib/catalogue-re-b81.test.ts', 'e2e/phase6-b81-re.demo.spec.ts'], evaluationId: EVAL2?.id ?? null } }, 'DSC');
      if (!r.ok) { fail(`S. Iversen proposes the contribution for ${key}`, r); continue; }
      c = { id: r.body.contribution.contribution_id, revision: r.body.contribution.revision, stage: r.body.contribution.stage, digest: r.body.contribution.digest };
      lines.push(`${key}: PROPOSED by S. Iversen (${(r.body.contribution.blockers ?? []).length} blocker(s))`);
    }
    if (c.stage === 'proposed') {
      const r = await P(dsa, `${DG}/contributions/${c.id}/review`, 'governance.design.contribution.review', { revision: c.revision, reason: 'reviewed against the principles, the props contract and the conformant library lint (SYNTHETIC)' }, 'DSC', c.id);
      if (!r.ok) { fail(`L. Haddad reviews the contribution for ${key}`, r); continue; }
      c = await q1(`select contribution_id::text id, revision, stage, digest, published_version from governance.design_contributions where contribution_id = $1`, [c.id]);
    }
    if (c.stage === 'in_review') {
      expectRefused(`S. Iversen (the PROPOSER) accepts the contribution for ${key}`, await P(dsaOwner, `${DG}/contributions/${c.id}/accept`, 'governance.design.contribution.accept', { revision: c.revision, digest: c.digest, reason: 'accepting my own contribution (refused)' }, 'DSC', c.id), 403, /separation_of_duties/);
      const r = await P(dsa, `${DG}/contributions/${c.id}/accept`, 'governance.design.contribution.accept', { revision: c.revision, digest: c.digest, reason: 'the change keeps the props contract and closes the residue (SYNTHETIC)' }, 'DSC', c.id);
      if (!r.ok) { fail(`L. Haddad accepts the contribution for ${key}`, r); continue; }
      c = await q1(`select contribution_id::text id, revision, stage, digest, published_version from governance.design_contributions where contribution_id = $1`, [c.id]);
    }
    if (c.stage === 'accepted') {
      const r = await P(dsa, `${DG}/contributions/${c.id}/publish`, 'governance.design.contribution.publish', { revision: c.revision, reason: 'published as the next version of the component (SYNTHETIC)' }, 'DSC', c.id);
      if (!r.ok) { fail(`L. Haddad publishes the contribution for ${key}`, r); continue; }
      c = await q1(`select contribution_id::text id, revision, stage, digest, published_version from governance.design_contributions where contribution_id = $1`, [c.id]);
    }
    lines.push(`${key}: ${String(c.stage).toUpperCase()}${c.published_version ? ` (v${c.published_version})` : ''}`);
    if (!['published', 'adopted', 'measured', 'closed'].includes(c.stage)) bad(`the contribution for ${key} is ${c.stage}`);
  }
  ok(`THE CONTRIBUTIONS (proposed by S. Iversen; reviewed, accepted — signed — and published by L. Haddad, never the proposer): ${lines.join('; ')}; the inventory's drift on the edited components stays STATED until the next registration reads them`);
  const ais = await q1(`select source_id::text id, connector_kind, lifecycle_state, contract_version from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'red-sea-ais-positions' and lifecycle_state = 'active' limit 1`, [T, D]);
  (ais?.connector_kind === 'upload' ? ok : bad)(`the AIS source's page places FileIntake in UPLOAD mode (connector ${ais?.connector_kind}, contract v${ais?.contract_version} ${ais?.lifecycle_state}): the disclosure before anything is sent — the walk reads it at /observation/sources/${ais?.id ?? '…'} (nothing is uploaded here)`);
  if (ais) ENV_OUT.EYE_B81_AIS_SOURCE = ais.id;
  note('the sign-in / deep-link return (UX-11-005) is the walk\'s: a signed-out browser opens the warning\'s as-of link, signs in, and lands on exactly that link');
}

/* ── B81-8 INVENTORY AND ACCEPTANCE DEMONSTRATION RECORDS ───────────────────────────────── */
await renewAll();
console.log('\nB81-8 THE INVENTORY AND THE ACCEPTANCE DEMONSTRATION RECORDS — B81\'s library approved with one owner, a B81 baseline, a design acceptance per chapter scope');
const CHAPTERS = [
  ['UX-12', 'F-P7-E-06', 'object identity and the canonical header'], ['UX-25', 'F-P7-E-06', 'object versions and comparison'],
  ['UX-13', 'F-P7-E-02', 'search, the palette and intent'], ['UX-14', 'F-P7-E-04', 'breakpoints, zoom and density'], ['UX-16', 'F-P7-E-04', 'multi-window, presentation and handoff'],
  ['UX-19', 'F-P7-E-04', 'spacing, regions and elevation'], ['UX-69', 'F-P7-E-18', 'terminology and content'], ['HX', 'F-P7-E-20', 'human authority and deliberate action'],
  ['REL', 'F-P7-E-19', 'degraded state, failure and recovery'],
];
{
  let lib = await libRows();
  let approved = 0; let stood = 0;
  for (const a of lib) {
    if (a.status === 'approved' && a.owner) { stood += 1; continue; }
    const r = await P(dsa, `${DG}/assets/${a.id}/approve`, 'governance.design.asset.approve', { version: a.version, digest: a.digest, ownerPrincipalId: dsaOwner.principalId,
      reason: `${a.k} — a B81 library component read against Volume 9 and its catalogue fixture (SYNTHETIC)` }, 'DSA', a.id);
    if (!r.ok) fail(`L. Haddad approves ${a.k}`, r); else approved += 1;
  }
  lib = await libRows();
  const owners = new Set(lib.map((a) => a.owner));
  (lib.length > 0 && lib.every((a) => a.status === 'approved') && owners.size === 1 && owners.has(dsaOwner.principalId) ? ok : bad)(`L. Haddad (Design System Authority, human gate) APPROVED ${approved} B81 library component(s)${stood ? ` (${stood} stand — an earlier run)` : ''}: ${lib.length} components across ${B81_FILES.length} files, each with ONE accountable owner — S. Iversen`);
  const EVAL = await q1(`select evaluation_id::text id, digest, evaluated_at, verdict from governance.design_evaluations where source = 'lint' and evaluated_by = $1 order by evaluated_at desc limit 1`, [steward.principalId]);
  const DBL_TITLE = 'The Eye design baseline 2026-10 — B81 patterns, layout and content (SYNTHETIC demonstration)';
  const tokensVersion = JSON.parse(readFileSync(join(SELF_ROOT, 'packages', 'tokens', 'package.json'), 'utf8')).version;
  let DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  if (DBL === null) {
    const p = await P(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { expectedVersion: 0, title: DBL_TITLE, designSystemVersion: `@eye/tokens@${tokensVersion}`,
      scope: { capabilities: ['F-P7-E-02', 'F-P7-E-04', 'F-P7-E-06', 'F-P7-E-18', 'F-P7-E-19', 'F-P7-E-20'], journeys: CHAPTERS.map((c) => c[0]), profiles: ['local-dev'], themes: ['light', 'dark', 'print'], locales: ['en'] }, members: lib.map((a) => a.id) }, 'DSB');
    if (!p.ok) fail('P. Castellano proposes the B81 design baseline', p);
    else {
      const b = p.body.baseline;
      ok(`P. Castellano PROPOSED the B81 design baseline ${short(b.baseline_id)} v${b.version}: ${lib.length} members (B81's library), design system @eye/tokens@${tokensVersion}`);
      const d = await P(dsa, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the B81 library read against Volume 9 and its walks; every member owned (SYNTHETIC)' }, 'DSB', b.baseline_id);
      if (!d.ok) fail('L. Haddad attests the B81 design baseline', d); else ok(`L. Haddad ATTESTED and SIGNED the B81 design baseline v${b.version} (${d.body.baseline.state})`);
    }
    DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  } else note(`the B81 design baseline ${short(DBL.id)} v${DBL.version} stands — an earlier run (${DBL.state})`);
  if (DBL?.state === 'attested' && EVAL) {
    const files = ['scripts/phase6/act-b81.mjs', 'e2e/phase6-b81.demo.spec.ts', 'e2e/phase6-b81-re.demo.spec.ts', 'e2e/phase6-b81-layout.demo.spec.ts'].filter((f) => existsSync(join(SELF_ROOT, f)));
    const fileEv = files.map((f) => ({ kind: 'journey_harness', ref: `${f} (the B81 act and walks — the journey harness of the chapter)`, digest: sha256(readFileSync(join(SELF_ROOT, f))),
      capturedAt: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
    const ev = [{ kind: 'design_evaluation', ref: `the lint evaluation ${EVAL.id} (${EVAL.verdict})`, digest: EVAL.digest, capturedAt: new Date(EVAL.evaluated_at).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...fileEv];
    const lines = [];
    for (const [chapter, feature, what] of CHAPTERS) {
      let A = await q1(`select acceptance_id::text id, version, state, digest from governance.design_acceptances where tenant_id = $1 and domain_id = $2 and tuple ->> 'journey' = $3 and tuple ->> 'capability' = $4 order by version desc limit 1`, [T, D, chapter, feature]);
      if (A?.state === 'accepted') { lines.push(`${chapter} stands`); continue; }
      if (A === null) {
        const p = await DM(steward, `${DGD}/acceptances/propose`, 'governance.design.acceptance.propose', { baselineId: DBL.id, components: lib.map((a) => a.id),
          tuple: { capability: feature, journey: chapter, persona: `the corridor's people — ${what} (SYNTHETIC)`, role: 'decision_owner', deployment_profile: 'local-dev', theme: 'NORDWERK Corporate v2', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' },
          evidence: ev, obligations: ['design', 'assurance', 'customer'], findings: [{ note: 'the content lint dg-lint-3 ratchet: today\'s findings listed, the list only shrinks (stated, carried)' }], conditions: [{ condition: 'local-dev profile only; accessibility slots empty (B108 → H3); audience comprehension evidence (GLB-20) is B111 → H3' }] }, 'DAC');
        if (!p.ok) { fail(`P. Castellano proposes the ${chapter} design acceptance`, p); continue; }
        A = { id: p.body.acceptance.acceptance_id, version: p.body.acceptance.version, digest: p.body.acceptance.digest, state: p.body.acceptance.state };
      }
      let state = A.state;
      for (const [s, o] of [[dsa, 'design'], [assurance, 'assurance'], [sponsor, 'customer']]) {
        const done = await q1(`select count(*)::int n from governance.design_acceptances x, jsonb_array_elements(x.attestations) t where x.acceptance_id = $1 and x.version = $2 and t ->> 'obligation' = $3`, [A.id, A.version, o]);
        if (done.n > 0) continue;
        const r = await DM(s, `${DGD}/acceptances/${A.id}/attest`, 'governance.design.acceptance.attest', { version: A.version, obligation: o, digest: A.digest, reason: `the ${o} obligation attested against the exact tuple of ${chapter} (SYNTHETIC)` }, 'DAC', A.id);
        if (!r.ok) { fail(`${nm(s.principalId)} attests ${chapter}'s ${o} obligation`, r); break; }
        state = r.body.acceptance.state;
      }
      lines.push(`${chapter} ${String(state).toUpperCase()}`);
    }
    const recs = await q(`select tuple ->> 'journey' j, state, claim from governance.design_acceptances a where tenant_id = $1 and domain_id = $2 and (tuple ->> 'journey', tuple ->> 'capability') in (${CHAPTERS.map((_, i) => `($${3 + 2 * i}, $${4 + 2 * i})`).join(', ')})
        and version = (select max(version) from governance.design_acceptances x where x.acceptance_id = a.acceptance_id)`, [T, D, ...CHAPTERS.flatMap((c) => [c[0], c[1]])]);
    (recs.length === CHAPTERS.length && recs.every((r) => r.state === 'accepted' && r.claim === 'demonstration') ? ok : bad)(`the design acceptance DEMONSTRATION records per B81 chapter scope, each attested by L. Haddad (design), H. Achterberg (assurance) and W. Zielińska (customer): ${lines.join(', ')} — ${recs.length} records, claim ${[...new Set(recs.map((r) => r.claim))].join('/')}; accessibility slots EMPTY (B108 → H3)`);
  } else bad('no attested B81 baseline or lint evaluation — the acceptance demonstration records were not proposed');
}

/* ── B81-9 THE STATE AND THE LIMITS ──────────────────────────────────────────────────── */
console.log('\nB81-9 THE STATE and the LIMITS');
{
  const n = await q1(`select (select count(*) from shell.degraded_contracts where tenant_id = $1)::int degraded_contracts, (select count(*) from governance.terms)::int term_versions,
     (select count(*) from shell.intent_records where tenant_id = $1)::int intent_records, (select count(*) from shell.saved_searches where tenant_id = $1)::int saved_search_versions,
     (select count(*) from shell.session_handoffs where tenant_id = $1)::int handoffs, (select count(*) from shell.presentation_states where tenant_id = $1)::int presentation_states,
     (select count(*) from shell.preferences)::int preference_versions`, [T]);
  note(`as recorded: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const claims = await q1(`select (select count(*) from governance.design_acceptances where claim <> 'demonstration')::int d`);
  (claims.d === 0 ? ok : bad)(`no design acceptance claims more than a DEMONSTRATION (${claims.d} beyond it)`);
  ENV_OUT.EYE_B81_TENANT = T; ENV_OUT.EYE_B81_DOMAIN = D; ENV_OUT.EYE_B81_DECISION_AUTHORITY = 'l.brandt'; ENV_OUT.EYE_B81_APPROVER = 's.okafor'; ENV_OUT.EYE_B81_DSA = 'l.haddad';
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — the software and its harnesses (phase6-{prelude,authority,degraded,terms,search,handoffs,preferences}-b81, the web unit models, the walks). (2) DEMONSTRATED OPERATION — what RAN here through the governed routes by SYNTHETIC personas: the reroute proposed with its digest frozen, a recusal, S. Okafor\'s approval and signature, L. Brandt\'s commitment and signature as decision authority, the refusals (a stale digest, a self-approval, an agent as an owner of conditions, a stale commit); the degraded contracts declared by the operations authority and read by the database clock; a cancelled run\'s residual state; ASSESSED and "Close warning" made canonical by the DSA (the proposer refused); the content lint as a ratchet; the object headers and the warning\'s "acted by" compare; the density, the room on the display, a handoff between the person\'s own sessions and the desk\'s refused publish; the deterministic reading, the clarification with nothing preselected, the saved search and the command handed to its review; the inventory, the conformant library lint, three B107 contributions and the B81 library owned; a B81 baseline and a design acceptance record per chapter scope — every acceptance `claim = demonstration`. (3) REAL ACCEPTANCE — the named design authorities\' attestation of the conformance package, audience comprehension evidence (GLB-20), assistive-technology results (B108) — NEVER claimed: the shared non-demonstration recording path is construction at B111 (F-P7-E-17), then H3. NOT STAGED HERE (harness-proven): an agent\'s approval (phase6-authority-b81), the degraded exit after a verified recovery (phase6-degraded-b81), the interpreter disagreement between two versions (phase6-search-b81), a display lost and a handoff expired (phase6-handoffs-b81). Fonts: the fallback stacks only (TYP-001/002 stay open — the owner\'s licence decision, D8).');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
