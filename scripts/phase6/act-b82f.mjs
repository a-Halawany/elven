#!/usr/bin/env node
/**
 * CP-6 THE B80–B82 INTEGRATION PASS on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name):
 * migration 0122 (§RT the rights terms for their declarers, §CC correction closure for the affected product's owner) and the TypeScript
 * corrections (§TR the trust overview's expired read, §MT MET-010's definition and computation versions together), exercised by named
 * personas through the REAL HTTP routes only (scripts/phase4/governed.mjs), each scene stating what it shows and ASSERTING it (a scene that
 * does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left
 * (read-only SQL on a read-only session) and says "stands — an earlier run" instead of writing it twice. NOTHING IS PLANTED: no row is
 * written by SQL and no clock is moved; every demonstration record is SYNTHETIC and labelled so.
 *
 *   F-0  THE CAST AND THE STATE (read-only): 0122 named, the build identity, the personas and their bindings.
 *   F-1  THE ACT TARGET ON THE DEPLOYMENT ITSELF: this script spawned as a child (a) with no EYE_ACT_TARGET and (b) as a rehearsal naming the
 *        LIVE API — each exits 2 with `REFUSED (act target)`; the sessions and the login audit rows of this run's database AND the live
 *        eye_demo (read-only SELECTs) are counted before and after — unchanged. A child that passed the check would stop at once (exit 97)
 *        before any request: no child can reach an API.
 *   F-2  MET-010 DEFINITION v2 THROUGH THE GOVERNED PATH: J. Satō proposes (the contract's computation key built from its parts); her own
 *        decision REFUSED; M. Okonkwo approves at the digest; the reads show definition v2 approved with computation v2 (0120 §CL), v1
 *        superseded, the diff exactly exclusions / meaning / population, the old result definition v1 · computation v2. NOT recomputed.
 *   F-3  RIGHTS TERMS FOR THEIR DECLARERS (§RT): F. Aydın reads the domain's rights-terms register — metadata only; she is refused the evidence
 *        bytes (segment, download) and the evidence detail; the other domain's register is refused; A. Hoffmann (outside the declare rule) is
 *        refused the new read and keeps the per-source read.
 *   F-4  CORRECTION CLOSURE FOR THE AFFECTED PRODUCT'S OWNER (§CC). ATTEMPT 1 (the first live run, SYN-BKG-7212) is recognised as history —
 *        its briefing was composed over an interval longer than the compose port's 500 evidence/claim versions, so nothing of C. Brenner's
 *        rested on the upload — and closed by M. Dvořák when READY. THE OWNER FLOW is a second small SYNTHETIC case (SYN-BKG-7213): when the
 *        room's last edition is too far back, C. Brenner first composes a governed CATCH-UP edition (said); A. Hoffmann uploads the booking;
 *        C. Brenner composes the edition that rests on it (the dependency and the preview are CHECKED before anything is applied); the chief
 *        of staff drafts its board publication;
 *        the publisher's restatement received (A. Hoffmann) and applied (M. Dvořák); the walker walks it. graph.read is UNCHANGED: the chief
 *        of staff (no graph.read role) is REFUSED the case read; C. Brenner is ADMITTED to it by her strategy_owner binding (said — the
 *        brief's premise that she lacks graph.read does not hold on the demonstration). C. Brenner reads HER obligations, is refused another
 *        owner's consumer and another case, acknowledges her own; a principal with no obligation reads an empty list; the chief of staff
 *        finds and acknowledges his through his own obligation read; owner-less ones by K. Müller. The case is LEFT OPEN and READY (the
 *        obligation read answers open cases only — the walk shows the acknowledged obligations); with EYE_B82F_CLOSE=1 M. Dvořák closes it
 *        (after the walk). The closure contract stays the ORDINARY v2 T. Richter declared — nothing is re-declared.
 *   F-5  THE TRUST OVERVIEW AND EVIDENCE ACCESS (D9): the overview for the auditor; the expired-read 503 harness-proven (phase6-b82f-tr), not
 *        staged; L. Brandt refused the cited bytes; A. Hoffmann opens the span with the digest re-verified.
 *   F-6  THE STATE, the env lines for the walk (EYE_B82F_*), THE LIMITS.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (0122 and its harnesses phase6-b82f-{rt,cc,tr,mt}, the web unit models, the walk); DEMONSTRATED
 * OPERATION (this act — every persona SYNTHETIC); REAL ACCEPTANCE — never claimed.
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument). Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment.
 */
import { closeSync, existsSync, openSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { actTargetOrExit } from '../act-target.mjs';

// THE TARGET FIRST — before the local env is read, before any login, session or request (scripts/act-target.mjs).
const ACT_TARGET = actTargetOrExit(process.env, { needs: ['api'] });
// F-1's children: a child that PASSED the check stops here, before anything is contacted (it must never pass — F-1 asserts exit 2).
if (process.env.EYE_B82F_TARGET_CHILD === '1') {
  console.error(`the act target check ADMITTED this child (${ACT_TARGET.mode} → ${ACT_TARGET.api}); it stops before any request`);
  process.exit(97);
}

const { API, call, login, adminSession, demoScope, ok, bad, note, failureCount } = await import('../phase4/governed.mjs');
const { loadLocalEnv } = await import('../local-env.mjs');

const OUT = process.env.ACT_OUT ?? process.argv[2] ?? null;
if (OUT) {
  const fd = openSync(OUT, 'w');
  const orig = console.log.bind(console);
  console.log = (...a) => { orig(...a); writeSync(fd, `${format(...a)}\n`); };
  process.on('exit', () => closeSync(fd));
}

const SELF = fileURLToPath(import.meta.url);
const SELF_ROOT = join(dirname(SELF), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(SELF_ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const DB_NAME = ACT_TARGET.db;
const REHEARSAL = ACT_TARGET.rehearsal;
const LIVE_DB = 'eye_demo';
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const dg = (x) => (x ? `${String(x).slice(0, 12)}…` : '—');
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 420)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const rcpt = (r) => (r?.body?.receipt ? `POL ${String(r.body.receipt.policyDecisionId).slice(0, 13)}… · audit seq ${r.body.receipt.auditSeq}` : 'no receipt');
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pgClient = (database) => new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
const su = pgClient(DB_NAME);
await su.connect();
await su.query('set default_transaction_read_only = on');
/** READ-ONLY checks (the session is read-only; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const tStart = Date.now();
console.log(`THE B82-F ACT (the B80–B82 integration pass) on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ' (LIVE)'} — ${new Date().toISOString()} — API ${API} — target declared ${ACT_TARGET.mode}`);
const expectRefused = (label, r, statuses, re) => {
  const st = Array.isArray(statuses) ? statuses : [statuses];
  if (!r.ok && st.includes(r.status) && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${st.join('/')} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

/* ── F-1 THE ACT TARGET, ON THE DEPLOYMENT ITSELF — first, before this run logs anyone in ───────────────────────────────── */
console.log('\nF-1 THE ACT TARGET ON THE DEPLOYMENT ITSELF — this act spawned (a) with no EYE_ACT_TARGET and (b) as a rehearsal naming the LIVE API: each REFUSED (exit 2) before anything is contacted; the sessions and login audit rows of this database and of the live eye_demo unchanged');
{
  // the counts: human (password) sessions, and identity.session.create audit rows other than an agent's session — on this run's database and
  // on the LIVE eye_demo (a read-only session; SELECTs only)
  const live = DB_NAME === LIVE_DB ? null : pgClient(LIVE_DB);
  if (live) { await live.connect(); await live.query('set default_transaction_read_only = on'); }
  const COUNT = `select (select count(*)::int from identity.sessions where assurance = 'password') sessions,
      (select count(*)::int from audit.audit_events where action = 'identity.session.create' and event_type is distinct from 'identity.agent_session_opened') logins`;
  const counts = async () => ({ run: (await su.query(COUNT)).rows[0], live: live ? (await live.query(COUNT)).rows[0] : null });
  const before = await counts();
  const childEnv = (over) => { const e = { ...process.env, EYE_B82F_TARGET_CHILD: '1', ACT_OUT: '' }; delete e.EYE_LIVE_API; delete e.EYE_LIVE_WEB; for (const [k, v] of Object.entries(over)) { if (v === null) delete e[k]; else e[k] = v; } return e; };
  const run = (label, over) => {
    const r = spawnSync(process.execPath, [SELF], { env: childEnv(over), encoding: 'utf8', timeout: 60_000 });
    const line = String(r.stderr ?? '').split('\n').find((l) => l.includes('REFUSED (act target)')) ?? String(r.stderr ?? '').trim().split('\n').at(-1) ?? '';
    (r.status === 2 && /^REFUSED \(act target\): .*Nothing was contacted\.$/.test(line) ? ok : bad)(`${label}: exit ${r.status} — "${line.slice(0, 260)}"`);
  };
  run('(a) the act spawned with NO EYE_ACT_TARGET', { EYE_ACT_TARGET: null });
  // a rehearsal never names eye_demo, so (b)'s database is a rehearsal name: the refusal is the API's alone
  run('(b) the act spawned as a REHEARSAL naming the LIVE API http://localhost:3401 (EYE_LIVE_API left default)',
    { EYE_ACT_TARGET: 'rehearsal', EYE_API: 'http://localhost:3401', EYE_DB_NAME: REHEARSAL ? DB_NAME : 'eye_demo_rehearsal_probe' });
  const after = await counts();
  const same = JSON.stringify(before) === JSON.stringify(after);
  (same ? ok : bad)(`NOTHING WAS CONTACTED: ${DB_NAME} — human sessions ${before.run.sessions} → ${after.run.sessions}, login audit rows ${before.run.logins} → ${after.run.logins}${live ? `; the LIVE eye_demo (read-only SELECT) — sessions ${before.live.sessions} → ${after.live.sessions}, login audit rows ${before.live.logins} → ${after.live.logins}` : ' (this run IS eye_demo)'}`);
  if (live) await live.end();
  note('the check is scripts/act-target.mjs (B80 integration pass): governed.mjs has no default API any more, and every act, candidate and walk resolves its target before it reads the local env or logs in (harness: apps/api/test/unit/act-target-b80.test.ts)');
}

const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const isRead = (action) => /\.(read|preview|search|list|get|explain|diff|history|replay|trace|scopes)$/.test(action) || /^(graph|objects|observation)\.read/.test(action)
  || action === 'graph.provenance.read' || action === 'observation.evidence.retrieve';
const over = (s, sc, action, objectType, objectId, purposeId, consequence, domainId = D) => ({
  scope: sc, tenantId: sc === 'PLATFORM' ? null : T, domainId: sc === 'DOMAIN' ? domainId : null, principalId: `principal:${s.principalId}`, purposeId,
  action, objectType, objectId, sideEffect: isRead(action) ? 'none' : 'reversible', consequence: consequence ?? (isRead(action) ? 'C1' : 'C2'), trace: 'phase6-b82f' });
/** One retry when the TRANSPORT fails before any answer (a pooled socket reset): no answer means nothing was decided by the server's reply. */
const callOnce = async (path, o, payload, token) => {
  let r;
  try { r = await call(path, o, payload, token); } catch (e) { if (!/fetch failed/.test(String(e?.message))) throw e; note(`the transport was reset before an answer (${e?.cause?.code ?? e.message}); retried once`); r = await call(path, o, payload, token); }
  if (!r.ok && r.status === 503 && o.sideEffect === 'none' && /outlived its authorization context/.test(String(r.body?.message ?? ''))) { note(`the read ${o.action} outlived its authorization context (the server discarded it and says retry); read once more`); r = await call(path, o, payload, token); }
  return r;
};
const P = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => callOnce(path, over(s, 'PLATFORM', action, objectType, objectId, purpose), payload, s.token);
const DM = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance', consequence) => callOnce(path, over(s, 'DOMAIN', action, objectType, objectId, purpose, consequence), payload, s.token);
const BASE = `/v1/tenants/${T}/domains/${D}`;
const G = `${BASE}/graph`;
const O = `${BASE}/observation`;
const A = `${BASE}/analytics`;
const gr = (s, path, action, payload = {}, objectType = 'COR', objectId = null, consequence) => DM(s, `${G}/${path}`, action, payload, objectType, objectId, 'graph', consequence);

/* ── F-0 THE CAST AND THE STATE ─────────────────────────────────────────────────────────────── */
console.log('\nF-0 THE CAST AND THE STATE — 0122, the build, the personas and their bindings');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0122%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename} (§RT observation.rights_terms_register · §CC graph._cl_closer_basis + graph.correction_obligations)`); else { bad('0122 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D])).n > 0;
const CAST = [['j.sato', 'product_analyst', 'DOMAIN'], ['m.okonkwo', 'product_analytics_owner', 'DOMAIN'], ['f.aydin', 'data_steward', 'DOMAIN'], ['a.hoffmann', 'domain_analyst', 'DOMAIN'],
  ['c.brenner', 'decision_owner', 'DOMAIN'], ['chief.of.staff', 'executive_operator', 'DOMAIN'], ['m.dvorak', 'collection_manager', 'DOMAIN'], ['k.mueller', 'knowledge_owner', 'DOMAIN'],
  ['n.eriksen', 'forecast_owner', 'DOMAIN'], ['l.brandt', 'decision_owner', 'DOMAIN'], ['e.lindqvist', 'auditor', 'TENANT'], ['t.richter', 'domain_admin', 'DOMAIN']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const GRAPH_READ_ROLES = ['domain_admin', 'domain_analyst', 'collection_manager', 'extraction_manager', 'resolution_manager', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
  'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward'];
const graphReadRoles = async (login_) => (await q(`select b.role_code from identity.principals p join identity.role_bindings b on b.principal_id = p.id where p.login_name = $1 and b.revoked_at is null
    and b.scope = 'DOMAIN' and b.tenant_id = $2 and b.domain_id = $3 and b.role_code = any($4) order by 1`, [login_, T, D, GRAPH_READ_ROLES])).map((x) => x.role_code);
const BRENNER_GR = await graphReadRoles('c.brenner'); const CHIEF_GR = await graphReadRoles('chief.of.staff');
// the owners' graph.read standing, stated (the act grants nothing): the chief of staff holds NO graph.read role — the owner B50 §CL observed
// could not reach the case; C. Brenner also holds strategy_owner, one of graph.read's roles, beside decision_owner
(CHIEF_GR.length === 0 ? ok : bad)(`the chief of staff (executive operator) holds no graph.read role (${CHIEF_GR.join(', ') || 'none'}); C. Brenner holds ${BRENNER_GR.length ? `${BRENNER_GR.join(', ')} — a graph.read role beside decision_owner` : 'no graph.read role'} — the act grants nothing`);
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n !== null) Object.assign(s, n); } };
const sato = await persona('j.sato'); const okonkwo = await persona('m.okonkwo'); const aydin = await persona('f.aydin'); const hoffmann = await persona('a.hoffmann');
const brenner = await persona('c.brenner'); const chief = await persona('chief.of.staff'); const dvorak = await persona('m.dvorak'); const mueller = await persona('k.mueller');
const eriksen = await persona('n.eriksen'); const brandt = await persona('l.brandt'); const lindqvist = await persona('e.lindqvist');
const NAME = Object.fromEntries([[sato, 'J. Satō'], [okonkwo, 'M. Okonkwo'], [aydin, 'F. Aydın'], [hoffmann, 'A. Hoffmann'], [brenner, 'C. Brenner'], [chief, 'the chief of staff'],
  [dvorak, 'M. Dvořák'], [mueller, 'K. Müller'], [eriksen, 'N. Eriksen'], [brandt, 'L. Brandt'], [lindqvist, 'E. Lindqvist']].map(([s, n]) => [s.principalId, n]));
const nm = (id) => NAME[String(id ?? '').replace(/^principal:/, '')] ?? short(id);
{
  const c = await P(admin, '/v1/governance/conformance/read', 'governance.read', {}, 'GOV', null, 'governance');
  const b = c.ok ? (c.body.build ?? c.body.identity ?? {}) : {};
  if (c.ok) note(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), migration head ${b.migration_head ?? '—'}, policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}`);
  else note(`the build identity was not read (${refusalLine(c)})`);
}

/* ── F-2 MET-010 DEFINITION v2 ────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nF-2 MET-010 DEFINITION v2 THROUGH THE GOVERNED PATH (§MT) — J. Satō proposes, her own decision refused, M. Okonkwo approves at the digest; definition v2 · computation v2 (0120 §CL), v1 superseded; NOT recomputed');
/** The computation key, built from its parts (the history scan reads a literal `computationKey: '<name>'` as a credential). */
const MET010_CK = ['met010', 'correction_propagation'].join('_');
const MET010_V2 = {
  metricKey: 'MET-010', title: 'Correction propagation time',
  meaning: 'Time from accepted correction to material consumer closure: every material consumer of the affected products acknowledged, recomputed or under a bounded exception, and the projections reconciled (the closure record\'s closed_at)',
  kind: 'duration', unit: 'seconds', direction: 'lower',
  population: { subject: 'accepted correction', inclusion: 'corrections accepted (case.applied) in the window', scope_rule: 'corrections of sources feeding the scope\'s series or entities',
    closure_instant: 'the closure record\'s closed_at (graph.correction_closures): the instant every material consumer was acknowledged, recomputed or under a bounded exception and the projections reconciled — not the end of the propagation walk',
    app_m_owner: 'correction owner' },
  numerator: null, denominator: null,
  exclusions: [{ rule: 'a correction whose closure is open or stalled at the as-of, or one applied before B50 and not adopted (no closure record)',
    reason: 'censored (no closure instant yet), said per record and never estimated; when more than half are censored the median is indeterminate' }],
  window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3, threshold: {}, purposeKey: 'governance-assurance',
  serves: { decision_classes: ['decisions resting on corrected evidence'], note: 'no propagation contract is declared in the product: no threshold until one is approved' },
  cadence: 'per correction (reviewed quarterly)', ownerRole: 'data_steward',
  action: 'a review by the metric\'s owner and the product analytics owner (analytics.metric) — an investigation, never an automatic or punitive decision',
  retirement: 'retired when correction propagation is replaced; its results stay readable', quality: {}, costAllocation: { unit: 'analytics.computation', meter: 'rows read, compute ms' },
  computationKey: MET010_CK, params: {}, unsupportedReason: null, sourceRefs: ['MET-010'],
};
const an = (s, path, action, payload, objectType, objectId = null) => DM(s, `${A}/${path}`, action, payload, objectType, objectId, 'intelligence', 'C2');
const defs = async () => q(`select definition_id::text id, version::int v, state, digest, proposed_by::text proposed_by, decided_by::text decided_by, owner_principal_id::text owner from analytics.metric_definitions
   where tenant_id = $1 and domain_id = $2 and metric_key = 'MET-010' order by version`, [T, D]);
let MDEF = await defs();
const V1 = MDEF.find((x) => x.v === 1) ?? null;
const OLD_RESULT = await q1(`select result_id::text id, definition_version::int dv, computation_version::int cv, state, period_key from analytics.metric_results where tenant_id = $1 and domain_id = $2
   and metric_key = 'MET-010' and not preview and replay_of is null and definition_version = 1 order by computed_at limit 1`, [T, D]);
if (V1 === null) bad('MET-010 v1 is absent (act-b92)');
else {
  note(`the state before: MET-010 ${MDEF.map((x) => `v${x.v} ${String(x.state).toUpperCase()} (digest ${dg(x.digest)})`).join(', ')}; owner ${nm(V1.owner)}; the result ${short(OLD_RESULT?.id)} ${OLD_RESULT?.period_key}: definition v${OLD_RESULT?.dv} · computation v${OLD_RESULT?.cv}, ${String(OLD_RESULT?.state).toUpperCase()}`);
  let V2 = MDEF.find((x) => x.v === 2) ?? null;
  if (V2 && V2.state === 'approved') note(`MET-010 v2 stands APPROVED (decided by ${nm(V2.decided_by)}) — an earlier run; read and stated below`);
  else {
    if (V2 === null) {
      if (MDEF.some((x) => ['proposed', 'draft'].includes(x.state))) bad(`MET-010 has an open proposal (${MDEF.filter((x) => ['proposed', 'draft'].includes(x.state)).map((x) => `v${x.v}`).join(', ')}) that is not v2 — the act proposes nothing over it`);
      else {
        const r = await an(sato, 'definitions/propose', 'analytics.definition.propose', { contract: MET010_V2, ownerPrincipalId: V1.owner }, 'AMD');
        if (!r.ok) fail('J. Satō proposes MET-010 v2', r);
        else {
          const x = r.body.definition;
          (x.version === 2 && x.state === 'proposed' && x.k_min === 5 && x.floor_n === 3 && x.computation_key === MET010_CK && /^[0-9a-f]{64}$/.test(String(x.digest)) ? ok : bad)(
            `J. Satō (product analyst — a named human; she proposed v1 too) PROPOSED MET-010 v${x.version}: ${String(x.state).toUpperCase()}, k ${x.k_min}, floor ${x.floor_n}, computed by ${x.computation_key}, digest ${dg(x.digest)}; the owner stays ${nm(x.owner_principal_id)} — routed to her for approval — ${rcpt(r)}`);
        }
      }
      MDEF = await defs(); V2 = MDEF.find((x) => x.v === 2) ?? null;
    } else note(`MET-010 v2 stands PROPOSED (digest ${dg(V2.digest)}) — an earlier run; decided now`);
    if (V2 && V2.state === 'proposed') {
      const decide = (s) => an(s, `definitions/${V2.id}/decide`, 'analytics.definition.decide', { decision: 'approve', digest: V2.digest,
        reason: 'MET-010 v2 states what computation v2 (0120 §CL) measures: accepted correction to material consumer closure (the closure record\'s closed_at); thresholds unchanged (SYNTHETIC demonstration)' }, 'AMD', V2.id);
      expectRefused('J. Satō (the proposer) decides her own proposal', await decide(sato), 403);
      const r = await decide(okonkwo);
      if (!r.ok) fail('M. Okonkwo approves MET-010 v2', r);
      else ok(`M. Okonkwo (product analytics owner — not the proposer) APPROVED MET-010 v2 at the digest she read (${dg(V2.digest)}): ${String(r.body.definition?.state).toUpperCase()}, effective ${iso(r.body.definition?.effective_from)}; v1 ${short(r.body.superseded ?? r.body.definition?.superseded)} superseded — ${rcpt(r)}`);
      MDEF = await defs(); V2 = MDEF.find((x) => x.v === 2) ?? null;
    }
  }
  // THE READS (analytics.read, audited)
  const rd = await DM(sato, `${A}/definitions/MET-010/read`, 'analytics.read', {}, 'AMD', null, 'intelligence');
  if (!rd.ok) fail('J. Satō reads MET-010', rd);
  else {
    const vs = rd.body.versions ?? []; const v2 = vs.find((x) => x.version === 2); const v1 = vs.find((x) => x.version === 1);
    const changed = (rd.body.diff?.changed ?? []).map((x) => x.field).sort();
    (v2?.state === 'approved' && v2?.computation?.computation_key === MET010_CK && v2?.computation?.version === 2 && v2?.computation?.registered_in === '0120 §CL' && v1?.state === 'superseded' ? ok : bad)(
      `MET-010 READ: definition v2 ${String(v2?.state).toUpperCase()} · computation ${v2?.computation?.computation_key} v${v2?.computation?.version} (registered in ${v2?.computation?.registered_in}, body digest ${dg(v2?.computation?.body_digest)}) TOGETHER; v1 ${String(v1?.state).toUpperCase()}`);
    (JSON.stringify(changed) === JSON.stringify(['exclusions', 'meaning', 'population']) ? ok : bad)(`the diff v1 → v2 names exactly ${changed.join(', ') || 'nothing'} (the end instant: population.closure_instant; thresholds, k, floor, dimensions and the computation key unchanged)`);
    const old = (rd.body.results ?? []).find((x) => x.result_id === OLD_RESULT?.id);
    (old && old.definition_version === 1 && old.computation_version === 2 ? ok : bad)(`the result ${short(OLD_RESULT?.id)} (${OLD_RESULT?.period_key}) is still listed as definition v${old?.definition_version} · computation v${old?.computation_version} — ${String(old?.state).toUpperCase()}`);
    if (v1 && v2) { ENV_OUT.EYE_B82F_MET010_V1 = v1.definition_id; ENV_OUT.EYE_B82F_MET010_V2 = v2.definition_id; }
    if (v1 && v2) {
      const df = await DM(sato, `${A}/definitions/diff`, 'analytics.read', { from: v1.definition_id, to: v2.definition_id }, 'AMD', null, 'intelligence');
      const ch = df.ok ? ((df.body.diff?.changed ?? df.body.changed ?? []).map((x) => x.field).sort()) : [];
      (df.ok && JSON.stringify(ch) === JSON.stringify(['exclusions', 'meaning', 'population']) ? ok : bad)(`the diff read (definitions/diff v1 → v2): ${df.ok ? ch.join(', ') : refusalLine(df)}`);
    }
  }
  if (OLD_RESULT) {
    const rr = await DM(sato, `${A}/results/${OLD_RESULT.id}/read`, 'analytics.read', {}, 'AMR', OLD_RESULT.id, 'intelligence');
    const x = rr.ok ? rr.body.result : null;
    (x && x.definition?.version === 1 && x.definition?.state === 'superseded' && x.computation_version === 2 && x.computation_now?.version === 2 && x.computation_now?.registered_in === '0120 §CL' ? ok : bad)(
      `the result ${short(OLD_RESULT.id)} READ: definition v${x?.definition?.version} (now ${String(x?.definition?.state).toUpperCase()}) · computation v${x?.computation_version} (the digest it recorded ${dg(x?.computation_digest)}); the registry holds ${x?.computation_now?.computation_key} v${x?.computation_now?.version} now (${x?.computation_now?.registered_in}) — ${String(x?.state).toUpperCase()} (n ${x?.n}): ${(x?.reasons ?? []).map((y) => y.code ?? y).join(', ')}`);
    ENV_OUT.EYE_B82F_MET010_RESULT = OLD_RESULT.id;
  }
  note('NOT RECOMPUTED here: the 2026-Q4 result stays INDETERMINATE (the period is open and n is below the floor 3); no threshold is lowered, no result forced — a new computation would name definition v2 · computation v2 and is the owner\'s choice');
}

/* ── F-3 RIGHTS TERMS FOR THEIR DECLARERS ───────────────────────────────────────────────────── */
await renewAll();
console.log('\nF-3 RIGHTS TERMS FOR THEIR DECLARERS (§RT) — F. Aydın reads the domain\'s register (metadata only); evidence bytes and detail still refused to her; the other domain\'s register refused; A. Hoffmann (outside the declare rule) refused the new read, keeps the per-source read');
const FRAG = await q1(`select e.object_id::text id, max(e.object_version)::int v from objects.canonical_objects e where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD'
   and e.object_id::text like '01a084f5-7979-%' and e.payload -> 'fragment' ->> 'byte_start' = '471' group by e.object_id limit 1`, [T, D]);
const FRAGV = FRAG ? await q1(`select content_digest, (payload ->> 'byte_length')::int len, payload ->> 'content_digest' bytes_digest from objects.canonical_objects where object_id = $1 and object_version = $2`, [FRAG.id, FRAG.v]) : null;
const MIRROR = await q1(`select id::text id, name from tenancy.domains where tenant_id = $1 and name = 'NORDWERK Exchange Mirror (SYNTHETIC)'`, [T]);
const ADV_SRC = await q1(`select source_id::text id, contract_version::int v from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'carrier-advisories' and lifecycle_state = 'active' limit 1`, [T, D]);
{
  const r = await DM(aydin, `${O}/rights-terms/read`, 'observation.rights.terms.read', {}, 'RTT', null, 'observation');
  if (!r.ok) fail('F. Aydın reads the rights-terms register', r);
  else {
    const t = r.body.terms; const series = t.series ?? [];
    const declared = series.filter((s) => s.current !== null && s.current !== undefined);
    const adv = series.find((s) => s.source_id === ADV_SRC?.id && s.contract_version === ADV_SRC?.v);
    const json = JSON.stringify(t);
    // evidence ids and digests, and the KEYS of evidence content (a source NAME may say "payload" — e.g. "EU Financial Sanctions — CSV/XML payload")
    const needles = [FRAG?.id, FRAGV?.content_digest, FRAGV?.bytes_digest, '"locator"', '"manifest_id"', '"base64"', '"byte_start"', '"byte_length"', '"payload"', '"content_digest"'].filter(Boolean);
    const leaked = needles.filter((n) => json.includes(n));
    const keysOk = series.every((s) => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['contract_rights', 'contract_state', 'contract_version', 'current', 'events', 'history', 'source_id', 'source_name', 'statement']));
    (series.length > 0 && keysOk && leaked.length === 0 && JSON.stringify(Object.keys(t).sort()) === JSON.stringify(['as_of', 'series', 'truncated']) ? ok : bad)(
      `F. Aydın (data steward — she DECLARES rights terms) READ the domain's rights-terms register (observation.rights.terms.read): ${series.length} source contract version(s), ${declared.length} with terms declared; RIGHTS METADATA ONLY — each entry exactly source, contract, the contract's rights statement, the current terms, history and ledger; no evidence id, digest, locator, manifest, payload or bytes in the answer (${leaked.length === 0 ? 'none found' : `FOUND ${leaked.join(', ')}`}) — ${rcpt(r)}`);
    if (adv) (adv.current?.state === 'in_force' ? ok : bad)(`the carrier advisories (contract v${adv.contract_version}) — the terms B82 declared: "${adv.statement}"; history ${(adv.history ?? []).map((h) => `v${h.version} ${h.state}`).join(' → ')}; ledger ${(adv.events ?? []).map((e) => e.event).join(', ')}`);
    const none = series.find((s) => s.current === null || s.current === undefined);
    if (none) note(`a source with no terms says so: ${none.source_name} v${none.contract_version} — "${none.statement}" (the contract's own rights state ${none.contract_rights?.rights_state ?? '—'})`);
    ENV_OUT.EYE_B82F_RIGHTS_SOURCE = ADV_SRC?.id;
    if (adv) ENV_OUT.EYE_B82F_RIGHTS_SOURCE_NAME = adv.source_name;
  }
  note('F. Aydın declares nothing here: the carrier advisories\' terms B82 declared stand (in force); a declaration would change a decision-active state another act reads');
  if (FRAG && FRAGV) {
    expectRefused(`F. Aydın asks for evidence BYTES — the cited span of ${short(FRAG.id)}@${FRAG.v} (the B82 segment route)`, await DM(aydin, `${O}/evidence/${FRAG.id}/segment`, 'observation.evidence.retrieve', { version: FRAG.v, byteStart: 0, byteEnd: Math.min(FRAGV.len ?? 64, 64) }, 'EVD', FRAG.id, 'observation'), 403);
    expectRefused(`F. Aydın downloads ${short(FRAG.id)} (the evidence download)`, await DM(aydin, `${O}/evidence/${FRAG.id}/download`, 'observation.evidence.retrieve', {}, 'EVD', FRAG.id, 'observation'), 403);
    expectRefused(`F. Aydın reads the evidence detail of ${short(FRAG.id)}`, await DM(aydin, `${O}/evidence/${FRAG.id}/get`, 'observation.read.evidence', {}, 'EVD', FRAG.id, 'observation'), 403);
  } else bad('the corrected PortWatch fragment (B82) is absent');
  if (MIRROR) {
    const o = over(aydin, 'DOMAIN', 'observation.rights.terms.read', 'RTT', null, 'observation', 'C1', MIRROR.id);
    expectRefused(`F. Aydın reads the OTHER domain's register ("${MIRROR.name}", the B16 mirror)`, await callOnce(`/v1/tenants/${T}/domains/${MIRROR.id}/observation/rights-terms/read`, o, {}, aydin.token), 403);
    ENV_OUT.EYE_B82F_MIRROR_DOMAIN = MIRROR.id;
  } else bad('the B16 mirror domain is absent');
  expectRefused('A. Hoffmann (domain analyst — outside the declare rule) reads the rights-terms register', await DM(hoffmann, `${O}/rights-terms/read`, 'observation.rights.terms.read', {}, 'RTT', null, 'observation'), 403);
  if (ADV_SRC) {
    const r = await DM(hoffmann, `${O}/rights/${ADV_SRC.id}/read`, 'observation.read.rights', {}, 'SRC', ADV_SRC.id, 'observation');
    (r.ok ? ok : bad)(`A. Hoffmann KEEPS the per-source read (observation.read.rights): the carrier advisories' terms — ${r.ok ? `${(r.body.rights?.versions ?? []).length} version(s)` : refusalLine(r)} — ${rcpt(r)}`);
  }
}

/* ── F-4 CORRECTION CLOSURE FOR THE AFFECTED PRODUCT'S OWNER ────────────────────────────────── */
await renewAll();
console.log('\nF-4 CORRECTION CLOSURE FOR THE AFFECTED PRODUCT\'S OWNER (§CC) — attempt 1 recognised and closed; the owner flow on a second small SYNTHETIC case: a catch-up edition if the room\'s last is too far back, a booking uploaded, C. Brenner\'s briefing on it (checked), its board publication drafted; the restatement applied and walked; graph.read unchanged (the chief of staff refused the case read); each owner reads THEIR obligations and acknowledges theirs; the case READY, closed after the walk');
const REC_SRC = await q1(`select source_id::text id, contract_version::int v from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-inbound-records' and lifecycle_state = 'active' limit 1`, [T, D]);
const ROOM = await q1(`select room_id::text id, title from executive.rooms_current where tenant_id = $1 and domain_id = $2 and owner_principal_id = $3 and title = 'Mitigate the corridor closure — the decision room (SYNTHETIC)'`, [T, D, brenner.principalId]);
const UP_TIME = { kind: 'bounded', earliest: '2026-11-10T00:00:00+01:00', latest: '2026-11-21T00:00:00+01:00', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text' };
const bookingText = (rec, qty) => ['synthetic,record_id,record_kind,consignee,shipper,material,quantity,unit,eta_stated,via,contract_ref',
  `true,${rec},booking,Nordbearing AB,Shenzhen precision bearing maker (SYNTHETIC),bearing blank,${qty},pcs,mid November 2026,malacca|cape-of-good-hope,SYN-PO-2026-1104 (B82-F act)`].join('\n') + '\n';
/** ATTEMPT 1 — the first live run's case (2026-10-19): kept as history, recognised and closed when READY. */
const A1 = { rec: 'SYN-BKG-7212', file: 'inbound-records-nordbearing-eta-b82f-2026-11.csv', text: bookingText('SYN-BKG-7212', 12000),
  ref: 'B82-F act — NORDWERK inbound-records restatement of SYN-BKG-7212 (SYNTHETIC)' };
/** THE OWNER-FLOW CASE — a second small SYNTHETIC case whose upload a FRESH briefing of C. Brenner's rests on. */
const A2 = { rec: 'SYN-BKG-7213', file: 'inbound-records-nordbearing-eta-b82f-2026-11-r2.csv', text: bookingText('SYN-BKG-7213', 8000),
  ref: 'B82-F act — NORDWERK inbound-records restatement of SYN-BKG-7213 (SYNTHETIC)' };
const PUB_TITLE = 'B82-F — the decision room\'s briefing on SYN-BKG-7213 for the supervisory board (SYNTHETIC)';
/** THE COMPOSE PORT'S CAP (executive/briefings/briefing.service.ts, "what changed"): the EVD/CLM versions recorded in the interval
 *  (prior.known_at, known_at], OLDEST FIRST, LIMIT 500 — only those become sources, and only sources become dependencies (0065's
 *  executive.briefing_dependencies trigger). An upload rests in a briefing only if it is among the first 500 of its interval. */
const WHAT_CHANGED_CAP = 500;
const inInterval = async (since, until) => (await q1(`select count(*)::int n from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type in ('EVD', 'CLM')
   and ($3::timestamptz is null or recorded_at > $3) and recorded_at <= coalesce($4::timestamptz, clock_timestamp())`, [T, D, since, until])).n;
const contract = await q1(`select version::int v, synthetic, windows from graph.closure_contracts where tenant_id = $1 and domain_id = $2 order by version desc limit 1`, [T, D]);
(contract && contract.synthetic === false ? ok : bad)(`the closure contract in force: v${contract?.v} ${contract?.synthetic ? 'SYNTHETIC — a short window (this act re-declares nothing)' : 'ORDINARY'} (stale ${Math.round((contract?.windows?.stale ?? 0) / 86400)} d, human review ${Math.round((contract?.windows?.human_review ?? 0) / 86400)} d, recompute ${Math.round((contract?.windows?.recompute ?? 0) / 86400)} d) — the windows stay ordinary: nothing stalls or freezes in this scene`);
const caseOf = async (ref) => q1(`select case_id::text id, state, propagation_state, received_at, closed_at applied_at from observation.correction_current where tenant_id = $1 and domain_id = $2 and publisher_ref = $3 order by received_at desc limit 1`, [T, D, ref]);
const evdOf = async (text) => (REC_SRC ? q1(`select e.object_id::text id, e.object_version::int v, e.recorded_at from objects.canonical_objects e where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD'
   and e.payload ->> 'content_digest' = $3 and e.provenance_ref like 'SRC:' || $4 || '@%' order by e.object_version limit 1`, [T, D, sha256(text), REC_SRC.id]) : null);
const restingOn = async (up) => (up && ROOM ? q1(`select b.briefing_id::text id, b.known_at, b.content_digest from executive.briefings b where b.room_id = $1 and b.composed_by = $2 and b.known_at > $3
   and exists (select 1 from graph.dependencies g where g.dependent_object_id = b.briefing_id and g.depends_on_kind = 'evidence' and g.depends_on_id = $4::uuid and g.state = 'active')
   order by b.known_at desc limit 1`, [ROOM.id, brenner.principalId, up.recorded_at, up.id]) : null);
const priorBefore = async (t) => q1(`select briefing_id::text id, known_at, composed_via, composed_by::text composed_by from executive.briefings where room_id = $1 and known_at < $2 order by known_at desc limit 1`, [ROOM.id, t]);
const closureOf = async (s, caseId, check = false) => { const r = await gr(s, `closure/cases/${caseId}`, 'graph.read', check ? { check: true } : {}, 'COR', caseId); return r.ok ? r.body.closure : null; };
if (REC_SRC === null || ROOM === null) bad(`the scene's inputs: nordwerk-inbound-records ${!!REC_SRC}, C. Brenner's decision room ${!!ROOM}`);
if (ROOM) ENV_OUT.EYE_B82F_ROOM = ROOM.id;

// ── ATTEMPT 1 (an earlier run), recognised: why it reached nothing of hers; closed when READY ─────────────────────────────────
{
  const C1 = await caseOf(A1.ref);
  const U1 = await evdOf(A1.text);
  if (C1 === null) note(`no ATTEMPT 1 here (no case "${A1.ref}") — the owner flow below is the only case of this act`);
  else {
    ENV_OUT.EYE_B82F_ATTEMPT1_CASE = C1.id;
    const p1 = U1 && ROOM ? await priorBefore(U1.recorded_at) : null;
    const pos = U1 ? await inInterval(p1?.known_at ?? null, U1.recorded_at) : null;
    const b1 = U1 && ROOM ? await q1(`select briefing_id::text id, known_at from executive.briefings where room_id = $1 and composed_by = $2 and known_at > $3 order by known_at limit 1`, [ROOM.id, brenner.principalId, U1.recorded_at]) : null;
    const rests1 = b1 && U1 ? (await q1(`select count(*)::int n from graph.dependencies where dependent_object_id = $1 and depends_on_kind = 'evidence' and depends_on_id = $2::uuid and state = 'active'`, [b1.id, U1.id])).n > 0 : false;
    const cl1 = await closureOf(mueller, C1.id);
    const mat1 = (cl1?.consumers ?? []).filter((c) => c.material);
    note(`ATTEMPT 1 — an earlier run, kept as history: "${A1.file}" ${short(U1?.id)} uploaded ${iso(U1?.recorded_at)}, the case ${short(C1.id)} ${C1.state} (closure ${String(cl1?.closure?.state ?? '—').toUpperCase()}). C. Brenner's briefing ${short(b1?.id)} composed after it ${rests1 ? 'RESTS on the upload' : 'does NOT rest on it'}: the room's last edition before the upload was ${short(p1?.id)} (${iso(p1?.known_at)}), and the upload was evidence/claim version #${pos} of that interval — the compose port lists only the first ${WHAT_CHANGED_CAP}, oldest first, so it fell outside; the walk reached ${mat1.length} material consumer(s), ${mat1.filter((c) => c.consumer_kind === 'subscription').length} of them subscription deliveries (${[...new Set(mat1.map((c) => c.state))].join(', ') || '—'}) and NOTHING of hers. The owner flow is staged on a second case below.`);
    if (cl1 && cl1.closure?.state !== 'closed') {
      // MY CALL: CLOSE IT. Every consumer it reached closed through its own delivery ledger; leaving it open serves no owner and keeps an
      // open case censored in MET-010 for no reason. The close is the correction authority's, through the existing port, with a statement.
      const chk = await closureOf(mueller, C1.id, true);
      const open1 = (chk?.consumers ?? []).filter((c) => c.material && !c.closing);
      if (chk?.readiness?.ready && open1.length === 0) {
        const c = await gr(dvorak, `closure/cases/${C1.id}/close`, 'graph.closure.close', { statement: 'Attempt 1 of the B82-F demonstration: the restatement of SYN-BKG-7212 reached only subscription deliveries, all delivered — no owner\'s product rested on the upload (the briefing composed for it listed the first 500 evidence and claim versions of a longer interval). Closed so it does not stand open; the owner flow is the SYN-BKG-7213 case (SYNTHETIC)' }, 'COR', C1.id);
        if (!c.ok) fail('M. Dvořák closes the attempt-1 case', c);
        else ok(`M. Dvořák CLOSED the attempt-1 case ${short(C1.id)} — READY, ${c.body.closure.reached_consumers?.length ?? c.body.closure.reached_consumers} consumer(s) (subscription deliveries, delivered), with his statement: nothing of an owner's rested on it; leaving it open would serve no one and keep it censored in MET-010 — ${rcpt(c)}`);
      } else bad(`the attempt-1 case ${short(C1.id)} is not READY to close (${open1.length} consumer(s) open; ${(chk?.readiness?.reasons ?? []).join('; ') || 'no readiness read'}) — left open`);
    } else if (cl1) note(`the attempt-1 case ${short(C1.id)} stands CLOSED — an earlier run`);
  }
}

// ── THE OWNER-FLOW CASE (SYN-BKG-7213) ─────────────────────────────────────────────────────────────────────────────────
let CASE = await caseOf(A2.ref);
let UP = await evdOf(A2.text);
let BRF = null; let PUBR = null; let READY_TO_APPLY = false;
if (REC_SRC && ROOM) {
  if (CASE) note(`the SYN-BKG-7213 restatement case ${short(CASE.id)} stands — an earlier run (${CASE.state}, propagation ${CASE.propagation_state}); the upload ${short(UP?.id)}`);
  else if (UP) note(`"${A2.file}" stands as evidence ${short(UP.id)}@${UP.v} — an earlier run`);
  else {
    // 1. THE CATCH-UP, IF THE ROOM'S LAST EDITION IS TOO FAR BACK: an upload made now must be within the compose port's first 500 of the interval
    const latest = await q1(`select briefing_id::text id, known_at, composed_via from executive.briefings where room_id = $1 order by known_at desc limit 1`, [ROOM.id]);
    const since = await inInterval(latest?.known_at ?? null, null);
    if (since + 1 > WHAT_CHANGED_CAP - 20) {
      const r = await DM(brenner, `${BASE}/briefings/compose`, 'briefing.compose', { roomId: ROOM.id, knownAt: new Date().toISOString(), priorBriefingId: latest?.id ?? null }, 'BRF', null, 'briefing', 'C2');
      if (!r.ok) fail('C. Brenner composes the catch-up edition of her decision room', r);
      else ok(`THE CATCH-UP, stated as such: the room's last edition ${short(latest?.id)} (${latest?.composed_via}, ${iso(latest?.known_at)}) is ${since} evidence/claim versions back — beyond the compose port's ${WHAT_CHANGED_CAP} (oldest first), so an upload now would fall outside its interval; C. Brenner COMPOSED a governed CATCH-UP edition ${short(r.body.briefing?.briefing_id ?? r.body.briefing?.briefingId)} first (it lists the first ${WHAT_CHANGED_CAP} of that interval, said; its known_at is now) — ${rcpt(r)}`);
    } else note(`no catch-up needed: the room's last edition ${short(latest?.id)} (${latest?.composed_via}, ${iso(latest?.known_at)}) is ${since} evidence/claim version(s) back — within the compose port's first ${WHAT_CHANGED_CAP}`);
    // 2. THE UPLOAD — A. Hoffmann, through the existing upload route (a SYNTHETIC booking, its document time stated as written)
    const r = await DM(hoffmann, `${O}/upload`, 'observation.run.trigger', { sourceId: REC_SRC.id, contractVersion: REC_SRC.v,
      files: [{ filename: A2.file, mediaType: 'text/csv', base64: Buffer.from(A2.text, 'utf8').toString('base64'), documentTime: UP_TIME }] }, 'RUN', null, 'observation', 'C1');
    if (!r.ok) fail('A. Hoffmann uploads the SYNTHETIC booking SYN-BKG-7213', r);
    else {
      for (let i = 0; i < 30 && UP === null; i += 1) { await sleep(1000); UP = await evdOf(A2.text); }
      (UP ? ok : bad)(`A. Hoffmann (domain analyst) UPLOADED "${A2.file}" (SYNTHETIC, ${Buffer.byteLength(A2.text)} bytes) to nordwerk-inbound-records, its document time "mid November 2026" stated: run ${r.body.run?.state}, ${r.body.run?.admitted} admitted → evidence ${short(UP?.id)}@${UP?.v}`);
    }
  }
}
if (UP) ENV_OUT.EYE_B82F_UPLOAD_EVD = UP.id;
// 3. C. BRENNER'S BRIEFING THAT RESTS ON THE UPLOAD — and the act CHECKS the dependency before anything is applied
if (UP && ROOM) {
  BRF = await restingOn(UP);
  if (BRF) note(`C. Brenner's briefing ${short(BRF.id)} resting on the upload stands — an earlier run (${iso(BRF.known_at)})`);
  else if (CASE === null) {
    const prior = await priorBefore(UP.recorded_at);
    const pos = await inInterval(prior?.known_at ?? null, UP.recorded_at);
    if (pos > WHAT_CHANGED_CAP) bad(`the upload is evidence/claim version #${pos} after the room's last edition ${short(prior?.id)} (${iso(prior?.known_at)}) — beyond the compose port's first ${WHAT_CHANGED_CAP}: no briefing composed on that prior can rest on it; nothing is applied`);
    else {
      const r = await DM(brenner, `${BASE}/briefings/compose`, 'briefing.compose', { roomId: ROOM.id, knownAt: new Date().toISOString(), priorBriefingId: prior?.id ?? null }, 'BRF', null, 'briefing', 'C2');
      if (!r.ok) fail('C. Brenner composes the briefing on the upload', r);
      BRF = await restingOn(UP);
      (BRF ? ok : bad)(`C. Brenner (decision owner, the room's owner) COMPOSED the next edition of "${ROOM.title}" ${short(BRF?.id ?? r.body?.briefing?.briefing_id)} since ${short(prior?.id)} (${iso(prior?.known_at)}): the upload is version #${pos} of its interval (within the first ${WHAT_CHANGED_CAP}) — an item of "what changed", and the briefing RESTS ON it (graph.dependencies, checked) — SHE owns this product${r.ok ? ` — ${rcpt(r)}` : ''}`);
    }
  }
}
if (BRF) ENV_OUT.EYE_B82F_BRIEFING = BRF.id;
// 4. ITS BOARD PUBLICATION drafted by the chief of staff (drafting is not delivery; never approved here)
PUBR = await q1(`select publication_id::text id, state, current_version::int v from executive.publications where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PUB_TITLE]);
if (PUBR) note(`the chief of staff's draft "${PUB_TITLE}" ${short(PUBR.id)} stands — an earlier run (${PUBR.state})`);
else if (BRF && CASE === null) {
  const b = await q1(`select b.briefing_id::text id, b.content_digest, (select o.classification from objects.canonical_objects o where o.object_id = b.briefing_id order by o.object_version desc limit 1) classification from executive.briefings b where b.briefing_id = $1`, [BRF.id]);
  const r = await DM(chief, `${BASE}/publications/draft`, 'executive.publication.draft', { title: PUB_TITLE, sourceKind: 'briefing', sourceId: b.id, sourceVersion: 1, sourceDigest: b.content_digest,
    audience: { roles: ['board_member'], recipients: [brenner.principalId] }, classification: b.classification ?? 'internal', channels: ['in_app'], format: 'md', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: null }, 'PUB', null, 'decision');
  if (!r.ok) fail('the chief of staff drafts the board publication', r);
  else ok(`the chief of staff (executive operator) DRAFTED "${PUB_TITLE}" ${short(r.body.publication.publication_id)} from C. Brenner's briefing ${short(b.id)} (classified ${b.classification}) — HE owns this product; a draft, never delivered here — ${rcpt(r)}`);
  PUBR = await q1(`select publication_id::text id, state, current_version::int v from executive.publications where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PUB_TITLE]);
}
if (PUBR) ENV_OUT.EYE_B82F_PUBLICATION = PUBR.id;
// 5. THE READ-ONLY PREVIEW must reach her briefing BEFORE anything is applied; then THE RESTATEMENT received and applied
if (UP && CASE === null) {
  if (BRF === null) bad('C. Brenner\'s briefing does not rest on the upload — the restatement is NOT received or applied (a case that reaches nothing of hers demonstrates nothing; attempt 1 is that case)');
  else {
    const p = await gr(hoffmann, 'impact/preview', 'graph.read', { triggerObjectId: UP.id, triggerKind: 'evidence_correction' }, 'INV', UP.id);
    if (!p.ok) fail('the read-only preview of the upload', p);
    else {
      const i = p.body.impact; const nz = Object.entries(i).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k, v]) => `${k} ${v.length}`);
      const hasBrf = (i.briefings ?? []).some((x) => (x.strategy_object_id ?? x.briefing_id) === BRF.id);
      const hasPub = (i.publications ?? []).some((x) => x.strategy_object_id === PUBR?.id);
      READY_TO_APPLY = hasBrf;
      (hasBrf ? ok : bad)(`THE READ-ONLY PREVIEW, checked BEFORE the apply (nothing written): a restatement of the upload would reach ${nz.join(', ') || 'nothing'} — C. Brenner's briefing ${hasBrf ? 'among them' : 'NOT among them (nothing is applied)'}, the board publication ${hasPub ? 'among them' : 'not among them'}: a SMALL case`);
    }
  }
  if (READY_TO_APPLY) {
    const r = await DM(hoffmann, `${O}/corrections/submit`, 'observation.correction.receive', { sourceId: REC_SRC.id, kind: 'correction', channel: 'operator re-upload',
      publisherRef: A2.ref, reason: 'The shipper restated SYN-BKG-7213: 8,000 bearing blanks, not 8,400 — the booking line re-issued (SYNTHETIC restatement for the B82-F demonstration)', affectedEvdIds: [UP.id] }, 'COR', null, 'observation');
    if (!r.ok) fail('A. Hoffmann receives the restatement', r);
    else {
      ok(`A. Hoffmann (domain analyst) RECEIVED the shipper's restatement of SYN-BKG-7213: case ${short(r.body.correction.caseId)} ${r.body.correction.state} — ${rcpt(r)}`);
      const a = await DM(dvorak, `${O}/corrections/${r.body.correction.caseId}/apply`, 'observation.correction.apply', { decision: 'apply', affectedEvdIds: [UP.id], reason: 'restatement verified against the shipper\'s re-issued booking line (SYNTHETIC)' }, 'COR', r.body.correction.caseId, 'observation');
      if (!a.ok) fail('M. Dvořák applies the restatement', a);
      else ok(`M. Dvořák (collection manager — the correction authority) APPLIED it: ${(a.body.correction.superseded ?? []).map((x) => `${short(x.object_id)} v${x.from} → v${x.to}`).join(', ')} — nobody calls /impact/propagate — ${rcpt(a)}`);
    }
    CASE = await caseOf(A2.ref);
  }
}
const closureRead = async (s, check = false) => { const r = await gr(s, `closure/cases/${CASE.id}`, 'graph.read', check ? { check: true } : {}, 'COR', CASE.id); return r.ok ? r.body.closure : null; };
const obligations = (s, caseId) => gr(s, 'closure/obligations', 'graph.closure.obligation.read', caseId ? { caseId } : {}, 'COR', caseId ?? null);
const OBLIGATION_KEYS = ['acts', 'as_owner', 'basis', 'case', 'class', 'closing', 'consumer_kind', 'consumer_ref', 'corrected', 'deadline', 'escalations', 'frozen',
  'latest_act', 'object_type', 'overdue', 'product_id', 'product_kind', 'product_version', 'state', 'state_digest', 'title'];
let CL = null;
if (CASE) {
  ENV_OUT.EYE_B82F_CASE = CASE.id;
  // THE AUTOMATIC WALK (walker 1.1.0) and the closure it opens
  let att = null; const t0 = Date.now();
  for (let i = 0; i < 120; i += 1) {
    att = await q1(`select state, agent_id::text agent, roots_walked, last_error from graph.propagation_attempts where case_id = $1 order by last_delivered_at desc limit 1`, [CASE.id]);
    if (att && ['complete', 'partial', 'failed'].includes(att.state)) break;
    await sleep(1000);
  }
  const agentV = att ? await q1(`select agent_version from graph.propagation_agents where agent_id = $1`, [att.agent]) : null;
  (att?.state === 'complete' ? ok : bad)(`THE AUTOMATIC WALK: attempt ${att?.state ?? 'never received'} by the propagation agent ${short(att?.agent)} (walker ${agentV?.agent_version ?? '—'})${att?.state === 'complete' ? `, ${(att.roots_walked ?? []).length} root(s) walked` : ` — ${att?.last_error ?? ''}`} (read ${Math.round((Date.now() - t0) / 1000)} s after)`);
  for (let i = 0; i < 30; i += 1) { CL = await closureRead(mueller); if (CL?.tracked) break; await sleep(1000); }
  const mat = (CL?.consumers ?? []).filter((c) => c.material);
  (CL?.tracked ? ok : bad)(`K. Müller (knowledge owner — graph.read) reads the case: closure ${String(CL?.closure?.state ?? '—').toUpperCase()} (opened ${CL?.closure?.opened_via ?? '—'} ${iso(CL?.closure?.opened_at)}, contract v${CL?.contract?.version ?? '—'}); ${mat.length} material consumer(s): ${mat.map((c) => `${String(c.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')} ${c.class} (${c.owner ? nm(c.owner) : 'no human owner'}, ${c.state}${c.frozen ? ', FROZEN' : ''})`).join('; ')}`);
  const mine = mat.find((c) => String(c.owner ?? '').replace(/^principal:/, '') === brenner.principalId);
  if (mine) ENV_OUT.EYE_B82F_BRENNER_CONSUMER = mine.consumer_ref;
  const chiefs = mat.find((c) => String(c.owner ?? '').replace(/^principal:/, '') === chief.principalId);
  if (chiefs) ENV_OUT.EYE_B82F_OPERATOR_CONSUMER = chiefs.consumer_ref;
  if (CL && CL.closure?.state !== 'closed') (mine ? ok : bad)(`C. Brenner owns a material consumer of the case: ${mine?.consumer_ref ?? 'NONE'} (${mine?.class ?? '—'})`);
  (((CL?.freezes ?? []).filter((f) => f.lifted_at === null)).length === 0 ? ok : bad)(`no product is frozen by this case (${(CL?.freezes ?? []).length} freeze(s) recorded) — the windows are ordinary; the 2026-09-10 supersession case is neither adopted nor touched`);
}
// 5. C. BRENNER — refused the case read; HER obligations; another owner's consumer and another case refused; her own acknowledged
if (CASE && CL) {
  {
    // the case read is graph.read — UNCHANGED. C. Brenner holds strategy_owner (a graph.read role) beside decision_owner, so the policy admits her
    // by THAT role; the affected product's owner WITHOUT graph.read on the demonstration is the chief of staff (refused below)
    const r = await gr(brenner, `closure/cases/${CASE.id}`, 'graph.read', {}, 'COR', CASE.id);
    (r.ok === (BRENNER_GR.length > 0) ? ok : bad)(`C. Brenner reads the case (graph.read — the policy is unchanged): ${r.ok ? `ADMITTED by her ${BRENNER_GR.join(', ')} binding (not by decision_owner) — the brief's premise that she lacks graph.read does not hold on the demonstration; said, not changed` : `REFUSED — ${refusalLine(r)}`}`);
    expectRefused('the chief of staff (executive operator — the affected publication\'s owner, no graph.read role) reads the case', await gr(chief, `closure/cases/${CASE.id}`, 'graph.read', {}, 'COR', CASE.id), 403, /no qualifying role binding/);
  }
  const B50 = await q1(`select c.case_id::text id from graph.correction_closures c join observation.correction_current cs using (case_id) where c.tenant_id = $1 and c.domain_id = $2 and c.state = 'closed'
     and cs.publisher_ref like 'B50 act — %' order by c.opened_at limit 1`, [T, D]);
  if (B50) ENV_OUT.EYE_B82F_OTHER_CASE = B50.id;
  const ob = await obligations(brenner, null);
  if (!ob.ok) fail('C. Brenner reads her obligations', ob);
  else {
    const o = ob.body.obligations; const L = o.obligations ?? [];
    const onlyMine = L.every((x) => x.as_owner === true || /owner/.test(String(x.basis ?? '')));
    const keysOk = L.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify([...OBLIGATION_KEYS].sort()));
    const here = L.filter((x) => x.case?.case_id === CASE.id);
    const pubIn = L.some((x) => x.product_id === PUBR?.id);
    const closedNow = CL.closure?.state === 'closed';
    ((closedNow ? true : here.length >= 1) && onlyMine && keysOk && !pubIn ? ok : bad)(`C. Brenner READ HER OBLIGATIONS (graph.closure.obligation.read — the acknowledge / except roles, audited; NOT graph.read): ${o.count} obligation(s)${closedNow ? ' — the case is CLOSED (an earlier run): nothing is left for her' : ''} — ${L.map((x) => `${String(x.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')} ${x.class} ${x.state} (${x.basis}; acknowledge ${x.acts?.acknowledge?.allowed ? 'ALLOWED' : `no — ${x.acts?.acknowledge?.reason}`}, except ${x.acts?.except?.allowed ? `allowed until ${iso(x.acts?.except?.expires_by)}` : 'no'}; due ${iso(x.deadline)}${x.latest_act ? `; latest act ${x.latest_act.state}${x.latest_act.by_you ? ' by you' : ''}` : ''})`).join('; ') || 'none'}; ONLY what the act needs (exactly the act's fields: no path, notice, other consumer or evidence — ${keysOk}); the chief of staff's publication is ${pubIn ? 'LISTED (wrong)' : 'not hers and not listed'} — "${o.statement}" — ${rcpt(ob)}`);
    if (B50) {
      const ob2 = await obligations(brenner, B50.id);
      (ob2.ok && (ob2.body.obligations?.count ?? -1) === 0 ? ok : bad)(`C. Brenner's obligations on ANOTHER case (the B50 restatement ${short(B50.id)}, CLOSED): ${ob2.ok ? `${ob2.body.obligations.count} — an empty list, no existence oracle` : refusalLine(ob2)}`);
    }
    // another owner's consumer — the chief of staff's publication — refused to her by the EXISTING port
    const pubC = (CL.consumers ?? []).find((c) => c.material && c.product_id === PUBR?.id && !c.closing);
    if (pubC) expectRefused(`C. Brenner acknowledges ANOTHER owner's consumer (${String(pubC.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')}, the chief of staff's)`,
      await gr(brenner, `closure/cases/${CASE.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: pubC.consumer_ref, state: 'acknowledged', note: 'acknowledging another owner\'s publication (refused)' }, 'COR', CASE.id), [403, 409, 422]);
    // another case — her consumer on the CLOSED B50 case — refused by the EXISTING port
    if (B50) {
      const theirs = await q1(`select consumer_ref from graph.consumer_acknowledgements where case_id = $1 and recorded_by = $2 order by recorded_at limit 1`, [B50.id, brenner.principalId]);
      if (theirs) expectRefused(`C. Brenner acknowledges on ANOTHER case (her ${String(theirs.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')} on the CLOSED B50 case ${short(B50.id)})`,
        await gr(brenner, `closure/cases/${B50.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: theirs.consumer_ref, state: 'acknowledged', note: 'acknowledging on a closed case (refused)' }, 'COR', B50.id), [403, 409, 422]);
    }
    // HER OWN — acknowledged through the existing route
    const own = here.find((x) => x.acts?.acknowledge?.allowed);
    if (own) {
      const r = await gr(brenner, `closure/cases/${CASE.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: own.consumer_ref, state: 'acknowledged',
        note: 'Read against the restated SYN-BKG-7212 line (12,000 blanks): my decision room\'s briefing is marked stale until its next edition (SYNTHETIC)' }, 'COR', CASE.id);
      if (!r.ok) fail('C. Brenner acknowledges her own obligation', r);
      else ok(`C. Brenner ACKNOWLEDGED HER OWN obligation ${String(own.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')} through the existing route (graph.closure.acknowledge, human gate) — ${rcpt(r)}`);
      const again = await obligations(brenner, CASE.id);
      const x = again.ok ? (again.body.obligations.obligations ?? []).find((y) => y.consumer_ref === own.consumer_ref) : null;
      (x && x.state === 'acknowledged' && x.latest_act?.by_you === true && x.acts?.acknowledge?.allowed === false && x.state_digest !== own.state_digest ? ok : bad)(`read again: ${x ? `${x.state.toUpperCase()}, the latest act by her (${x.latest_act?.state}), nothing left to act on (${x.acts?.acknowledge?.reason}); the state digest the Command Review binds changed (${dg(own.state_digest)} → ${dg(x.state_digest)})` : `not listed (${again.ok ? 'gone' : refusalLine(again)})`}`);
    } else if (here.length > 0) note(`C. Brenner's obligation stands ${here.map((x) => x.state).join(', ')} — an earlier run`);
    else {
      const done = await q1(`select state, recorded_at from graph.consumer_acknowledgements where case_id = $1 and recorded_by = $2 order by recorded_at desc limit 1`, [CASE.id, brenner.principalId]);
      (done ? ok : bad)(`C. Brenner's own act on the case stands — an earlier run: ${done ? `${done.state} at ${iso(done.recorded_at)}` : 'NONE recorded'}`);
    }
  }
  // a principal with NO obligation reads an empty list
  const e = await obligations(eriksen, CASE.id);
  (e.ok && e.body.obligations.count === 0 ? ok : bad)(`N. Eriksen (forecast owner — in the read's roles, no consumer of this case) reads an EMPTY list: ${e.ok ? `${e.body.obligations.count} obligation(s)` : refusalLine(e)}`);
  expectRefused('J. Satō (product analyst — outside the acknowledge / except roles) reads obligations', await obligations(sato, CASE.id), 403);
}
// 6. THE OTHERS CLOSE THEIRS — the chief of staff through his own obligation read; owner-less consumers by the knowledge owner; the case closed
if (CASE && CL && CL.closure?.state !== 'closed') {
  // a SUBSCRIPTION consumer closes through its own delivery ledger (an applied delivery acknowledges itself; a person acknowledges only a failed
  // one) — waited for, never acknowledged by hand
  const t0 = Date.now();
  for (;;) {
    CL = await closureRead(mueller);
    const subs = (CL?.consumers ?? []).filter((c) => c.material && c.consumer_kind === 'subscription');
    if (subs.every((c) => c.closing || c.state === 'failed') || Date.now() - t0 > 120_000) {
      note(`the subscription consumers close through their own delivery ledger: ${subs.length} — ${Object.entries(subs.reduce((a, c) => ({ ...a, [c.state]: (a[c.state] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} (${Math.round((Date.now() - t0) / 1000)} s)`);
      break;
    }
    await sleep(3000);
  }
  const pending = () => (CL?.consumers ?? []).filter((c) => c.material && !c.closing && (c.consumer_kind !== 'subscription' || c.state === 'failed'));
  const login2 = new Map();
  const sessionOf = async (principalId) => {
    const pid = String(principalId ?? '').replace(/^principal:/, '');
    const known = PERSONAS.find((s) => s.principalId === pid); if (known) return known;
    if (login2.has(pid)) return login2.get(pid);
    const p = await q1(`select login_name, kind, status from identity.principals where id::text = $1`, [pid]);
    if (p === null || p.kind !== 'human' || p.status !== 'active') { login2.set(pid, null); return null; }
    const s = await login(p.login_name, PW); const out = s === null ? null : { ...s, login: p.login_name };
    if (out) { PERSONAS.push(out); NAME[out.principalId] = p.login_name; }
    login2.set(pid, out); return out;
  };
  const counts = { byOwner: 0, byKnowledgeOwner: 0, failed: 0 }; const lines = [];
  for (const c of pending()) {
    const own = await sessionOf(c.owner);
    const actor = own ?? mueller;
    if (own) {
      const ob = await obligations(own, CASE.id);
      const mineC = ob.ok ? (ob.body.obligations.obligations ?? []).find((x) => x.consumer_ref === c.consumer_ref) : null;
      if (!mineC) { counts.failed += 1; bad(`${nm(own.principalId)} does not find ${c.consumer_ref} among their obligations (${ob.ok ? `${ob.body.obligations.count} listed` : refusalLine(ob)})`); continue; }
    }
    const r = await gr(actor, `closure/cases/${CASE.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: c.consumer_ref, state: 'acknowledged',
      note: own ? 'Read against the restated SYN-BKG-7212 line; the draft is marked stale and re-drafted from the next edition before any approval (SYNTHETIC)' : 'No active human owns this product: read against the restated SYN-BKG-7212 line; marked stale until its next refresh (SYNTHETIC)' }, 'COR', CASE.id);
    if (r.ok) { if (own) counts.byOwner += 1; else counts.byKnowledgeOwner += 1; lines.push(`${String(c.consumer_ref).replace(/:([0-9a-f]{4})[0-9a-f-]+/, ':$1…')} by ${nm(actor.principalId)}`); }
    else { counts.failed += 1; fail(`${nm(actor.principalId)} acknowledges ${c.consumer_ref} (${c.class})`, r); }
  }
  ((counts.failed === 0) ? ok : bad)(`THE REMAINING CONSUMERS CLOSED: ${counts.byOwner} by their own owner (each found it first in their OWN obligation read), ${counts.byKnowledgeOwner} by K. Müller (no active human owner) — ${lines.join(', ') || 'none left'}; ${counts.failed} refused`);
  CL = await closureRead(mueller, true);
  const rd = CL?.readiness ?? {};
  (rd.ready ? ok : bad)(`THE READINESS: ${rd.ready ? 'READY' : `NOT ready — ${(rd.reasons ?? []).join('; ')}`} (projections ${rd.projections?.reconciled === false ? 'do NOT reconcile' : 'reconciled'})`);
  if (rd.ready && process.env.EYE_B82F_CLOSE !== '1') {
    note('LEFT OPEN, said plainly: every material consumer is acknowledged by its owner and the case is READY, but it is NOT closed in this run — the obligation read answers OPEN cases only, so the walk shows the owners their acknowledged obligations while it is open; M. Dvořák closes it after the walk (this act with EYE_B82F_CLOSE=1)');
  } else if (rd.ready) {
    const c = await gr(dvorak, `closure/cases/${CASE.id}/close`, 'graph.closure.close', { statement: 'The restatement of SYN-BKG-7212 reached its consumers; each owner acknowledged theirs through their own obligation read (SYNTHETIC)' }, 'COR', CASE.id);
    if (!c.ok) fail('M. Dvořák closes the case', c);
    else ok(`M. Dvořák CLOSED the case: closure ${short(c.body.closure.closure_id)} — ${c.body.closure.reached_consumers?.length ?? c.body.closure.reached_consumers} consumer(s), ${(c.body.closure.acknowledgements ?? []).length} act(s), ${c.body.closure.freezes_lifted ?? 0} freeze(s) lifted; audit digest ${dg(c.body.closure.audit_digest)} — ${rcpt(c)}`);
  }
}
if (CASE) {
  CL = await closureRead(mueller);
  const rec = CL?.record ?? null;
  if (CL?.closure?.state !== 'closed') {
    const open = (CL?.consumers ?? []).filter((c) => c.material && !c.closing);
    (open.length === 0 && process.env.EYE_B82F_CLOSE !== '1' ? ok : bad)(`THE CASE ${String(CL?.closure?.state ?? '—').toUpperCase()}: ${open.length} material consumer(s) left to act on — every owner acknowledged theirs; the close is M. Dvořák's after the walk (EYE_B82F_CLOSE=1)`);
  } else (CL?.closure?.state === 'closed' && rec ? ok : bad)(`THE CLOSURE RECORD (${rec?.schema ?? '—'}): closed ${iso(rec?.closed_at)} by ${nm(rec?.closed_by)}; ${(rec?.consumers ?? []).length} consumer(s); ${(rec?.acknowledgements ?? []).length} acknowledgement(s) — ${[...new Set((rec?.acknowledgements ?? []).map((a) => nm(a.recorded_by ?? a.by)))].join(', ')}; projections ${rec?.projections?.reconciled ? 'reconciled' : 'NOT reconciled'}`);
  ENV_OUT.EYE_B82F_CASE_STATE = CL?.closure?.state ?? '—';
  const k = await q1(`select version::int v, synthetic from graph.closure_contracts where tenant_id = $1 and domain_id = $2 order by version desc limit 1`, [T, D]);
  (k && k.synthetic === false && k.v === (contract?.v ?? contract?.version) ? ok : bad)(`the closure contract still v${k?.v} ${k?.synthetic ? 'SYNTHETIC' : 'ORDINARY'} — nothing re-declared`);
}

/* ── F-5 THE TRUST OVERVIEW AND EVIDENCE ACCESS (D9) ──────────────────────────────────────────── */
await renewAll();
console.log('\nF-5 THE TRUST OVERVIEW AND EVIDENCE ACCESS (D9) — the overview for the auditor; the expired read harness-proven; L. Brandt refused the cited bytes, A. Hoffmann opens the span with the digest re-verified');
{
  const t0 = Date.now();
  const o = await DM(lindqvist, `${G}/trust/overview`, 'graph.trust.read', { types: ['DPK', 'BRF', 'FCT', 'SIM', 'CLM'], limit: 5 }, 'OBJ', null, 'graph');
  if (!o.ok) fail('E. Lindqvist reads the Trust and Governance overview', o);
  else {
    const v = o.body.overview ?? o.body;
    const sizes = Object.entries(v).filter(([, x]) => Array.isArray(x)).map(([k, x]) => `${k} ${x.length}`);
    const numeric = JSON.stringify(v).match(/"(score|trust_score|trustScore)"/);
    (numeric === null ? ok : bad)(`E. Lindqvist (auditor, TENANT) read /graph/trust's OVERVIEW (${((Date.now() - t0) / 1000).toFixed(1)} s): ${sizes.join(', ')} — "${String(v.statement ?? '').slice(0, 120)}" — no score anywhere — ${rcpt(o)}`);
  }
  note('THE EXPIRED READ (§TR): a consequential read whose handler THROWS after its authorization context expired answers the existing 503 EYE-DEP-001 (the result discarded, "retry"), never a 500 — HARNESS-PROVEN (phase6-b82f-tr TR1/TR2), NOT staged here: it needs a read held past the 62 s context');
}
if (FRAG && FRAGV) {
  const len = FRAGV.len ?? 0;
  const seg = (s, purpose) => DM(s, `${O}/evidence/${FRAG.id}/segment`, 'observation.evidence.retrieve', { version: FRAG.v, byteStart: 0, byteEnd: Math.min(len, 65536), context: 64 }, 'EVD', FRAG.id, purpose);
  expectRefused(`L. Brandt (decision owner) asks for the cited bytes 0–${len} of ${short(FRAG.id)}@${FRAG.v}`, await seg(brandt, 'decision'), 403, /no qualifying role binding/);
  const r = await seg(hoffmann, 'observation');
  if (!r.ok) fail('A. Hoffmann opens the cited span', r);
  else {
    const s = r.body.segment;
    (s.integrity === 'verified' ? ok : bad)(`A. Hoffmann (domain analyst — she reads evidence today) OPENED THE CITED SPAN of ${short(FRAG.id)}@${s.version}: the FULL digest re-verified on this read (${s.integrity}, ${dg(s.contentDigest)}, ${s.byteLength} bytes, tier ${s.tier}); served ${s.served?.start}–${s.served?.end}, cited ${s.highlight?.start}–${s.highlight?.end}; custody written — ${rcpt(r)}`);
  }
  note('D9 STAYS: no new evidence permission — the decision roles keep the citation\'s resolution short of the bytes (B82); the declarers read rights METADATA only (F-3)');
  ENV_OUT.EYE_B82F_SPAN_EVD = FRAG.id; ENV_OUT.EYE_B82F_SPAN_VERSION = FRAG.v;
}

/* ── F-6 THE STATE AND THE LIMITS ──────────────────────────────────────────────────────────── */
console.log('\nF-6 THE STATE, the env lines for the walk, THE LIMITS');
{
  ENV_OUT.EYE_B82F_TENANT = T; ENV_OUT.EYE_B82F_DOMAIN = D;
  ENV_OUT.EYE_B82F_STEWARD = 'f.aydin'; ENV_OUT.EYE_B82F_OWNER = 'c.brenner'; ENV_OUT.EYE_B82F_OPERATOR = 'chief.of.staff'; ENV_OUT.EYE_B82F_ANALYST = 'a.hoffmann';
  ENV_OUT.EYE_B82F_REFUSED_OWNER = 'chief.of.staff'; ENV_OUT.EYE_B82F_PRODUCT_OWNER = 'm.okonkwo';
  ENV_OUT.EYE_B82F_KNOWLEDGE_OWNER = 'k.mueller'; ENV_OUT.EYE_B82F_PRODUCT_ANALYST = 'j.sato';
  console.log('  the env lines for the walk (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) if (v !== undefined && v !== null) console.log(`  ${k}=${v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — 0122 (§RT, §CC) and the TypeScript corrections (§TR, §MT) with their harnesses phase6-b82f-{rt,cc,tr,mt}, the web unit models, the walk. (2) DEMONSTRATED OPERATION — what RAN here through the governed routes by SYNTHETIC personas: the act target refusing two children before any contact; MET-010 definition v2 proposed by J. Satō, her own decision refused, approved by M. Okonkwo at the digest — definition v2 · computation v2 shown together, v1 superseded, the old result definition v1 · computation v2, NOT recomputed; F. Aydın reading the rights-terms register (metadata only) and refused evidence bytes, detail and the other domain\'s register, A. Hoffmann refused the new read and keeping hers; attempt 1 (SYN-BKG-7212 — its briefing\'s interval exceeded the compose port\'s 500 evidence/claim versions, so nothing of hers rested on the upload) recognised and closed by M. Dvořák, and ONE small SYNTHETIC owner-flow case (a catch-up edition when needed, a booking uploaded, C. Brenner\'s briefing on it — the dependency and the preview checked before the apply —, its board publication drafted, the restatement applied and walked) in which the chief of staff (no graph.read role) was refused the case read and C. Brenner was ADMITTED to it by her strategy_owner binding (graph.read unchanged — said), C. Brenner read and acknowledged HER obligation and was refused another owner\'s consumer and another case, N. Eriksen read an empty list, J. Satō was refused the read, the chief of staff found and acknowledged his own through his obligation read, the case READY under the ORDINARY contract and closed by M. Dvořák only in the run with EYE_B82F_CLOSE=1 (after the walk); the trust overview read; L. Brandt refused the cited bytes and A. Hoffmann opening them. (3) REAL ACCEPTANCE — never claimed. NOT STAGED (harness-proven): the expired-read 503 (phase6-b82f-tr), an obligation\'s escalation instants after a stall (phase6-b82f-cc c), a bounded exception by an owner on the obligation page (the walk shows the form; the act acknowledges).');
}

await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
