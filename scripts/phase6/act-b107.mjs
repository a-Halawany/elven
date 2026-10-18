#!/usr/bin/env node
/**
 * CP-6 stage B107 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): GOVERNANCE REGISTRIES,
 * TRACEABILITY AND CONFORMANCE MANIFESTS (F-P7D-25, F-P7-F-12), THE PRODUCT-GOVERNANCE WORKSPACE, DESIGN GOVERNANCE (F-P7-E-17) and
 * SCOPE-SPECIFIC ACCEPTANCE RECORDS (F-R0-04) — migration 0115 — exercised by named personas through the REAL HTTP routes only, each scene
 * stating what it shows and ASSERTING it (a scene that does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is
 * RERUN-SAFE: each scene first reads what an earlier run left (read-only SQL) and says "stands — an earlier run" instead of writing it twice.
 * NOTHING IS PLANTED: no governance row is written by SQL and no clock is moved — the short validities (the export-path exception, the
 * journey evidence) are REAL short validities, waited for on the DATABASE clock (B94's 15-minute grant idiom).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses phase6-{prelude,registries,conformance,workspace,acceptance,design,
 * ownership}-b107); DEMONSTRATED OPERATION (this act — every persona SYNTHETIC; every in-product approval, attestation, acceptance and signature
 * by a synthetic persona DEMONSTRATES the software and its records carry `claim = demonstration`); REAL ACCEPTANCE — named independent and
 * customer authorities (R2, H3), production admission (R1), signed releases (B65: substituted by a LOCAL RELEASE-CANDIDATE RECORD, which is never
 * a release) — NEVER claimed.
 *
 * No new domain is created (MAP Q7): "Supply Corridor Intelligence" stands for the Regensburg line's domain (the accepted scope) and
 * "NORDWERK Polska — Supplier Risk (SYNTHETIC)" is the out-of-scope domain.
 *
 *   B107-0  THE STATE — 0115 applied; the NORDWERK cast; the domains; the build identity the API declares.
 *   CAST    the platform administrator creates the vendor's PLATFORM personas (SYNTHETIC, fresh logins) through POST /v1/platform/principals.
 *   B107-1  BASELINE (§RG, §CM, §PG) — the repository's registers imported READ-ONLY, the committed component manifest registered, the orphans
 *           and the lint STATED (never hidden), EXC-P0-003 reported expired (the owner's to renew or close); an accountable owner per capability,
 *           the decision-rights matrix approved and signed, the product baseline HELD on its gaps, then signed — CAP-FW-07 read with its trace.
 *   B107-2  CHANGE IMPACT on the forecast contract (FCT@v2) (§RG, §PG) — the corridor's briefing declared as citing it, the real forecast test run
 *           ingested and independently reviewed, the deterministic impact (the same digest twice), recorded as a proposal, the change proposal
 *           NOT approvable without its six plans, then approved and signed; the admission check (construction half; R1 stated).
 *   B107-3  THE EXPIRED EXCEPTION HOLDS THE RELEASE CANDIDATE (§CM, §PG) — PART I: the release candidate assembled over the real evidence of the
 *           three required families and checked conformant (not attested); the export-path exception proposed with a SHORT validity and
 *           approved by independent assurance (the product authority refused). PART II (after scenes 4-I, 5, 6): read expired on the database
 *           clock, the sweep → the candidate HELD, its check refused 409 held; the renewal with stale evidence refused, with current evidence
 *           approved → the hold LIFTED; the candidate checked and ATTESTED — a local conformance record, never a release.
 *   B107-4  SCOPE-SPECIFIC ACCEPTANCE (§AR) — PART I: the corridor's acceptance of CAP-FW-07 proposed over a real test report and a SHORT-LIVED
 *           journey evidence item; the customer verifies; self-acceptance and an agent refused; one named human per obligation → ACCEPTED in the
 *           corridor, NOT ACCEPTED in Polska. PART II: the short item expired → the reconciliation CONSTRAINS the record (the journey removed,
 *           expansion held); a Polska proposal refused (held); re-acceptance over renewed evidence → accepted again.
 *   B107-5  DESIGN GOVERNANCE (§DG) — the inventory and the lint over the real repository, owned assets, the attested design baseline, B92's
 *           finding decided as design_change_proposal → a contribution → amended, reviewed, accepted (signed) and published; a design acceptance
 *           in the corridor (refusals: the proposer, the asset owner deciding its own exception); the conformance packages for UX-70-006 and
 *           UX-66-006 generated and LEFT UNSIGNED (R2).
 *   B107-6  OWNERSHIP (§DR) — the corridor's domain registry entry (proposed, ratified by the sponsor), a data authority (proposed by a steward,
 *           accepted by its named owner, ratified), a stewardship case (opened, reviewed by another, closed with evidence), a component
 *           ownership transfer for a manifest component (proposed, accepted by the receiving owner, ratified and signed); the route lint read.
 *   B107-7  THE STATE, the env lines for the walk, THE LIMITS (three claims kept apart).
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument). Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment; the signing key is bound in the API's environment by reference and never read here. THE ONE
 * SUBSTITUTION (act-b35's): the Decision Agent's run session is opened through the identity port (executive.decision_agent_run_open), as the
 * API's own agent-session service opens it, so that an AGENT's attestation can be shown refused — no governance row is written by it.
 */
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

// THE OUTPUT FILE (ACT_OUT or argv[2]): every console line is also written there
const OUT = process.env.ACT_OUT ?? process.argv[2] ?? null;
if (OUT) {
  const stream = createWriteStream(OUT, { flags: 'w' });
  const orig = console.log.bind(console);
  console.log = (...a) => { orig(...a); stream.write(`${format(...a)}\n`); };
  process.on('exit', () => stream.end());
}

const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const EVIDENCE = join(existsSync(join(SELF_ROOT, 'evidence', 'cp6', 'b107-trust.vitest.json')) ? SELF_ROOT : ROOT, 'evidence', 'cp6');
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
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
const dbConf = (user, password) => ({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user, password });
const su = new pg.Client(dbConf(env.EYE_DB_MIGRATE_USER ?? 'eye', env.EYE_DB_MIGRATE_PASSWORD));
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const dbNow = async () => new Date((await q1('select clock_timestamp() t')).t);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const tStart = Date.now();
const WAITS = [];
console.log(`THE B107 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${status} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes: the vendor's registries are PLATFORM; a domain's records DOMAIN ────────────────────────────────────────────────────────
const plat = (s, action, objectType = 'GOV', objectId = null) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'governance',
  consequence: 'C2', action, objectType, objectId, sideEffect: /\.read$/.test(action) ? 'none' : 'reversible', trace: 'phase6-b107' });
const dom = (s, d, action, objectType = 'GOV', objectId = null) => ({ ...plat(s, action, objectType, objectId), scope: 'DOMAIN', tenantId: T, domainId: d });
const RG = '/v1/governance/registries'; const CM = '/v1/governance/conformance'; const PG = '/v1/governance/workspace'; const DG = '/v1/governance/design';
const OWN = '/v1/governance/ownership';
const RGD = (d) => `/v1/tenants/${T}/domains/${d}/governance/registries`; const AR = (d) => `/v1/tenants/${T}/domains/${d}/governance/acceptance`;
const DGD = (d) => `/v1/tenants/${T}/domains/${d}/governance/design`; const DRD = (d) => `/v1/tenants/${T}/domains/${d}/governance/ownership`;
const rd = (s, path, payload = {}, action = 'governance.read', objectType = 'GOV') => call(path, plat(s, action, objectType), payload, s.token);
const wr = (s, path, action, payload = {}, objectType = 'GOV', objectId = null) => call(path, plat(s, action, objectType, objectId), payload, s.token);
const drd = (s, d, path, payload = {}, action = 'governance.read', objectType = 'GOV') => call(path, dom(s, d, action, objectType), payload, s.token);
const dwr = (s, d, path, action, payload = {}, objectType = 'GOV', objectId = null) => call(path, dom(s, d, action, objectType, objectId), payload, s.token);

/* ── B107-0 THE STATE ────────────────────────────────────────────────────────────────── */
console.log('\nB107-0 THE STATE — 0115, the NORDWERK cast, the domains, the build identity');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0115%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0115 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc, d = D) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, d])).n > 0;
const SUB_NAME = 'NORDWERK Polska — Supplier Risk (SYNTHETIC)';
const SUB = await q1(`select id::text, name, status from tenancy.domains where tenant_id = $1 and name = $2`, [T, SUB_NAME]);
if (SUB === null || SUB.status !== 'active') { bad(`the out-of-scope domain "${SUB_NAME}" is not active — B94's act runs first`); process.exit(1); }
const DP = SUB.id;
const CAST = [['n.vogel', 'tenant_admin', 'TENANT', D], ['t.richter', 'domain_admin', 'DOMAIN', D], ['m.okonkwo', 'product_analytics_owner', 'DOMAIN', D],
  ['w.zielinska', 'customer_sponsor', 'TENANT', D], ['j.hartmann', 'onboarding_authority', 'TENANT', D], ['k.nowak', 'domain_admin', 'DOMAIN', DP]];
for (const [l, role, sc, d] of CAST) {
  if (await holds(l, role, sc, d)) ok(`${l} holds ${role} at the ${sc}${sc === 'DOMAIN' ? (d === D ? ' (the corridor domain)' : ' (NORDWERK Polska)') : ''}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const renew = async (s) => { const n = await login(s.login, PW); if (n === null) { bad(`${s.login} could not authenticate again`); return s; } Object.assign(s, n); return s; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) await renew(s); };
const vogel = await persona('n.vogel'); const richter = await persona('t.richter'); const okonkwo = await persona('m.okonkwo'); const sponsor = await persona('w.zielinska');
const nowak = await persona('k.nowak');
const NAME = { [vogel.principalId]: 'N. Vogel', [richter.principalId]: 'T. Richter', [okonkwo.principalId]: 'M. Okonkwo', [sponsor.principalId]: 'W. Zielińska', [nowak.principalId]: 'K. Nowak' };
const nm = (id) => NAME[id] ?? short(id);
note(`the domains: "Supply Corridor Intelligence" (${short(D)}) STANDS FOR the Regensburg line's domain — the accepted scope; "${SUB_NAME}" (${short(DP)}) is the OUT-OF-SCOPE domain. No domain named Regensburg exists and none is created (MAP Q7)`);
const BUILD = {};
{
  const c = await rd(admin, `${CM}/read`);
  if (!c.ok) fail('the platform administrator reads the conformance workspace (the build identity)', c);
  else {
    const b = c.body.build ?? c.body.identity ?? {};
    BUILD.head = b.head_sha; BUILD.source = b.head_source;
    ((/^[0-9a-f]{40}$/.test(String(b.head_sha)) && b.head_source === 'env') ? ok : bad)(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source} — EYE_BUILD_HEAD_SHA), policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}, the committed manifest ${b.manifest?.readable ? dg(b.manifest?.file_digest) : `UNREADABLE (${b.manifest?.reason})`}`);
  }
  const n = await q1(`select (select count(*) from governance.artifacts where superseded_at is null)::int artifacts, (select count(*) from governance.events)::int events,
    (select count(*) from governance.signatures)::int signatures, (select count(*) from governance.acceptance_records)::int acceptance_versions`);
  note(`governance as read: ${n.artifacts} current artifacts, ${n.events} ledger events, ${n.signatures} PLATFORM signatures, ${n.acceptance_versions} acceptance-record versions${n.events > 20 ? ' — an earlier run stands' : ''}`);
}

/* ── CAST ────────────────────────────────────────────────────────────────────────────── */
console.log('\nCAST — the platform administrator creates the vendor\'s PLATFORM personas (SYNTHETIC, fresh logins) through POST /v1/platform/principals');
const P = {};
async function platformPersona(sp) {
  const existing = await q1(`select p.id::text, p.display_name, p.scope from identity.principals p where p.login_name = $1`, [sp.login]);
  if (existing && (existing.display_name !== sp.name || existing.scope !== 'PLATFORM')) { bad(`the login name ${sp.login} is taken by "${existing.display_name}" (${existing.scope}) — choose another`); process.exit(1); }
  if (existing === null) {
    const r = await call('/v1/platform/principals', { scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
      action: 'identity.principal.create', objectType: 'PRN', consequence: 'C2', trace: 'phase6-b107' }, { kind: 'human', displayName: sp.name, loginName: sp.login, password: PW, roleCode: sp.role }, admin.token);
    if (!r.ok) { fail(`the platform administrator creates ${sp.short}`, r); process.exit(1); }
    ok(`the platform administrator CREATED ${sp.short} — "${sp.name}", login ${sp.login}, ${sp.role} at the PLATFORM`);
  } else if (await holds(sp.login, sp.role, 'PLATFORM')) note(`${sp.short} (${sp.login}, ${sp.role}) is present: stands — an earlier run`);
  else { bad(`${sp.login} exists but holds no ${sp.role} binding at the PLATFORM`); process.exit(1); }
  const s = await who(sp.login);
  P[sp.key] = s; PERSONAS.push(s); NAME[s.principalId] = sp.short;
  ENV_OUT[`EYE_B107_${sp.key.toUpperCase()}`] = sp.login;
  return s;
}
const productA = await platformPersona({ key: 'product', login: 'e.lindgren', name: 'E. Lindgren — product authority, the vendor (SYNTHETIC)', short: 'E. Lindgren', role: 'product_authority' });
const productB = await platformPersona({ key: 'product2', login: 'r.moreau', name: 'R. Moreau — product authority, the vendor (SYNTHETIC)', short: 'R. Moreau', role: 'product_authority' });
const assurance = await platformPersona({ key: 'assurance', login: 'h.achterberg', name: 'H. Achterberg — independent assurance, the vendor (SYNTHETIC)', short: 'H. Achterberg', role: 'independent_assurance' });
const steward = await platformPersona({ key: 'steward', login: 'p.castellano', name: 'P. Castellano — conformance steward, the vendor (SYNTHETIC)', short: 'P. Castellano', role: 'conformance_steward' });
const ops = await platformPersona({ key: 'operations', login: 'k.mensah', name: 'K. Mensah — operations authority, the vendor (SYNTHETIC)', short: 'K. Mensah', role: 'operations_authority' });
const dsa = await platformPersona({ key: 'design', login: 'l.haddad', name: 'L. Haddad — Design System Authority, the vendor (SYNTHETIC)', short: 'L. Haddad', role: 'design_system_authority' });
const dsaOwner = await platformPersona({ key: 'design_owner', login: 's.iversen', name: 'S. Iversen — Design System Authority, owner of the governed-action assets (SYNTHETIC)', short: 'S. Iversen', role: 'design_system_authority' });
(new Set([productA, productB, assurance, steward, ops, dsa, dsaOwner].map((s) => s.principalId)).size === 7 ? ok : bad)('seven DIFFERENT vendor people: two product authorities, independent assurance, the conformance steward, the operations authority, two Design System Authorities');
const learnNames = async () => { for (const p of await q(`select id::text, display_name from identity.principals where (tenant_id = $1 or tenant_id is null) and kind = 'human'`, [T])) NAME[p.id] ??= p.display_name.split(' — ')[0]; };
await learnNames();

// THE DECISION AGENT (act-b35's substitution): its own RUN SESSION, opened through the identity port as DecisionAgentSessionService opens it. The token
// stays in this process; nothing prints it. Used ONLY to show an agent's attestation REFUSED.
const AGENT_REG = await q1(`select agent_id::text, principal_id::text, agent_version from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'decision' and status = 'active' order by created_at limit 1`, [T, D]);
const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
async function openAgentRunSession(agentId) {
  const ic = new pg.Client(dbConf(env.EYE_DB_IDENTITY_USER ?? 'eye_identity', env.EYE_DB_IDENTITY_PASSWORD));
  await ic.connect();
  const sessionId = randomUUID(); const familyId = randomUUID(); const correlationId = randomUUID();
  const refreshToken = `${randomUUID()}.${randomBytes(24).toString('base64url')}`; const contextKey = randomBytes(32).toString('base64url');
  const ttl = Number(env.EYE_IDENTITY_ACCESS_TTL ?? 900);
  let reg;
  try {
    await ic.query('begin');
    await ic.query(`select ctx.issue_identity_op('identity.session.create', null::uuid, $1::uuid, 60)`, [correlationId]);
    reg = (await ic.query(`select executive.decision_agent_run_open($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid) r`,
      [sessionId, agentId, T, D, sha256(refreshToken), sha256(contextKey), new Date(Date.now() + Math.max(ttl, 900) * 1000), familyId])).rows[0].r;
    await ic.query(`select audit.commit_identity_event($1::uuid, $2::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', $3::uuid, $4::jsonb)`,
      [reg.principal_id, sessionId, correlationId, JSON.stringify({ agent_id: agentId, agent_version: reg.agent_version, code_digest: reg.code_digest, assurance: 'agent_grant', family: 'executive' })]);
    await ic.query('commit');
  } catch (e) { await ic.query('rollback').catch(() => {}); await ic.end(); throw new Error(`the Decision Agent's run session was refused: ${e.message}`); }
  await ic.end();
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'HS256', kid: env.EYE_IDENTITY_JWT_KID ?? 'local-1' });
  const body = b64u({ sid: sessionId, asr: 'agent_grant', ctxk: contextKey, sub: reg.principal_id, iss: env.EYE_IDENTITY_JWT_ISSUER ?? 'the-eye.local', aud: env.EYE_IDENTITY_JWT_AUDIENCE ?? 'the-eye-api', iat: now, exp: now + ttl });
  const sig = createHmac('sha256', Buffer.from(env.EYE_IDENTITY_JWT_SECRET, 'utf8')).update(`${head}.${body}`).digest('base64url');
  return { token: `${head}.${body}.${sig}`, principalId: reg.principal_id, sessionId };
}

// THE CORRIDOR'S ATTENTION ROUTES (B94's idiom): T. Richter routes the governance classes to the domain administrator — an expired exception and a
// constrained acceptance from C1, the ownership register's items from C3 (escalations; the open no-owner gaps stay LISTED in the register, not queued)
{
  const ROUTE = (min, ack = 1440) => ({ materiality: { min_consequence: min, min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: ack, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' });
  const WANT = { 'governance.exception': ROUTE('C1'), 'governance.acceptance': ROUTE('C1', 240), 'governance.ownership': ROUTE('C3') };
  const active = await q1(`select policy_id::text id, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]);
  const routed = (rules) => Object.keys(WANT).every((c) => JSON.stringify(rules?.classes?.[c]?.route_roles ?? []) === JSON.stringify(['domain_admin']) && rules?.classes?.[c]?.materiality?.min_consequence === WANT[c].materiality.min_consequence);
  if (active && routed(active.rules)) note(`the corridor's attention policy v${active.version} routes ${Object.keys(WANT).join(', ')}: stands — an earlier run`);
  else {
    const rules = active ? JSON.parse(JSON.stringify(active.rules)) : { classes: {}, overload: { max_open_per_role: 50 } };
    for (const [c, r] of Object.entries(WANT)) rules.classes[c] = r;
    const r = await call(`/v1/tenants/${T}/domains/${D}/executive/attention/policy/publish`, { ...dom(richter, D, 'executive.attention.policy.publish', 'ATP'), purposeId: 'executive' }, { rules,
      reason: 'B107: the governance classes routed to the domain administrator — an expired exception and a constrained acceptance from C1, ownership escalations from C3; every earlier class unchanged (SYNTHETIC)' }, richter.token);
    if (!r.ok) fail('T. Richter publishes the corridor\'s attention policy', r);
    else {
      const pub = await q1(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]);
      const kept = active ? Object.keys(active.rules.classes).filter((c) => WANT[c] !== undefined || JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c])).length : 0;
      (routed(pub.rules) && (!active || kept === Object.keys(active.rules.classes).length) ? ok : bad)(`T. Richter PUBLISHED the corridor's attention policy v${pub.version}${active ? ` (supersedes v${active.version}; ${kept} of ${Object.keys(active.rules.classes).length} earlier classes unchanged)` : ''}: governance.exception and governance.acceptance from C1, governance.ownership from C3 → the domain administrator`);
    }
  }
}

/* ── B107-1 BASELINE ─────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-1 BASELINE (§RG, §CM, §PG) — the registers imported read-only, the manifest registered, the orphans and the lint stated, the owners, the decision rights, the product baseline');
{
  const before = await q1(`select count(*)::int n from governance.rg_imports`);
  const t0 = Date.now();
  const r = await wr(steward, `${RG}/import`, 'governance.registry.import', {}, 'GRG');
  if (!r.ok) fail('P. Castellano imports the repository\'s registers', r);
  else {
    const imp = r.body.imported ?? [];
    const changed = imp.filter((x) => x.unchanged === false);
    if (before.n > 0 && changed.length === 0) note(`P. Castellano (conformance steward) re-ran the READ-ONLY import: all ${imp.length} sources UNCHANGED (${((Date.now() - t0) / 1000).toFixed(1)} s) — nothing written twice: stands — an earlier run`);
    else ok(`P. Castellano (conformance steward) IMPORTED the repository's registers READ-ONLY in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${imp.map((x) => `${x.source_path}${x.unchanged ? ' (unchanged)' : ` +${x.counts?.registered ?? 0}`}`).join(', ')}`);
    (imp.every((x) => (x.unresolved ?? []).length === 0) ? ok : note)(`unresolved link ends after the import: ${imp.filter((x) => (x.unresolved ?? []).length > 0).map((x) => `${x.source_path} ${x.unresolved.length}`).join(', ') || 'none'}`);
  }
  const n = await q1(`select count(*) filter (where kind = 'requirement' and source->>'path' like 'audit/requirements/%' and lifecycle = 'active')::int req,
      count(*) filter (where kind = 'capability' and controlling_volume = 'V8' and source->>'path' like 'audit/requirements/%')::int v8, count(*) filter (where kind = 'capability' and controlling_volume = 'V9' and source->>'path' like 'audit/requirements/%')::int v9,
      count(*) filter (where kind = 'journey')::int jrn, count(*) filter (where kind = 'interface' and source->>'path' = 'objects.interface_register')::int ifc, count(*) filter (where kind = 'schema')::int sch,
      count(*) filter (where kind = 'decision_record')::int adr, count(*) filter (where kind = 'exception' and external_key like 'EXCEPTIONS.md:%')::int exc
    from governance.artifacts where superseded_at is null`);
  (n.req === 6264 && n.v8 === 108 ? ok : bad)(`the registry holds what the files say: ${n.req} requirement rows, capabilities ${n.v8} (V8 App A) + ${n.v9} (V9), ${n.jrn} journeys, ${n.ifc} interfaces, ${n.sch} schemas, ${n.adr} decision records, ${n.exc} engineering exceptions — the CSVs stay authoritative`);
  const o = await rd(steward, `${RG}/read`, {}, 'governance.read', 'GRG');
  if (!o.ok) fail('P. Castellano reads the registries\' overview', o);
  else {
    const rec = o.body.reconciliation ?? [];
    (rec.length > 0 && rec.every((x) => x.state === 'in_sync') ? ok : bad)(`the sources reconcile against the repository: ${rec.filter((x) => x.state === 'in_sync').length}/${rec.length} IN SYNC${rec.some((x) => x.state !== 'in_sync') ? ` — ${rec.filter((x) => x.state !== 'in_sync').map((x) => `${x.source_path} ${x.state}`).join(', ')}` : ''}`);
    const p3 = (o.body.engineering_exceptions ?? []).find((x) => x.external_key === 'EXCEPTIONS.md:EXC-P0-003');
    (p3?.expired === true ? ok : bad)(`EXCEPTIONS.md:EXC-P0-003 is REPORTED EXPIRED (expiry ${p3?.expiry_date}, status ${p3?.status}) — read only, non-blocking: renewing or closing it is the OWNER's decision, never the product's`);
    ok(`the build identity stamped on §RG's outputs: head ${dg(o.body.build?.head_sha)} (${o.body.build?.head_sha_source}), policy bundle ${o.body.build?.policy_bundle}, conformance.manifest.json ${dg(o.body.build?.manifest_digest)}`);
  }
  const or = await rd(steward, `${RG}/orphans`, { limit: 3 }, 'governance.read', 'GRG');
  if (!or.ok) fail('P. Castellano reads the orphans', or);
  else ok(`the ORPHANS, STATED — never hidden: ${or.body.orphans?.total} in all; ${(or.body.orphans?.rules ?? []).filter((x) => x.count > 0).map((x) => `${x.rule_id} ${x.count}`).join(', ')}`);
  const li = await rd(steward, `${RG}/lint`, { limit: 3 }, 'governance.read', 'GRG');
  if (!li.ok) fail('P. Castellano reads the lint', li);
  else ok(`the LINT, stated: ${Object.entries(li.body.lint ?? {}).filter(([, v]) => v && typeof v === 'object' && 'count' in v).map(([k, v]) => `${k} ${v.count}`).join(', ')}`);
}
// THE COMMITTED COMPONENT MANIFEST (§CM): the server reads the file; the steward registers it
{
  const r = await wr(steward, `${CM}/manifest/register`, 'governance.conformance.manifest.register', {}, 'CFN');
  if (!r.ok) fail('P. Castellano registers the committed component manifest', r);
  else {
    const m = r.body.manifest;
    if (m.unchanged) note(`the committed component manifest v${m.version} is registered at its digest: unchanged — stands — an earlier run (${m.links?.links_added ?? 0} new links)`);
    else ok(`P. Castellano REGISTERED the committed component manifest v${m.version}: ${m.units} deployable units, ${m.components} components (92 logical in 10 layers + the catalogued platform, infrastructure and data components); links added ${m.links?.links_added}, §RG references still unresolved ${JSON.stringify(m.links?.unresolved ?? {})}`);
  }
}
// THE OWNERS (one accountable owner per capability — ADR-005), the DECISION RIGHTS and the PRODUCT BASELINE (§PG)
const home = async (s = steward) => { const r = await rd(s, `${PG}/read`, {}, 'governance.read', 'GWS'); if (!r.ok) { fail(`${nm(s.principalId)} reads the product-governance workspace`, r); return null; } return r.body; };
const BASE_TITLE = 'The Eye — the product baseline 2026-10 (V8 App A + V9; SYNTHETIC demonstration)';
const BASE_SCOPE = () => ({ capability_version: 'V8 App A + V9 capability registers as imported 2026-10', journeys: ['JRN-24'], roles: ['product_authority', 'independent_assurance', 'conformance_steward'],
  tenant_or_domain: `${T}/${D}`, deployment_profile: 'local-dev', entitlement: 'full-platform', data_versions: ['0115'], model_versions: ['none'], configuration_digest: sha256('the demonstration configuration (local-dev)'),
  consequence_class: 'C2', period: '2026-10-15..2027-01-15' });
const CAP_KEY = 'CAP-FW-07';
let CAPF = null;
{
  let ws = await home();
  const signed = ws?.baselines?.find((b) => b.state === 'signed');
  // a baseline proposed BEFORE the owners and the rights: HELD on its gaps (the disputed state preserved)
  const firstBase = await q1(`select baseline_id::text id, version, state, gaps from governance.ws_baselines where title = $1 order by version limit 1`, [BASE_TITLE]);
  let BL = firstBase?.id ?? null;
  if (!firstBase) {
    const p = await wr(steward, `${PG}/baseline/propose`, 'governance.baseline.propose', { title: BASE_TITLE, scope: BASE_SCOPE(), expectedVersion: 0 }, 'PBL');
    if (!p.ok) fail('P. Castellano proposes the product baseline', p);
    else {
      BL = p.body.baseline.baseline_id;
      ok(`P. Castellano PROPOSED the product baseline ${p.body.baseline.ref ?? short(BL)} v1 BEFORE any owner or decision right: signable ${p.body.baseline.signable}, gaps ${(p.body.baseline.gaps ?? []).map((g) => `${g.gap}${g.count !== undefined ? ` (${g.count})` : ''}`).join(', ')}`);
      expectRefused('R. Moreau signs a baseline whose authority is unresolved', await wr(productB, `${PG}/baseline/${BL}/decide`, 'governance.baseline.decide', { version: 1, decision: 'sign', digest: p.body.baseline.digest,
        reason: 'the baseline read against the inventory and the rights (SYNTHETIC)' }, 'PBL', BL), 409, /\(held\): authority is unresolved/);
    }
  } else note(`the product baseline ${short(BL)} v1 was proposed before the owners by an earlier run (gaps ${(firstBase.gaps ?? []).map((g) => g.gap).join(', ')}): stands`);
  // the owners: every current capability without an accountable owner, ADOPTED by the product authority through the governed route
  ws = await home();
  const orphans = (ws?.inventory?.capabilities ?? []).filter((c) => c.standing === 'orphan');
  let assigned = 0; const failed = [];
  for (const c of orphans) {
    const fw = c.key === CAP_KEY;
    const owner = fw ? productB : productA;
    const boundary = fw ? 'Supply-chain intelligence' : (c.domain_boundary ?? `${c.controlling_volume ?? 'V8'} — the ${String(c.key).split('-').slice(0, 2).join('-')} capability family`);
    const r = await wr(productA, `${PG}/owners/assign`, 'governance.baseline.owner.assign', { capabilityId: c.capability_id, owner: owner.principalId, ownerRole: 'product_authority', domainBoundary: boundary,
      reason: `the accountable product owner of ${c.key} named for the baseline (SYNTHETIC)` }, 'PBL', c.capability_id);
    if (r.ok) assigned += 1; else failed.push(`${c.key}: ${refusalLine(r)}`);
  }
  if (orphans.length === 0) note(`every capability has its ONE accountable owner (${ws?.inventory?.count} capabilities): stands — an earlier run`);
  else (failed.length === 0 ? ok : bad)(`E. Lindgren (product authority, human gate) ASSIGNED the accountable owner of ${assigned}/${orphans.length} capabilities — ${CAP_KEY} to R. Moreau (boundary "Supply-chain intelligence"), every other to herself${failed.length ? ` — FAILED: ${failed.slice(0, 3).join(' | ')}` : ''}`);
  ws = await home();
  const inv = ws?.inventory ?? {};
  ((inv.orphans ?? []).length === 0 && (inv.lapsed ?? []).length === 0 ? ok : bad)(`the inventory: ${inv.count} capabilities in ${(inv.domains ?? []).length} boundaries; orphans ${(inv.orphans ?? []).length}, lapsed ${(inv.lapsed ?? []).length}, duplicates ${(inv.duplicates ?? []).length}${(inv.duplicates ?? []).length ? ` (${inv.duplicates.slice(0, 3).map((d) => d.keys.join('=')).join('; ')})` : ''}`);
  // the decision-rights matrix: proposed by the steward, approved (and signed) by the product authority
  const RIGHTS = [
    { subject: 'baseline', duty: 'propose', role: 'conformance_steward' }, { subject: 'baseline', duty: 'approve', role: 'product_authority' }, { subject: 'baseline', duty: 'audit', role: 'independent_assurance' },
    { subject: 'exception', duty: 'propose', role: 'operations_authority' }, { subject: 'exception', duty: 'approve', role: 'independent_assurance', principal: assurance.principalId },
    { subject: 'exception', duty: 'audit', role: 'product_authority' },
    { subject: 'change', duty: 'propose', role: 'conformance_steward' }, { subject: 'change', duty: 'approve', role: 'product_authority' }, { subject: 'change', duty: 'review', role: 'independent_assurance' },
    { subject: 'conflict', duty: 'propose', role: 'conformance_steward' }, { subject: 'conflict', duty: 'approve', role: 'product_authority' },
    { subject: 'decision_rights', duty: 'propose', role: 'conformance_steward' }, { subject: 'decision_rights', duty: 'approve', role: 'product_authority' },
    { subject: CAP_KEY, duty: 'operate', role: 'operations_authority' }, { subject: CAP_KEY, duty: 'approve', role: 'product_authority' },
  ];
  const approvedRights = ws?.rights?.find((r) => r.state === 'approved');
  if (approvedRights) note(`the decision-rights matrix ${approvedRights.ref} v${approvedRights.version} is APPROVED and signed: stands — an earlier run`);
  else {
    let prop = ws?.rights?.find((r) => r.state === 'proposed');
    if (!prop) {
      const p = await wr(steward, `${PG}/rights/propose`, 'governance.rights.propose', { rows: RIGHTS, expectedVersion: 0 }, 'PDR');
      if (!p.ok) fail('P. Castellano proposes the decision-rights matrix', p); else { prop = p.body.rights; ok(`P. Castellano PROPOSED the decision-rights matrix ${prop.ref} v${prop.version}: ${RIGHTS.length} rows — singular approvers, separation of duties (the approving role never proposes), the exception approver NAMED (H. Achterberg)`); }
    }
    if (prop) {
      expectRefused('P. Castellano (the proposer, a steward) approves the matrix', await wr(steward, `${PG}/rights/${prop.matrix_id}/decide`, 'governance.rights.decide', { version: prop.version, decision: 'approve', digest: prop.digest, reason: 'the steward approving its own proposal (refused)' }, 'PDR', prop.matrix_id), 403);
      const d = await wr(productA, `${PG}/rights/${prop.matrix_id}/decide`, 'governance.rights.decide', { version: prop.version, decision: 'approve', digest: prop.digest, reason: 'the decision rights read against the operating model (SYNTHETIC)' }, 'PDR', prop.matrix_id);
      if (!d.ok) fail('E. Lindgren approves the decision-rights matrix', d); else ok(`E. Lindgren (product authority, human gate) APPROVED and SIGNED the decision-rights matrix ${prop.ref} v${prop.version} at digest ${dg(prop.digest)}`);
    }
  }
  // the baseline: proposed again over the owned inventory and the approved rights; SIGNED by the other product authority (never its proposer)
  ws = await home();
  const s2 = ws?.baselines?.find((b) => b.state === 'signed');
  if (s2 || signed) note(`the product baseline ${(s2 ?? signed).ref} v${(s2 ?? signed).version} is SIGNED: stands — an earlier run`);
  else if (BL) {
    const cur = await q1(`select max(version)::int v from governance.ws_baselines where baseline_id = $1`, [BL]);
    const p = await wr(steward, `${PG}/baseline/propose`, 'governance.baseline.propose', { baselineId: BL, title: BASE_TITLE, scope: BASE_SCOPE(), expectedVersion: cur.v }, 'PBL', BL);
    if (!p.ok) fail('P. Castellano proposes the product baseline again', p);
    else {
      const b = p.body.baseline;
      ((b.signable === true && (b.gaps ?? []).length === 0) ? ok : bad)(`P. Castellano PROPOSED the product baseline v${b.version} over ${b.capabilities} owned capabilities and the approved rights: signable ${b.signable}, gaps ${(b.gaps ?? []).map((g) => g.gap).join(', ') || 'none'}`);
      const pv = await rd(productB, `${PG}/preview`, { kind: 'baseline', id: BL, version: b.version }, 'governance.read', 'GWS');
      if (pv.ok) note(`R. Moreau's preview: can decide ${pv.body.eligibility?.can_decide}${(pv.body.eligibility?.reasons ?? []).length ? ` (${pv.body.eligibility.reasons.join('; ')})` : ''} — ${String(pv.body.consequence ?? '').slice(0, 260)}`);
      expectRefused('P. Castellano (the proposer) signs the baseline', await wr(steward, `${PG}/baseline/${BL}/decide`, 'governance.baseline.decide', { version: b.version, decision: 'sign', digest: b.digest, reason: 'the proposer signing (refused)' }, 'PBL', BL), 403);
      const d = await wr(productB, `${PG}/baseline/${BL}/decide`, 'governance.baseline.decide', { version: b.version, decision: 'sign', digest: b.digest,
        reason: 'the baseline read against the owned inventory, the decision rights and the exceptions — every capability has its accountable owner (SYNTHETIC)' }, 'PBL', BL);
      if (!d.ok) fail('R. Moreau signs the product baseline', d);
      else ok(`R. Moreau (product authority, human gate) SIGNED the product baseline v${b.version} (${d.body.baseline.state}, claim ${d.body.baseline.claim}) at digest ${dg(b.digest)} — a DEMONSTRATION: the real executive attestation is H3`);
    }
  }
  ws = await home();
  const sb = ws?.baselines?.find((b) => b.state === 'signed');
  const sig = sb ? await q1(`select s.signer::text, s.signer_role, s.subject_kind, s.key_id from governance.ws_baselines b join governance.signatures s on s.signature_id = b.signature_id where b.baseline_id = $1 and b.state = 'signed'`, [sb.baseline_id]) : null;
  (sb && sig ? ok : bad)(`THE SIGNED BASELINE ${sb?.ref} v${sb?.version}: signature ${sig?.subject_kind} by ${nm(sig?.signer)} (${sig?.signer_role}), key ${sig?.key_id ?? '—'}; posture: ${Object.entries(ws?.posture?.dimensions ?? {}).map(([k, v]) => `${k} ${v.state}`).join(', ')}`);
  const reg = ws?.repository_registers ?? {};
  const p3 = (reg.engineering?.entries ?? []).find((e) => e.id === 'EXC-P0-003');
  (p3?.expired === true ? ok : bad)(`the workspace REPORTS EXC-P0-003 EXPIRED (${p3?.expiry_date}) beside ${(reg.supply_chain?.entries ?? []).length} C15 SCX dispositions — ${String(reg.engineering?.note ?? '').slice(0, 140)}`);
  // CAP-FW-07 with its owner and its trace
  CAPF = (ws?.inventory?.capabilities ?? []).find((c) => c.key === CAP_KEY) ?? null;
  if (!CAPF) bad(`${CAP_KEY} is not in the inventory`);
  else {
    const t = await rd(steward, `${RG}/trace`, { kind: 'capability', key: CAP_KEY, depth: 2 }, 'governance.read', 'GRG');
    if (!t.ok) fail(`the trace of ${CAP_KEY}`, t);
    else {
      const nodes = [...(t.body.trace?.up?.nodes ?? []), ...(t.body.trace?.down?.nodes ?? [])];
      const kinds = {}; for (const x of nodes) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
      ok(`${CAP_KEY} "${String(CAPF.title).slice(0, 110)}…": owner ${CAPF.owner_name ?? nm(CAPF.owner)} (${CAPF.standing}), boundary ${CAPF.domain_boundary}; its trace (depth 2): ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    }
  }
}

/* ── B107-2 CHANGE IMPACT ────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-2 CHANGE IMPACT on the forecast contract FCT@v2 (§RG, §PG) — who cites it, the real test run, the deterministic impact, the change proposal and its six plans');
const FCT = await q1(`select artifact_id::text id, version, digest from governance.artifacts where kind = 'schema' and external_key = 'FCT@v2' and superseded_at is null`);
const L6C01 = await q1(`select artifact_id::text id, title from governance.artifacts where kind = 'component' and external_key = 'L6-C01' and superseded_at is null`);
const REPORTS = {};
if (!FCT || !L6C01) { bad('the forecast contract FCT@v2 or the component L6-C01 is not registered (scene 1)'); }
else {
  const consumers = await q(`select f.external_key k from governance.links_live l join governance.artifacts f on f.artifact_id = l.from_artifact and f.superseded_at is null where l.to_artifact = $1 and l.relation = 'consumes' order by 1`, [FCT.id]);
  ok(`the forecast contract FCT@v2 (B25's forecast schema, imported from objects.schema_registry): consumed by ${consumers.length} manifest components (${consumers.map((x) => x.k).join(', ')})`);
  // the corridor's decision-active products citing it — declared by the corridor's administrator (a briefing that reads forecasts; the committed package on the 90-day forecast)
  const brief = await q1(`select briefing_id::text id, known_at from executive.briefings where tenant_id = $1 and domain_id = $2 and items::text ilike '%forecast%' order by known_at desc limit 1`, [T, D]);
  const pkg = await q1(`select package_id::text id, title from decision.packages_current where tenant_id = $1 and domain_id = $2 and state = 'committed' and title ilike '%forecast%' order by declared_at limit 1`, [T, D]);
  for (const [kind, obj, title] of [['briefing', brief?.id, `The corridor briefing of ${iso(brief?.known_at).slice(0, 10)} (reads the 90-day forecasts)`], ['decision_package', pkg?.id, pkg?.title]]) {
    if (!obj) { note(`no ${kind} citing a forecast is found in the corridor — not declared`); continue; }
    const r = await dwr(richter, D, `${RGD(D)}/products/declare`, 'governance.trace.domain_cite', { productKind: kind, objectId: obj, title, cites: [{ kind: 'schema', key: 'FCT@v2' }],
      reason: `the corridor's ${kind.replace('_', ' ')} rests on forecasts issued under FCT@v2 (SYNTHETIC record)` }, 'ART', obj);
    if (!r.ok) fail(`T. Richter declares the ${kind} citing FCT@v2`, r);
    else if (r.body.product?.unchanged) note(`the ${kind} ${short(obj)} is declared as citing FCT@v2: stands — an earlier run`);
    else ok(`T. Richter (the corridor's administrator) DECLARED the ${kind} "${String(title).slice(0, 90)}" (${short(obj)}) as CITING the vendor's contract FCT@v2 — a decision-active dependent of any change to it`);
  }
  // the real verification record: the forecast unit tests at this head (vitest JSON written by the runner), ingested by the steward and reviewed by independent assurance
  async function ingest(file, name) {
    const raw = readFileSync(join(EVIDENCE, file), 'utf8');
    const r = await wr(steward, `${RG}/verification/ingest`, 'governance.verification.ingest', { format: 'vitest', name, report: raw, claim: 'construction', validDays: 30 }, 'VER');
    if (!r.ok) { fail(`P. Castellano ingests ${file}`, r); return null; }
    const v = r.body.verification; const rec = v.record ?? {};
    (rec.result === 'passed' ? (v.duplicate ? note : ok) : bad)(`${v.duplicate ? `${file} is already a verification record (the same report is the same record): stands — an earlier run` : `P. Castellano INGESTED ${file}`} — ${rec.totals?.passed}/${rec.totals?.cases} passed, result ${rec.result}, claim ${rec.claim}, source digest ${dg(rec.source_digest)}, head ${dg(rec.identity?.build?.head_sha)}, valid until ${iso(rec.valid_until)}`);
    const art = await q1(`select artifact_id::text id, digest, effective_from from governance.artifacts where kind = 'evidence' and external_key = $1 and superseded_at is null`, [`verification:${rec.source_digest}`]);
    const row = await q1(`select ingested_at, valid_until from governance.rg_verification_records where record_id = $1`, [rec.record_id]);
    REPORTS[file] = { recordId: rec.record_id, digest: rec.source_digest, artifactId: art?.id ?? null, artifactDigest: art?.digest ?? null, capturedAt: new Date(JSON.parse(raw).startTime).toISOString(), validUntil: row?.valid_until ?? null, totals: rec.totals };
    return REPORTS[file];
  }
  const fr = await ingest('b107-forecast-contract.vitest.json', `The forecast contract tests (apps/api/test/unit/prediction) at head ${String(BUILD.head).slice(0, 12)}`);
  if (fr) {
    const reviewed = await q1(`select decision, reviewer::text from governance.rg_verification_reviews where record_id = $1 limit 1`, [fr.recordId]).catch(() => null);
    if (reviewed) note(`the record ${short(fr.recordId)} was reviewed (${reviewed.decision}) by ${nm(reviewed.reviewer)}: stands — an earlier run`);
    else {
      expectRefused('P. Castellano (the ingester) reviews its own record', await wr(steward, `${RG}/verification/${fr.recordId}/review`, 'governance.verification.review', { decision: 'accepted', digest: fr.digest, reason: 'my own record (refused)' }, 'VER', fr.recordId), 403);
      const rv = await wr(assurance, `${RG}/verification/${fr.recordId}/review`, 'governance.verification.review', { decision: 'accepted', digest: fr.digest,
        reason: 'the cases ran at the declared head and passed; they exercise the forecast issue, events and registry (SYNTHETIC review)' }, 'VER', fr.recordId);
      if (!rv.ok) fail('H. Achterberg reviews the verification record', rv); else ok(`H. Achterberg (independent assurance, human gate) REVIEWED the record on its exact digest: ${rv.body.review?.decision}`);
    }
    const l = await wr(steward, `${RG}/links/record`, 'governance.trace.link', { from: fr.artifactId, to: L6C01.id, relation: 'verifies', reason: 'the forecast unit tests exercise the forecast registry and horizon service (L6-C01)' }, 'GRG');
    if (l.ok) ok(`P. Castellano LINKED the verification record (evidence ${short(fr.artifactId)}) → L6-C01 "${L6C01.title}" (verifies)`);
    else if (l.status === 409 && /\(duplicate\)/.test(String(l.body?.message))) note('the record verifies L6-C01: stands — an earlier run');
    else fail('P. Castellano links the record to L6-C01', l);
  }
  // the DETERMINISTIC impact of a proposed change of the contract (the same input → the same digest)
  const changes = [{ kind: 'schema', key: 'FCT@v2', proposedDigest: sha256('FCT@v3 — the forecast contract gains an optional interval field (proposed, SYNTHETIC)') }];
  const a = await rd(steward, `${RG}/impact/preview`, { changes }, 'governance.read', 'GRG');
  const b = await rd(productA, `${RG}/impact/preview`, { changes }, 'governance.read', 'GRG');
  if (!a.ok || !b.ok) fail('the impact preview', a.ok ? b : a);
  else {
    const im = a.body.impact;
    const byDepth = {}; for (const x of im.dependents ?? []) byDepth[`${x.depth}:${x.kind}`] = (byDepth[`${x.depth}:${x.kind}`] ?? 0) + 1;
    (im.digest === b.body.impact.digest ? ok : bad)(`the impact is DETERMINISTIC: the steward and the product authority are shown the same digest ${dg(im.digest)} — dependents ${Object.entries(byDepth).map(([k, v]) => `${v}× ${k}`).join(', ')}`);
    ((im.decision_active ?? []).length > 0 ? ok : bad)(`decision-active dependents in the customer's domain: ${(im.decision_active ?? []).map((x) => `${x.key} (${x.scope})`).join(', ') || 'none'}; requirements to re-verify ${(im.requirements_to_reverify ?? []).length} (${(im.requirements_to_reverify ?? []).slice(0, 6).map((x) => x.key).join(', ')}); stale verifications ${(im.stale_verifications ?? []).length}; release candidates ${(im.release_candidates ?? []).length}`);
    const rec = await q1(`select impact_id::text id, trigger, digest, recorded_at from governance.rg_impacts where trigger = 'proposal' and input @> $1::jsonb order by recorded_at limit 1`,
      [JSON.stringify([{ key: 'FCT@v2', proposed_digest: changes[0].proposedDigest }])]);
    if (rec) note(`the impact of this proposal was recorded (${rec.trigger}, digest ${dg(rec.digest)}) at ${iso(rec.recorded_at)}: stands — an earlier run${rec.digest !== im.digest ? ` (the links moved since: the same input reads ${dg(im.digest)} now — a stale record is never re-recorded silently)` : ''}`);
    else {
      expectRefused('E. Lindgren (product authority) records the impact', await wr(productA, `${RG}/impact/record`, 'governance.impact.record', { changes, expectedDigest: im.digest, trigger: 'proposal' }, 'GRG'), 403);
      const r = await wr(steward, `${RG}/impact/record`, 'governance.impact.record', { changes, expectedDigest: im.digest, trigger: 'proposal' }, 'GRG');
      if (!r.ok) fail('P. Castellano records the impact on the digest shown', r);
      else ok(`P. Castellano RECORDED the impact as a PROPOSAL on the digest shown (${dg(r.body.impact?.digest)}): it holds nothing (held ${(r.body.impact?.held ?? []).length}) — a proposal is analysed, never executed`);
    }
  }
  // THE CHANGE PROPOSAL (§PG): not approvable without its six plans; complete → approved and signed by the product authority (never its proposer, never a builder)
  const CP_TITLE = 'FCT@v3 — the forecast contract gains an optional interval field (SYNTHETIC change proposal)';
  const PLANS = { consumer_impact: 'the corridor briefing and the committed 90-day-forecast package citing FCT@v2 are re-read; the nine L6 components re-verified',
    compatibility: 'v3 adds an optional interval field; every v2 consumer keeps working unchanged', migration: 'no stored forecast is migrated; new issuances carry v3',
    replay: 'decisions replay against the forecast version they cited (known-at discipline)', rollback: 'v2 stays published until the window closes; v3 is withdrawn by version',
    evidence: 'the forecast contract tests re-run green at the candidate head and are independently reviewed' };
  let cp = await q1(`select proposal_id::text id, max(version)::int v from governance.ws_change_proposals where title = $1 group by 1`, [CP_TITLE]);
  const cpState = cp ? await q1(`select state, digest from governance.ws_change_proposals where proposal_id = $1 and version = $2`, [cp.id, cp.v]) : null;
  if (cpState?.state === 'approved') note(`the change proposal ${short(cp.id)} v${cp.v} is APPROVED and signed: stands — an earlier run`);
  else {
    let v1 = null;
    if (!cp) {
      const r = await wr(steward, `${PG}/changes/propose`, 'governance.change.propose', { title: CP_TITLE, changeClass: 'interface', subjects: [FCT.id], description: 'the forecast contract gains an optional prediction-interval field (SYNTHETIC)',
        plans: { consumer_impact: PLANS.consumer_impact }, builders: [ops.principalId] }, 'GCP');
      if (!r.ok) fail('P. Castellano proposes the change', r);
      else {
        v1 = r.body.change; cp = { id: v1.proposal_id, v: v1.version };
        (v1.approvable === false ? ok : bad)(`P. Castellano PROPOSED ${v1.ref} v1 "${CP_TITLE}" with ONE plan: approvable ${v1.approvable}, missing ${(v1.missing_plans ?? []).join(', ')}; required ${(v1.required_roles ?? []).join(', ')}; its impact ${(v1.impact?.dependents ?? []).length} dependents`);
        expectRefused('E. Lindgren approves the change without its plans', await wr(productA, `${PG}/changes/${cp.id}/decide`, 'governance.change.decide', { version: 1, decision: 'approve', digest: v1.digest, reason: 'approving without the plans (refused)' }, 'GCP', cp.id), 422, /\(plans\)/);
      }
    }
    if (cp) {
      const cur = await q1(`select state, digest, version, plans from governance.ws_change_proposals where proposal_id = $1 order by version desc limit 1`, [cp.id]);
      let v2 = cur;
      if (Object.keys(cur.plans ?? {}).length < 6) {
        const r = await wr(steward, `${PG}/changes/propose`, 'governance.change.propose', { proposalId: cp.id, expectedVersion: cur.version, title: CP_TITLE, changeClass: 'interface', subjects: [FCT.id],
          description: 'the forecast contract gains an optional prediction-interval field (SYNTHETIC)', plans: PLANS, builders: [ops.principalId] }, 'GCP', cp.id);
        if (!r.ok) { fail('P. Castellano completes the change proposal', r); v2 = null; }
        else { v2 = r.body.change; (v2.approvable ? ok : bad)(`P. Castellano COMPLETED ${v2.ref} v${v2.version} with the six plans (consumer impact, compatibility, migration, replay, rollback, evidence): approvable ${v2.approvable}`); }
      }
      if (v2) {
        const ver = v2.version; const digest = v2.digest;
        expectRefused('K. Mensah (a declared builder of the change) approves it', await wr(ops, `${PG}/changes/${cp.id}/decide`, 'governance.change.decide', { version: ver, decision: 'approve', digest, reason: 'the builder approving (refused)' }, 'GCP', cp.id), 403);
        const d = await wr(productA, `${PG}/changes/${cp.id}/decide`, 'governance.change.decide', { version: ver, decision: 'approve', digest, reason: 'the change read against its six plans and its deterministic impact (SYNTHETIC)' }, 'GCP', cp.id);
        if (!d.ok) fail('E. Lindgren approves the change', d); else ok(`E. Lindgren (product authority, human gate) APPROVED and SIGNED the change v${ver} (${d.body.change.state}) — the approval of a PROPOSAL: nothing is changed in the contract by this act`);
      }
    }
  }
  // the admission check (the construction half; production admission is R1)
  const adm = await rd(steward, `${RG}/admission/check`, { kind: 'component', key: 'L6-C01' }, 'governance.read', 'GRG');
  if (!adm.ok) fail('the admission check of L6-C01', adm);
  else ok(`the ADMISSION CHECK of L6-C01: admissible ${adm.body.admission?.admissible}${(adm.body.admission?.blocking ?? []).length ? ` — blocking ${(adm.body.admission.blocking).slice(0, 4).map((x) => `${x.class}: ${String(x.detail ?? x.reason ?? JSON.stringify(x)).slice(0, 160)}`).join('; ')}` : ''}; claim ${adm.body.admission?.claim}; ${String(adm.body.admission?.production_admission ?? '').slice(0, 200)}`);
}

/* ── B107-3 PART I ───────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-3 THE EXPIRED EXCEPTION HOLDS THE RELEASE CANDIDATE — PART I (§CM, §PG): the candidate over real evidence, checked; the export-path exception with a SHORT validity, approved');
const RC_LABEL = 'NORDWERK corridor release candidate 2026-10 (SYNTHETIC — a local release-candidate record, B65 substituted: NOT a release)';
const EX_TITLE = 'Export path: delivery receipts for the corridor acknowledged by manual confirmation for a bounded window (SYNTHETIC)';
const EX_MINUTES = Number(process.env.EYE_B107_EXCEPTION_MINUTES ?? 4);
const ingestReport = async (file, name) => {
  const raw = readFileSync(join(EVIDENCE, file), 'utf8');
  const r = await wr(steward, `${RG}/verification/ingest`, 'governance.verification.ingest', { format: 'vitest', name, report: raw, claim: 'construction', validDays: 30 }, 'VER');
  if (!r.ok) { fail(`P. Castellano ingests ${file}`, r); return null; }
  const v = r.body.verification; const rec = v.record ?? {};
  const art = await q1(`select artifact_id::text id, digest from governance.artifacts where kind = 'evidence' and external_key = $1 and superseded_at is null`, [`verification:${rec.source_digest}`]);
  const row = await q1(`select ingested_at, valid_until from governance.rg_verification_records where record_id = $1`, [rec.record_id]);
  (rec.result === 'passed' ? (v.duplicate ? note : ok) : bad)(`${v.duplicate ? `${file}: the same report is the same record — stands, an earlier run` : `P. Castellano INGESTED ${file}`} (${rec.totals?.passed}/${rec.totals?.cases} passed at head ${dg(rec.identity?.build?.head_sha)}; evidence ${short(art?.id)})`);
  // captured_at is the RUN's instant (the runner's startTime), never the ingestion's
  return { recordId: rec.record_id, artifactId: art?.id ?? null, artifactDigest: art?.digest ?? null, capturedAt: new Date(JSON.parse(raw).startTime).toISOString(), validUntil: row?.valid_until ?? null };
};
const CONTRACT = await ingestReport('b107-contract.vitest.json', `The port and envelope contract tests (packages/contracts/test) at head ${String(BUILD.head).slice(0, 12)}`);
const TRUST = await ingestReport('b107-trust.vitest.json', `The trust tests — the PDP and the scope rules (apps/api/test/unit) at head ${String(BUILD.head).slice(0, 12)}`);
const HUMAN = await ingestReport('b107-human-authority.vitest.json', `The human-authority tests — the governance approver rules and the gates (apps/api/test/unit) at head ${String(BUILD.head).slice(0, 12)}`);
const EXPORT = await ingestReport('b107-export-path.vitest.json', `The export-path tests — the import package and the revocation notice (apps/api/test/unit/retention) at head ${String(BUILD.head).slice(0, 12)}`);
const item = (family, rep, what) => ({ family, kind: 'artifact', ref: what, artifact_id: rep.artifactId, digest: rep.artifactDigest, bound_head_sha: BUILD.head,
  captured_at: new Date(rep.capturedAt).toISOString(), valid_until: new Date(rep.validUntil).toISOString() });
let RC = await q1(`select candidate_id::text id, max(version)::int v from governance.cm_release_candidates where label = $1 group by 1`, [RC_LABEL]);
{
  if (RC) {
    const c = await q1(`select state, digest, head_sha from governance.cm_release_candidates where candidate_id = $1 and version = $2`, [RC.id, RC.v]);
    note(`the release candidate ${short(RC.id)} v${RC.v} (${c.state}, head ${dg(c.head_sha)}) stands — an earlier run`);
  } else if (CONTRACT && TRUST && HUMAN) {
    const r = await wr(steward, `${CM}/candidates/assemble`, 'governance.conformance.candidate.assemble', { label: RC_LABEL, expectedVersion: 0, periodFrom: new Date().toISOString().slice(0, 10), periodTo: new Date().toISOString().slice(0, 10),
      scope: { kind: 'tenants', tenants: [T], domains: [D] }, builders: [ops.principalId],
      evidence: [item('contract', CONTRACT, 'the port and envelope contract tests (verification record)'), item('trust', TRUST, 'the PDP and scope tests (verification record)'),
        item('human_authority', HUMAN, 'the governance approver and gate tests (verification record)')] }, 'RCN');
    if (!r.ok) fail('P. Castellano assembles the release candidate', r);
    else {
      const c = r.body.candidate; RC = { id: c.candidate_id, v: c.version };
      ok(`P. Castellano ASSEMBLED ${short(c.candidate_id)} v${c.version} "${RC_LABEL.slice(0, 60)}…": the SERVER's identity — head ${dg(c.head_sha)}, migration head ${c.migration_head}, policy bundle ${c.policy_bundle?.version} ${dg(c.policy_bundle?.digest)}, manifest v${c.manifest_version}, profile ${c.deployment_profile}; release ${c.release}, claim ${c.claim}; builder K. Mensah`);
    }
  }
  if (RC) {
    const cur = await q1(`select state from governance.cm_release_candidates where candidate_id = $1 and version = $2`, [RC.id, RC.v]);
    if (cur.state === 'assembled') {
      const ch = await wr(steward, `${CM}/candidates/${RC.id}/check`, 'governance.conformance.candidate.check', { version: RC.v }, 'RCN', RC.id);
      if (!ch.ok) fail('P. Castellano checks the candidate', ch);
      else (ch.body.check?.outcome === 'conformant' ? ok : bad)(`the CHECK: ${String(ch.body.check?.outcome).toUpperCase()} — the three required families present, current, verifiable and bound to this head; carried (never inferred present): ${ch.body.check?.carried_by}; ${ch.body.check?.not_a_release}`);
    } else note(`the candidate's state: ${cur.state}`);
  }
}
let EX = await q1(`select exception_id::text id from governance.ws_exceptions where title = $1 limit 1`, [EX_TITLE]);
const L3C05 = await q1(`select artifact_id::text id from governance.artifacts where kind = 'component' and external_key = 'L3-C05' and superseded_at is null`);
const UNIT = await q1(`select artifact_id::text id from governance.artifacts where kind = 'deployable_unit' and external_key = 'api.retention' and superseded_at is null`);
const MS17 = await q1(`select artifact_id::text id from governance.artifacts where kind = 'requirement' and external_key = 'V6:MS-17' and superseded_at is null`);
const exEvidence = (rep) => [{ kind: 'test_report', ref: `b107-export-path.vitest.json — the export-path tests at head ${String(BUILD.head).slice(0, 12)} (verification record ${short(rep.recordId)})`, digest: rep.artifactDigest,
  captured_at: new Date(rep.capturedAt).toISOString(), valid_until: new Date(rep.validUntil).toISOString() }];
{
  if (EX) {
    const rows = await q(`select version, state, expires_at from governance.ws_exceptions where exception_id = $1 order by version`, [EX.id]);
    note(`the export-path exception ${short(EX.id)}: ${rows.map((x) => `v${x.version} ${x.state} (expires ${iso(x.expires_at)})`).join(', ')}: stands — an earlier run`);
  } else if (RC && EXPORT && L3C05 && UNIT) {
    const now = await dbNow();
    const expiresAt = new Date(now.getTime() + EX_MINUTES * 60_000).toISOString();
    const r = await wr(ops, `${PG}/exceptions/propose`, 'governance.exception.propose', { title: EX_TITLE, requirementRef: 'V6:MS-17', ...(MS17 ? { requirementArtifact: MS17.id } : {}), contractKey: 'export-receipt-acknowledgement',
      systemScope: [L3C05.id, UNIT.id], customerScope: { domains: [{ tenant: T, domain: D }] },
      reason: 'the corridor\'s export recipient acknowledges receipts by a manual confirmation while its endpoint is re-certified; a bounded window with compensating controls (SYNTHETIC)',
      evidence: exEvidence(EXPORT), risk: { level: 'medium', statement: 'an export delivery is confirmed by a person instead of the signed receipt for a bounded window (SYNTHETIC)' },
      affectedInvariants: ['export_integrity'], compensatingControls: ['the delivery digest is compared by the domain administrator', 'the export stays held for manual release'],
      owner: ops.principalId, expandsAuthority: true, removesControl: false, expiresAt, monitoring: 'the conformance monitor and the attention tick read the exception and the candidate',
      exitCriteria: 'the recipient endpoint returns signed receipts again', remediationPlan: 're-certify the recipient endpoint before the window closes', affectedArtifacts: [RC.id] }, 'GEX');
    if (!r.ok) fail('K. Mensah proposes the export-path exception', r);
    else {
      const e = r.body.exception; EX = { id: e.exception_id };
      ok(`K. Mensah (operations authority, its owner) PROPOSED ${e.ref} v1 "${EX_TITLE.slice(0, 70)}…" against V6:MS-17 on the export path (L3-C05 + api.retention), the corridor only, affecting the release candidate; a SHORT validity: expires ${iso(expiresAt)} (${EX_MINUTES} min on the database clock); approver roles ${(e.approver_roles ?? []).join(', ')}`);
      expectRefused('E. Lindgren (product authority) approves an exception that expands a component\'s authority', await wr(productA, `${PG}/exceptions/${e.exception_id}/decide`, 'governance.exception.decide',
        { version: 1, decision: 'approve', digest: e.digest, reason: 'the product authority approving (refused)' }, 'GEX', e.exception_id), 403, /\(authority\)/);
      expectRefused('K. Mensah (the owner) approves his own exception', await wr(ops, `${PG}/exceptions/${e.exception_id}/decide`, 'governance.exception.decide',
        { version: 1, decision: 'approve', digest: e.digest, reason: 'the owner approving (refused)' }, 'GEX', e.exception_id), 403);
      const pv = await rd(assurance, `${PG}/preview`, { kind: 'exception', id: e.exception_id, version: 1 }, 'governance.read', 'GWS');
      if (pv.ok) note(`H. Achterberg's preview: can decide ${pv.body.eligibility?.can_decide}; ${String(pv.body.consequence ?? '').slice(0, 220)}`);
      const d = await wr(assurance, `${PG}/exceptions/${e.exception_id}/decide`, 'governance.exception.decide', { version: 1, decision: 'approve', digest: pv.ok ? pv.body.digest : e.digest,
        reason: 'the window is bounded, the compensating controls are concrete and the export-path tests are current (SYNTHETIC)' }, 'GEX', e.exception_id);
      if (!d.ok) fail('H. Achterberg approves the exception', d);
      else ok(`H. Achterberg (independent assurance — the matrix's NAMED approver, human gate) APPROVED and SIGNED ${e.ref} v1 (${d.body.exception.state}) — in force until ${iso(expiresAt)}`);
    }
  }
  if (RC) ENV_OUT.EYE_B107_CANDIDATE = RC.id;
}

/* ── B107-4 PART I ───────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-4 SCOPE-SPECIFIC ACCEPTANCE — PART I (§AR): CAP-FW-07 accepted for the CORRIDOR only, over a real test report and a SHORT-LIVED journey evidence item');
const ACC_MINUTES = Number(process.env.EYE_B107_EVIDENCE_MINUTES ?? 6);
const ACC_TITLE = 'Supply-chain intelligence workspace (CAP-FW-07) for the corridor domain — the Regensburg line (SYNTHETIC demonstration)';
const JOURNEY_FILE = 'evidence/phase6-browser/b33-supply-03-map.png';
const JOURNEY_CAPTURED = new Date((await import('node:child_process')).execFileSync('git', ['-C', SELF_ROOT, 'log', '-1', '--format=%cI', '--', JOURNEY_FILE], { encoding: 'utf8' }).trim()).toISOString();
const SUPPLY = await ingestReport('b107-supply-chain.vitest.json', `The supply-chain intelligence tests (apps/api/test/unit: supply, supply network, twin, supply flow) at head ${String(BUILD.head).slice(0, 12)}`);
const ACC_SCOPE = () => ({ capability_version: 'CAP-FW-07 as imported from the V8 register (2026-10)', journeys: ['JRN-11', 'JRN-24'], roles: ['domain_analyst', 'executive'], deployment_profile: 'local-dev',
  entitlement: 'supply_chain_intelligence', data_versions: { 'supply.network': 'hub-module network (3 tiers)', 'corridor.flows': 'red-sea-corridor-stream' }, model_versions: { 'supply-flow': 'supply-flow@1' },
  configuration_digest: sha256('the corridor domain configuration as read 2026-10-15'), consequence_class: 'C2', period: { from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10) } });
const accRecord = async () => q1(`select record_id::text id, max(version)::int v from governance.acceptance_records where tenant_id = $1 and domain_id = $2 and subject_key = $3 and title like 'Supply-chain intelligence workspace (CAP-FW-07)%' group by 1 order by 1 limit 1`, [T, D, CAP_KEY]);
const accVersion = async (id, v) => q1(`select version, state, digest, obligations, effective_scope, constrained_reasons, evidence from governance.acceptance_records where record_id = $1 and version = $2`, [id, v]);
const journeyItem = async () => q1(`select evidence_id::text id, valid_until from governance.acceptance_evidence where tenant_id = $1 and domain_id = $2 and kind = 'journey_evidence' and pointer = $3 and renews is null order by captured_at limit 1`, [T, D, JOURNEY_FILE]);
let ACC = await accRecord();
let SHORT = null; let TEST_ITEM = null;
const PEOPLE = { product: productB, independent_assurance: assurance, customer: sponsor };
async function attestAll(id, v, digest) {
  const ver = await q1(`select count(*)::int n from governance.acceptance_verifications where record_id = $1 and version = $2`, [id, v]);
  if (ver.n === 0) {
    const r = await dwr(sponsor, D, `${AR(D)}/records/${id}/verify`, 'governance.acceptance.verify', { version: v, digest, findings: 'the scope, the journeys and the evidence read against the corridor\'s own operation (SYNTHETIC)' }, 'ACR', id);
    if (!r.ok) { fail('W. Zielińska verifies the record', r); return null; }
    ok(`W. Zielińska (customer sponsor, human gate) VERIFIED v${v} on its digest ${dg(digest)} — the customer verifies before any attestation`);
  }
  let last = null;
  for (const o of ['product', 'independent_assurance', 'customer']) {
    const done = await q1(`select count(*)::int n from governance.acceptance_attestations where record_id = $1 and version = $2 and obligation = $3`, [id, v, o]);
    if (done.n > 0) { note(`the ${o} obligation of v${v} is attested: stands`); continue; }
    const s = PEOPLE[o];
    const r = await dwr(s, D, `${AR(D)}/records/${id}/attest`, 'governance.acceptance.attest', { version: v, obligation: o, decision: 'attest', digest, reason: `the ${o.replace('_', ' ')} obligation read against the exact scope and its evidence (SYNTHETIC)` }, 'ACR', id);
    if (!r.ok) { fail(`${nm(s.principalId)} attests the ${o} obligation`, r); return null; }
    last = r.body.attestation;
    ok(`${nm(s.principalId)} ATTESTED the ${o} obligation of v${v} (signed): record ${last.state}${(last.unmet ?? []).length ? `, unmet ${last.unmet.join(', ')}` : ''}`);
  }
  return last;
}
{
  // the evidence vault (the steward): the real test report by reference, and the B33 walk of the supply map — valid for a SHORT window
  TEST_ITEM = await q1(`select evidence_id::text id from governance.acceptance_evidence where tenant_id = $1 and domain_id = $2 and kind = 'test_report' and subject_id = $3 order by captured_at limit 1`, [T, D, SUPPLY?.artifactId]);
  if (TEST_ITEM) note(`the test-report evidence ${short(TEST_ITEM.id)} stands — an earlier run`);
  else if (SUPPLY) {
    const r = await dwr(steward, D, `${AR(D)}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'test_report', title: 'The supply-chain intelligence tests at the deployed head (verification record)', subjectKind: 'governance.artifact',
      subjectId: SUPPLY.artifactId, covers: { journeys: ['JRN-11'] }, outcome: 'passed', capturedAt: new Date(SUPPLY.capturedAt).toISOString(), validUntil: new Date(SUPPLY.validUntil).toISOString() }, 'AEV');
    if (!r.ok) fail('P. Castellano records the test-report evidence', r);
    else { TEST_ITEM = { id: r.body.evidence.evidence_id }; ok(`P. Castellano RECORDED the test-report evidence ${short(TEST_ITEM.id)} by REFERENCE to the §RG verification record (digest bound from the row ${dg(r.body.evidence.subject_digest)}), covers JRN-11, valid until ${iso(SUPPLY.validUntil)}`); }
  }
  SHORT = await journeyItem();
  if (SHORT) note(`the journey evidence ${short(SHORT.id)} (valid until ${iso(SHORT.valid_until)}) stands — an earlier run`);
  else {
    const bytes = readFileSync(join(SELF_ROOT, JOURNEY_FILE));
    const captured = JOURNEY_CAPTURED;
    const until = new Date((await dbNow()).getTime() + ACC_MINUTES * 60_000).toISOString();
    const r = await dwr(steward, D, `${AR(D)}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'journey_evidence', title: 'The B33 browser walk of the supply map (JRN-11) — accepted as current for a SHORT window only (SYNTHETIC demonstration of evidence expiry)',
      subjectKind: 'external', pointer: JOURNEY_FILE, digest: sha256(bytes), covers: { journeys: ['JRN-11'] }, outcome: 'passed', capturedAt: new Date(captured).toISOString(), validUntil: until }, 'AEV');
    if (!r.ok) fail('P. Castellano records the journey evidence', r);
    else { SHORT = { id: r.body.evidence.evidence_id, valid_until: until }; ok(`P. Castellano RECORDED the journey evidence ${short(SHORT.id)}: ${JOURNEY_FILE} (sha256 ${dg(sha256(bytes))}, captured ${iso(captured)}), covers JRN-11 — a REAL SHORT validity: until ${iso(until)} (${ACC_MINUTES} min on the database clock)`); }
  }
  if (ACC) {
    const v = await accVersion(ACC.id, ACC.v);
    note(`the corridor's acceptance record ${short(ACC.id)} v${ACC.v} is ${v.state.toUpperCase()}: stands — an earlier run`);
  } else if (TEST_ITEM && SHORT) {
    const r = await dwr(productA, D, `${AR(D)}/records/propose`, 'governance.acceptance.propose', { kind: 'capability', title: ACC_TITLE, subjectKey: CAP_KEY, scope: ACC_SCOPE(), evidence: [TEST_ITEM.id, SHORT.id], obligations: [] }, 'ACR');
    if (!r.ok) fail('E. Lindgren proposes the corridor\'s acceptance of CAP-FW-07', r);
    else {
      const rec = r.body.record; ACC = { id: rec.record_id, v: rec.version };
      ok(`E. Lindgren (product authority) PROPOSED the acceptance ${short(rec.record_id)} v${rec.version} for the CORRIDOR only: the exact tuple (tenant, domain, journeys JRN-11 + JRN-24, roles domain_analyst + executive, local-dev, C2, ${rec.scope?.period?.from} → ${rec.scope?.period?.to}); obligations ${(rec.obligations ?? []).join(', ')}; OPEN CONDITIONS ${(rec.conditions ?? []).length} (${(rec.conditions ?? []).map((c) => c.key).join(', ')}) — an absent evidence slot is an open condition, never a silent pass; claim ${rec.claim}`);
    }
  }
  if (ACC) {
    const v = await accVersion(ACC.id, ACC.v);
    if (v.state === 'proposed') {
      expectRefused('W. Zielińska attests the customer obligation BEFORE verifying', await dwr(sponsor, D, `${AR(D)}/records/${ACC.id}/attest`, 'governance.acceptance.attest', { version: ACC.v, obligation: 'customer', decision: 'attest', digest: v.digest, reason: 'attesting before verifying (refused)' }, 'ACR', ACC.id), 409, /VERIFIES/);
      expectRefused('E. Lindgren (the proposer) attests the product obligation — SELF-ACCEPTANCE', await dwr(productA, D, `${AR(D)}/records/${ACC.id}/attest`, 'governance.acceptance.attest', { version: ACC.v, obligation: 'product', decision: 'attest', digest: v.digest, reason: 'the proposer accepting its own proposal (refused)' }, 'ACR', ACC.id), 403, /separation_of_duties/);
      if (AGENT_REG) {
        const agent = await openAgentRunSession(AGENT_REG.agent_id);
        NAME[agent.principalId] = 'the Decision Agent';
        expectRefused(`the Decision Agent (an AGENT — its own run session ${short(agent.sessionId)}, opened through the identity port) attests the independent-assurance obligation`, await call(`${AR(D)}/records/${ACC.id}/attest`,
          { ...dom(agent, D, 'governance.acceptance.attest', 'ACR', ACC.id) }, { version: ACC.v, obligation: 'independent_assurance', decision: 'attest', digest: v.digest, reason: 'an agent attesting (refused)' }, agent.token), 403);
      } else note('no active Decision Agent is registered in the corridor — the agent refusal is not shown here (harness-proven: phase6-acceptance-b107 AR3 actor)');
      const pv = await drd(productB, D, `${AR(D)}/records/${ACC.id}/preview`, { version: ACC.v }, 'governance.acceptance.read', 'ACR');
      if (pv.ok) note(`R. Moreau's preview (OBJ-40): ${(pv.body.consequence ?? []).slice(0, 2).join(' ')} … ${(pv.body.consequence ?? []).slice(-1)[0] ?? ''}`);
      await attestAll(ACC.id, ACC.v, v.digest);
    }
    const after = await accVersion(ACC.id, ACC.v);
    (['accepted', 'constrained'].includes(after.state) ? ok : bad)(`the record v${ACC.v}: ${after.state.toUpperCase()}${after.state === 'accepted' ? ' — every obligation signed by a DISTINCT named human (R. Moreau product, H. Achterberg independent assurance, W. Zielińska customer); claim demonstration — real acceptance is R2' : ''}`);
    const here = await drd(richter, D, `${AR(D)}/scope/read`, { subjectKey: CAP_KEY }, 'governance.acceptance.read', 'ACR');
    const there = await drd(nowak, DP, `${AR(DP)}/scope/read`, { subjectKey: CAP_KEY }, 'governance.acceptance.read', 'ACR');
    if (!here.ok || !there.ok) fail('the accepted-scope reads', here.ok ? there : here);
    else {
      (['accepted', 'constrained'].includes(here.body.scope?.state) ? ok : bad)(`the ACCEPTED SCOPE in the corridor (T. Richter): ${here.body.scope?.state} — journeys ${(here.body.scope?.effective_scope?.journeys ?? []).join(', ')}, roles ${(here.body.scope?.effective_scope?.roles ?? []).join(', ')}`);
      (there.body.scope?.state === 'not_accepted' ? ok : bad)(`in NORDWERK Polska (K. Nowak): ${String(there.body.scope?.state).toUpperCase()} — no acceptance is inferred from another domain's`);
    }
    ENV_OUT.EYE_B107_ACCEPTANCE = ACC.id;
  }
}

/* ── B107-5 DESIGN GOVERNANCE ────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-5 DESIGN GOVERNANCE (§DG) — the inventory and the lint, owned assets, the attested design baseline, B92\'s finding → a contribution → accepted and published, a design acceptance, the UNSIGNED conformance packages');
const sato = await persona('j.sato'); NAME[sato.principalId] = 'J. Satō';
const assetRow = async (key) => q1(`select asset_id::text id, version, status, digest, owner_principal_id::text owner from governance.design_assets where asset_key = $1 and superseded_at is null`, [key]);
const DBL_TITLE = 'The Eye design baseline 2026-10 — the governed action (SYNTHETIC demonstration)';
let EVAL = null; let DBL = null; let BUTTON = null; let PATTERN = null; let TOKENS = null; let DACC = null;
{
  const invAt = await q1(`select count(*)::int n, max(occurred_at) at from governance.events where event = 'design.inventory_recorded' and actor_principal_id = $1`, [steward.principalId]).catch(() => null);
  const r = invAt?.n > 0 ? null : await wr(steward, `${DG}/assets/register`, 'governance.design.asset.register', {}, 'DAS');
  if (r === null) note(`the design inventory was read from the repository and registered (${iso(invAt.at)}): stands — an earlier run`);
  else if (!r.ok) fail('P. Castellano registers the design inventory', r);
  else {
    const inv = r.body.inventory;
    // a pattern version PUBLISHED by a contribution (below) and not yet adopted in the source reads as DRIFT against the repository until its adoption — expected, said
    const published = new Set((await q(`select a.asset_key k from governance.design_contributions c join governance.design_assets a on a.asset_id = c.target_asset_id and a.superseded_at is null where c.published_version is not null`)).map((x) => x.k));
    const drift = (inv.drift ?? []).map((x) => x.key);
    const unexpected = drift.filter((k) => !published.has(k));
    (unexpected.length === 0 ? ((inv.registered ?? []).length ? ok : note) : bad)(`${(inv.registered ?? []).length ? `P. Castellano REGISTERED the design inventory read from the repository: ${(inv.registered ?? []).length} assets` : `the design inventory is registered: ${inv.unchanged} assets unchanged — stands, an earlier run`}${drift.length ? `; DRIFT ${drift.join(', ')}${unexpected.length ? '' : ' — the version published from B92\'s finding is not adopted in the source yet: reported as drift, nothing changed (the adoption is the contribution\'s next step, not this act\'s)'}` : '; no drift'}`);
  }
  EVAL = await q1(`select evaluation_id::text id, digest, evaluated_at, counts from governance.design_evaluations where source = 'lint' and verdict = 'conformant' and evaluated_by = $1 order by evaluated_at desc limit 1`, [steward.principalId]).catch(() => null);
  if (EVAL) note(`the lint evaluation ${short(EVAL.id)} (conformant, ${iso(EVAL.evaluated_at)}) stands — an earlier run`);
  else {
    const l = await wr(steward, `${DG}/evaluations/lint`, 'governance.design.evaluate', {}, 'DEV');
    if (!l.ok) fail('P. Castellano runs the design lint', l);
    else {
      const e = l.body.evaluation;
      (e.verdict === 'conformant' ? ok : bad)(`P. Castellano ran the design LINT over the real web source: ${e.files} files, verdict ${String(e.verdict).toUpperCase()}${(e.findings ?? []).length ? ` — ${(e.findings).slice(0, 4).map((f) => `${f.principle}@${f.file}:${f.line}`).join(', ')}` : ''} (recorded as evidence ${short(e.evaluation_id)})`);
      EVAL = await q1(`select evaluation_id::text id, digest, evaluated_at from governance.design_evaluations where evaluation_id = $1`, [e.evaluation_id]);
    }
  }
  // the assets the governed action rests on: approved by the Design System Authority, each with ONE accountable owner (S. Iversen)
  for (const key of ['web.observation.governed-button', 'pattern.governed-action', 'tokens.semantic']) {
    const a = await assetRow(key);
    if (!a) { bad(`the design asset ${key} is not in the inventory`); continue; }
    if (a.status === 'approved' && a.owner) { note(`${key} v${a.version} is APPROVED, owned by ${nm(a.owner)}: stands — an earlier run`); continue; }
    const r = await wr(dsa, `${DG}/assets/${a.id}/approve`, 'governance.design.asset.approve', { version: a.version, digest: a.digest, ownerPrincipalId: dsaOwner.principalId, reason: `${key} is the controlled asset of the governed action (SYNTHETIC)` }, 'DAS', a.id);
    if (!r.ok) fail(`L. Haddad approves ${key}`, r); else ok(`L. Haddad (Design System Authority, human gate) APPROVED ${key} v${a.version} — its ONE accountable owner S. Iversen`);
  }
  BUTTON = await assetRow('web.observation.governed-button'); PATTERN = await assetRow('pattern.governed-action'); TOKENS = await assetRow('tokens.semantic');
  // the design baseline: proposed by the steward, ATTESTED (signed) by the authority — never its proposer
  DBL = await q1(`select baseline_id::text id, max(version)::int v from governance.design_baselines where title = $1 group by 1`, [DBL_TITLE]);
  const members = () => [BUTTON?.id, PATTERN?.id, TOKENS?.id].filter(Boolean);
  const DSCOPE = { capabilities: [CAP_KEY], journeys: ['JRN-11', 'JRN-24'], profiles: ['local-dev'], themes: ['light', 'dark'], locales: ['en'] };
  if (!DBL) {
    const p = await wr(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { expectedVersion: 0, title: DBL_TITLE, designSystemVersion: '@eye/tokens@0.0.1', scope: DSCOPE, members: members() }, 'DBL');
    if (!p.ok) fail('P. Castellano proposes the design baseline', p);
    else {
      const b = p.body.baseline; DBL = { id: b.baseline_id, v: b.version };
      ok(`P. Castellano PROPOSED the design baseline ${short(b.baseline_id)} v${b.version}: ${members().length} members (the governed button, the governed-action pattern, the semantic tokens), scope ${JSON.stringify(DSCOPE)}`);
      expectRefused('P. Castellano (the proposer, a steward) attests the design baseline', await wr(steward, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the proposer attesting (refused)' }, 'DBL', b.baseline_id), 403);
      const d = await wr(dsa, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the members read against Volume 9 and the principles; every member owned (SYNTHETIC)' }, 'DBL', b.baseline_id);
      if (!d.ok) fail('L. Haddad attests the design baseline', d); else ok(`L. Haddad (Design System Authority, human gate) ATTESTED and SIGNED the design baseline v${b.version} (${d.body.baseline.state})`);
    }
  } else note(`the design baseline ${short(DBL.id)} v${DBL.v} stands — an earlier run (${(await q1(`select state from governance.design_baselines where baseline_id = $1 and version = $2`, [DBL.id, DBL.v])).state})`);
  // the narrow design exception: requested; the asset's OWNER may not decide it (ES-02-004); the authority rejects it (the lint is conformant — no exception is needed)
  const XRQ = await q1(`select exception_id::text id, state from governance.design_exceptions where principle_key = 'semantic-tokens-only' and asset_id = $1 order by requested_at limit 1`, [BUTTON?.id]);
  if (XRQ) note(`the design exception ${short(XRQ.id)} (semantic-tokens-only on the governed button) is ${XRQ.state}: stands — an earlier run`);
  else if (BUTTON) {
    const x = await wr(steward, `${DG}/exceptions/request`, 'governance.design.exception.request', { principle: 'semantic-tokens-only', assetId: BUTTON.id, reason: 'a raw colour for the receipt badge until the token lands (SYNTHETIC request)',
      compensating: 'the receipt text carries the state; colour is never the only signal', expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }, 'DEX');
    if (!x.ok) fail('P. Castellano requests a design exception', x);
    else {
      const e = x.body.exception;
      ok(`P. Castellano REQUESTED a narrow design exception ${short(e.exception_id)}: semantic-tokens-only on the governed button, 30 days`);
      expectRefused('S. Iversen (the asset\'s OWNER) decides the exception on her own asset', await wr(dsaOwner, `${DG}/exceptions/${e.exception_id}/decide`, 'governance.design.exception.decide', { decision: 'approve', digest: e.digest, reason: 'the owner approving (refused)' }, 'DEX', e.exception_id), 403, /separation_of_duties/);
      const d = await wr(dsa, `${DG}/exceptions/${e.exception_id}/decide`, 'governance.design.exception.decide', { decision: 'reject', digest: e.digest, reason: 'the lint over the real source is conformant: no raw colour needs waiving (SYNTHETIC)' }, 'DEX', e.exception_id);
      if (!d.ok) fail('L. Haddad decides the design exception', d); else ok(`L. Haddad REJECTED the design exception (${d.body.exception.state}) — no waiver is needed where the lint is conformant`);
    }
  }
  // B92's EXPERIENCE LEARNING: J. Satō proposes a finding on the operating review, M. Okonkwo decides it as a DESIGN CHANGE PROPOSAL (B92's own routes)
  const UX = `/v1/tenants/${T}/domains/${D}/analytics/experience`;
  const FIND_STATEMENT = 'The operating-review drill-down shows its consequence preview only after a second step; the corridor team asks for the governed-action pattern to be reviewed as a design change (SYNTHETIC — a qualitative finding: the baseline is indeterminate, no measured value is claimed).';
  let fi = await q1(`select finding_id::text id, state, digest from analytics.experience_findings where tenant_id = $1 and domain_id = $2 and statement = $3`, [T, D, FIND_STATEMENT]);
  const bl = await q1(`select baseline_id::text id from analytics.experience_baselines where tenant_id = $1 and domain_id = $2 and journey_key = 'operating-review' order by recorded_at desc limit 1`, [T, D]);
  if (!fi && bl) {
    const r = await call(`${UX}/findings/propose`, dom(sato, D, 'analytics.experience.finding.propose', 'AFI'), { originKind: 'baseline', originId: bl.id, journeyKey: 'operating-review', statement: FIND_STATEMENT, evidence: { baseline_id: bl.id } }, sato.token);
    if (!r.ok) fail('J. Satō proposes the finding', r); else { fi = { id: r.body.finding.finding_id, digest: r.body.finding.digest, state: r.body.finding.state }; ok(`J. Satō (product analyst) PROPOSED the finding ${short(fi.id)} on the operating review (B92's route) — qualitative, the baseline indeterminate`); }
  }
  let ACTION = fi ? await q1(`select action_id::text id, kind from analytics.experience_actions where finding_id = $1`, [fi.id]) : null;
  if (fi && !ACTION && fi.state === 'proposed') {
    const pv = await call(`${UX}/findings/${fi.id}/preview`, dom(okonkwo, D, 'analytics.read', 'AFI', fi.id), { kind: 'design_change_proposal', targetId: null }, okonkwo.token);
    if (!pv.ok) fail('M. Okonkwo previews the design change proposal', pv);
    else {
      const d = await call(`${UX}/findings/${fi.id}/decide`, dom(okonkwo, D, 'analytics.experience.action.decide', 'AAC', fi.id), { decision: 'act', kind: 'design_change_proposal',
        reason: 'the pattern is reviewed by the design-system authority, never changed by telemetry (SYNTHETIC)', findingDigest: fi.digest, previewDigest: pv.body.preview.preview_digest }, okonkwo.token);
      if (!d.ok) fail('M. Okonkwo decides the action', d); else { ACTION = { id: d.body.action.action_id, kind: d.body.action.kind }; ok(`M. Okonkwo (product analytics owner, human gate) DECIDED the finding as a ${d.body.action.kind} (B92's route) — automatic: never`); }
    }
  } else if (ACTION) note(`the finding ${short(fi.id)} was decided as ${ACTION.kind}: stands — an earlier run`);
  // the INTAKE: the decided action opens ONE contribution proposal (telemetry never modifies a pattern)
  let CONTRIB = ACTION ? await q1(`select contribution_id::text id from governance.design_experience_intakes where action_id = $1`, [ACTION.id]) : null;
  if (ACTION && !CONTRIB) {
    const r = await dwr(okonkwo, D, `${DGD(D)}/intake`, 'governance.design.intake', { actionId: ACTION.id }, 'DCT');
    if (!r.ok) fail('M. Okonkwo takes the action into the design system', r);
    else { const got = (r.body.intake?.intaken ?? [])[0]; CONTRIB = got ? { id: got.contribution_id } : null; (got ? ok : bad)(`the INTAKE (M. Okonkwo): the action → contribution proposal ${short(got?.contribution_id)} (origin experience_learning) — the pattern itself is unchanged`); }
  } else if (CONTRIB) note(`the action's contribution ${short(CONTRIB.id)} stands — an earlier run (the tick or an earlier intake)`);
  if (CONTRIB && PATTERN && EVAL) {
    let c = await q1(`select revision, stage, digest, target_asset_id::text target, published_version from governance.design_contributions where contribution_id = $1 order by revision desc limit 1`, [CONTRIB.id]);
    if (c.target === null) {
      expectRefused('L. Haddad reviews the contribution before any contributor names its target', await wr(dsa, `${DG}/contributions/${CONTRIB.id}/review`, 'governance.design.contribution.review', { revision: c.revision, reason: 'the review step (SYNTHETIC)' }, 'DCT', CONTRIB.id), 409, /names no target asset/);
      const am = await wr(steward, `${DG}/contributions/${CONTRIB.id}/amend`, 'governance.design.contribution.amend', { revision: c.revision, targetAssetId: PATTERN.id, proposal: { packageVersion: '0.0.2' },
        summary: 'The governed action shows its consequence preview beside the act (no second step); receipts only — no optimistic path (SYNTHETIC)',
        plans: { compatibility: 'additive: the preview moves, the receipt contract is unchanged', consumers: 'every governed button keeps its receipt rendering', migration: 'none required', rollback: 'revert to the pattern\'s previous version', tests: ['apps/web/lib/governance-dg-b107.test.ts'], evaluationId: EVAL.id } }, 'DCT', CONTRIB.id);
      if (!am.ok) fail('P. Castellano amends the contribution', am); else ok(`P. Castellano AMENDED the contribution (revision ${am.body.contribution.revision}): target pattern.governed-action, its plans and the conformant lint evaluation ${short(EVAL.id)} — blockers ${(am.body.contribution.blockers ?? []).length}`);
      c = await q1(`select revision, stage, digest, target_asset_id::text target, published_version from governance.design_contributions where contribution_id = $1 order by revision desc limit 1`, [CONTRIB.id]);
    }
    if (c.stage === 'proposed') {
      const r = await wr(dsa, `${DG}/contributions/${CONTRIB.id}/review`, 'governance.design.contribution.review', { revision: c.revision, reason: 'reviewed against the principles and the conformant lint (SYNTHETIC)' }, 'DCT', CONTRIB.id);
      if (!r.ok) fail('L. Haddad reviews the contribution', r); else ok(`L. Haddad REVIEWED it: ${r.body.contribution.stage}`);
      c = await q1(`select revision, stage, digest, target_asset_id::text target, published_version from governance.design_contributions where contribution_id = $1 order by revision desc limit 1`, [CONTRIB.id]);
    }
    if (c.stage === 'in_review') {
      expectRefused('P. Castellano (a builder — the amender) accepts the contribution', await wr(steward, `${DG}/contributions/${CONTRIB.id}/accept`, 'governance.design.contribution.accept', { revision: c.revision, digest: c.digest, reason: 'the builder accepting (refused)' }, 'DCT', CONTRIB.id), 403);
      const r = await wr(dsa, `${DG}/contributions/${CONTRIB.id}/accept`, 'governance.design.contribution.accept', { revision: c.revision, digest: c.digest, reason: 'the contribution keeps the receipt contract and removes a step (SYNTHETIC)' }, 'DCT', CONTRIB.id);
      if (!r.ok) fail('L. Haddad accepts the contribution', r); else ok(`L. Haddad (Design System Authority — never the proposer, never a builder) ACCEPTED and SIGNED the contribution at its digest ${dg(c.digest)}`);
      c = await q1(`select revision, stage, digest, target_asset_id::text target, published_version from governance.design_contributions where contribution_id = $1 order by revision desc limit 1`, [CONTRIB.id]);
    }
    if (c.stage === 'accepted') {
      const r = await wr(dsa, `${DG}/contributions/${CONTRIB.id}/publish`, 'governance.design.contribution.publish', { revision: c.revision, reason: 'published as the next version of the pattern (SYNTHETIC)' }, 'DCT', CONTRIB.id);
      if (!r.ok) fail('L. Haddad publishes the contribution', r); else ok(`L. Haddad PUBLISHED it: pattern.governed-action v${r.body.contribution.asset_version} (a registry version — no code is changed by the act)`);
      c = await q1(`select revision, stage, digest, target_asset_id::text target, published_version from governance.design_contributions where contribution_id = $1 order by revision desc limit 1`, [CONTRIB.id]);
    }
    (['published', 'adopted', 'measured', 'closed'].includes(c.stage) ? ok : bad)(`the contribution from B92's finding: ${c.stage.toUpperCase()}${c.published_version ? ` (pattern v${c.published_version})` : ''}`);
    PATTERN = await assetRow('pattern.governed-action');
  }
  // the design baseline v2 over the published pattern (proposed by the steward, attested by the authority)
  if (DBL && PATTERN) {
    const cur = await q1(`select version, state, members from governance.design_baselines where baseline_id = $1 order by version desc limit 1`, [DBL.id]);
    const has = JSON.stringify(cur.members ?? []).includes(`"version": ${PATTERN.version}`) || JSON.stringify(cur.members ?? []).includes(`"version":${PATTERN.version}`);
    if (PATTERN.version > 1 && cur.version === 1 && cur.state === 'attested') {
      const p = await wr(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { baselineId: DBL.id, expectedVersion: 1, title: DBL_TITLE, designSystemVersion: '@eye/tokens@0.0.1',
        scope: { capabilities: [CAP_KEY], journeys: ['JRN-11', 'JRN-24'], profiles: ['local-dev'], themes: ['light', 'dark'], locales: ['en'] }, members: [BUTTON?.id, PATTERN.id, TOKENS?.id].filter(Boolean) }, 'DBL', DBL.id);
      if (!p.ok) fail('P. Castellano proposes the design baseline v2', p);
      else {
        const d = await wr(dsa, `${DG}/baselines/${DBL.id}/decide`, 'governance.design.baseline.decide', { version: p.body.baseline.version, decision: 'attest', digest: p.body.baseline.digest, reason: 'v2 carries the published pattern version (SYNTHETIC)' }, 'DBL', DBL.id);
        if (!d.ok) fail('L. Haddad attests the design baseline v2', d); else ok(`the design baseline v${p.body.baseline.version} — the published pattern v${PATTERN.version} — ATTESTED and SIGNED by L. Haddad`);
      }
    } else note(`the design baseline is v${cur.version} ${cur.state}${has ? ` with pattern v${PATTERN.version}` : ''}: stands`);
    DBL = await q1(`select baseline_id::text id, max(version)::int v from governance.design_baselines where baseline_id = $1 and state = 'attested' group by 1`, [DBL.id]) ?? DBL;
  }
  // the DESIGN ACCEPTANCE in the corridor: the exact tuple; attested per obligation by distinct named humans
  DACC = await q1(`select acceptance_id::text id, max(version)::int v from governance.design_acceptances where tenant_id = $1 and domain_id = $2 and tuple ->> 'capability' = $3 group by 1 limit 1`, [T, D, CAP_KEY]);
  const TUPLE = { capability: CAP_KEY, journey: 'JRN-11', persona: 'the corridor\'s supply analyst', role: 'domain_analyst', deployment_profile: 'local-dev', theme: 'light', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' };
  if (!DACC && DBL && EVAL && BUTTON && PATTERN) {
    const walk = readFileSync(join(SELF_ROOT, JOURNEY_FILE));
    const ev = [{ kind: 'design_evaluation', ref: `the conformant lint evaluation ${EVAL.id}`, digest: EVAL.digest, capturedAt: new Date(EVAL.evaluated_at).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      { kind: 'journey_walk', ref: `${JOURNEY_FILE} (the B33 walk of the supply map)`, digest: sha256(walk), capturedAt: JOURNEY_CAPTURED, validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }];
    const p = await dwr(steward, D, `${DGD(D)}/acceptances/propose`, 'governance.design.acceptance.propose', { baselineId: DBL.id, components: [BUTTON.id, PATTERN.id], tuple: TUPLE, evidence: ev, obligations: ['design', 'assurance', 'customer'],
      findings: [{ note: 'none open at proposal (SYNTHETIC)' }], conditions: [{ condition: 'local-dev profile only' }] }, 'DAC');
    if (!p.ok) fail('P. Castellano proposes the design acceptance', p);
    else {
      const a = p.body.acceptance; DACC = { id: a.acceptance_id, v: a.version };
      ok(`P. Castellano PROPOSED the design acceptance ${short(a.acceptance_id)} v${a.version} in the corridor: the exact tuple (${Object.values(TUPLE).join(' · ')}), the attested baseline, the lint and the walk as evidence; claim ${a.claim}`);
      expectRefused('P. Castellano (the proposer, a steward) attests the design acceptance', await dwr(steward, D, `${DGD(D)}/acceptances/${a.acceptance_id}/attest`, 'governance.design.acceptance.attest', { version: a.version, obligation: 'assurance', digest: a.digest, reason: 'the proposer attesting (refused)' }, 'DAC', a.acceptance_id), 403);
      for (const [s, o] of [[dsa, 'design'], [assurance, 'assurance'], [sponsor, 'customer']]) {
        const r = await dwr(s, D, `${DGD(D)}/acceptances/${a.acceptance_id}/attest`, 'governance.design.acceptance.attest', { version: a.version, obligation: o, digest: a.digest, reason: `the ${o} obligation attested against the exact tuple (SYNTHETIC)` }, 'DAC', a.acceptance_id);
        if (!r.ok) fail(`${nm(s.principalId)} attests the ${o} obligation`, r); else ok(`${nm(s.principalId)} ATTESTED the design acceptance's ${o} obligation (signed): ${r.body.acceptance.state}${(r.body.acceptance.remaining ?? []).length ? `, remaining ${r.body.acceptance.remaining.join(', ')}` : ''}`);
      }
    }
  } else if (DACC) note(`the design acceptance ${short(DACC.id)} v${DACC.v} stands — an earlier run (${(await q1(`select state from governance.design_acceptances where acceptance_id = $1 and version = $2`, [DACC.id, DACC.v])).state})`);
  if (DACC) {
    const st = await q1(`select state, claim, accessibility from governance.design_acceptances where acceptance_id = $1 and version = $2`, [DACC.id, DACC.v]);
    (st.state === 'accepted' && st.claim === 'demonstration' ? ok : bad)(`the design acceptance: ${st.state.toUpperCase()} (claim ${st.claim}); accessibility ${st.accessibility?.status} (${st.accessibility?.metric} — B108 → H3)`);
  }
  // THE INDEPENDENT CONFORMANCE PACKAGES — generated and LEFT UNSIGNED (R2)
  for (const [target, d, label, extra] of [['UX-70-006', D, 'the corridor', DACC ? { acceptanceId: DACC.id } : {}], ['UX-66-006', DP, 'NORDWERK Polska (where B94\'s onboarding records are)', {}]]) {
    const have = await q1(`select package_id::text id, digest, signed from governance.design_conformance_packages where tenant_id = $1 and domain_id = $2 and target = $3 order by generated_at desc limit 1`, [T, d, target]);
    if (have) { note(`the ${target} package ${short(have.id)} (${label}) stands — an earlier run; signed ${have.signed}`); continue; }
    const r = await dwr(assurance, d, `${DGD(d)}/packages/generate`, 'governance.design.package.generate', { target, ...extra }, 'DPK');
    if (!r.ok) { fail(`H. Achterberg generates the ${target} package`, r); continue; }
    const pk = r.body.package;
    (pk.signed === false ? ok : bad)(`H. Achterberg (independent assurance) GENERATED the ${target} conformance package for ${label}: digest ${dg(pk.digest)}, evidence ${(pk.content?.evidence ?? []).length} item(s) with ages, findings ${(pk.content?.findings ?? []).map((f) => f.class).join(', ')} — LEFT UNSIGNED (signed ${pk.signed}): the signature is a real independent authority's (R2)`);
  }
}

/* ── B107-6 OWNERSHIP ────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-6 OWNERSHIP (§DR) — the corridor\'s domain registry entry, a data authority, a stewardship case, a component ownership transfer, the route lint');
const aydin = await persona('f.aydin'); NAME[aydin.principalId] = 'F. Aydın';
const eriksen = await persona('n.eriksen'); NAME[eriksen.principalId] = 'N. Eriksen';
const okafor = await q1(`select id::text from identity.principals where login_name = 's.okafor'`);
{
  // THE DOMAIN REGISTRY ENTRY: proposed by the domain administrator, ratified by the customer sponsor (never the proposer, never the leader it appoints)
  const reg = await q1(`select version, state, digest, governance_mode from governance.domain_registry where domain_id = $1 order by version desc limit 1`, [D]);
  if (reg?.state === 'ratified') note(`the corridor's domain registry entry v${reg.version} is RATIFIED (${reg.governance_mode}): stands — an earlier run`);
  else if (okafor) {
    let prop = reg?.state === 'proposed' ? reg : null;
    if (!prop) {
      const r = await dwr(richter, D, `${DRD(D)}/domain/propose`, 'governance.ownership.domain.propose', { expectedVersion: reg?.version ?? 0, leader: okafor.id,
        boundary: 'the corridor intelligence of the NORDWERK supply chain — the Regensburg line\'s sources, products and decisions (SYNTHETIC)', contract: { version: 'v1', extensionPoints: ['sources', 'event products'], compatibility: 'backward', governance: 'observed' } }, 'GDR');
      if (!r.ok) fail('T. Richter proposes the corridor\'s domain registry entry', r); else { prop = r.body.entry; ok(`T. Richter (domain administrator) PROPOSED the domain registry entry v${prop.version}: the accountable leader S. Okafor, the boundary, the extension contract v1 (sources, event products; backward), governance ${prop.governance_mode} — a missing authority is LISTED, not held`); }
    }
    if (prop) {
      expectRefused('T. Richter (the proposer, no ratifying role) ratifies the entry', await dwr(richter, D, `${DRD(D)}/domain/decide`, 'governance.ownership.domain.ratify', { version: prop.version, digest: prop.digest, decision: 'ratify', reason: 'the proposer ratifying (refused)' }, 'GDR'), 403);
      const d = await dwr(sponsor, D, `${DRD(D)}/domain/decide`, 'governance.ownership.domain.ratify', { version: prop.version, digest: prop.digest, decision: 'ratify', reason: 'the corridor\'s boundary and extension contract read against NORDWERK\'s operating model (SYNTHETIC)' }, 'GDR');
      if (!d.ok) fail('W. Zielińska ratifies the domain registry entry', d); else ok(`W. Zielińska (customer sponsor, human gate) RATIFIED the corridor's domain registry entry v${prop.version} (${d.body.entry.state}) — the corridor is a REGISTERED domain: the tick reconciles its ownership`);
    }
  } else bad('S. Okafor (the corridor\'s executive) is absent');
  // A DATA AUTHORITY on the corridor warning stream: proposed by the data steward, accepted by its NAMED owner, ratified by the domain administrator
  const asset = await q1(`select asset_id::text id, title, owner_principal_id::text owner from products.catalog_assets where tenant_id = $1 and domain_id = $2 and kind = 'product' and title = 'Corridor warning stream (SYNTHETIC)'`, [T, D]);
  if (!asset) bad('the corridor warning stream is not catalogued');
  else {
    (asset.owner === eriksen.principalId ? ok : bad)(`the asset: "${asset.title}" (${short(asset.id)}) — its catalogue owner ${nm(asset.owner)}`);
    const cur = await q1(`select version, state, digest from governance.data_authorities where authority_id = $1 order by version desc limit 1`, [asset.id]);
    if (cur?.state === 'ratified') note(`the data authority v${cur.version} of the corridor warning stream is RATIFIED: stands — an earlier run`);
    else {
      let a = cur?.state === 'proposed' || cur?.state === 'accepted' ? cur : null;
      if (!a) {
        const r = await dwr(aydin, D, `${DRD(D)}/authorities/propose`, 'governance.ownership.authority.propose', { assetId: asset.id, expectedVersion: cur?.version ?? 0, duties: { owner: eriksen.principalId, steward: aydin.principalId,
          custodianRole: 'data_steward', custodian: aydin.principalId, producer: 'prediction.warning_events (the warning ledger)', consumerRoles: ['domain_analyst', 'executive'], policyAuthorityRole: 'privacy_officer',
          qualityAuthorityRole: 'data_steward', escalationPath: 'the data steward, then the domain administrator, then the onboarding authority', evidenceObligation: 'the catalog reconciliation and the event stream ledger every period',
          writeRights: ['products.event_product.declare'] } }, 'GDA', asset.id);
        if (!r.ok) fail('F. Aydın proposes the data authority', r); else { a = r.body.authority; ok(`F. Aydın (data steward) PROPOSED the data authority v${a.version}: owner N. Eriksen, steward and custodian F. Aydın, policy authority privacy_officer, quality authority data_steward, the escalation path and the evidence obligation`); }
      }
      if (a && a.state === 'proposed' && !(await q1(`select owner_accepted_at from governance.data_authorities where authority_id = $1 and version = $2`, [asset.id, a.version]))?.owner_accepted_at) {
        expectRefused('T. Richter accepts ownership in the named owner\'s place', await dwr(richter, D, `${DRD(D)}/authorities/${asset.id}/accept`, 'governance.ownership.authority.accept', { version: a.version, digest: a.digest }, 'GDA', asset.id), 403, /named owner only/);
        const r = await dwr(eriksen, D, `${DRD(D)}/authorities/${asset.id}/accept`, 'governance.ownership.authority.accept', { version: a.version, digest: a.digest }, 'GDA', asset.id);
        if (!r.ok) fail('N. Eriksen accepts the ownership', r); else ok(`N. Eriksen (the NAMED owner, human gate) ACCEPTED the ownership of v${a.version} on its digest`);
      }
      if (a) {
        const d = await dwr(richter, D, `${DRD(D)}/authorities/${asset.id}/decide`, 'governance.ownership.authority.ratify', { version: a.version, digest: a.digest, decision: 'ratify', reason: 'the duties read against the corridor\'s operating model (SYNTHETIC)' }, 'GDA', asset.id);
        if (!d.ok) fail('T. Richter ratifies the data authority', d); else ok(`T. Richter (domain administrator — neither its proposer nor its owner) RATIFIED the data authority v${a.version}: ${d.body.authority.state}`);
      }
    }
    const res = await drd(richter, D, `${DRD(D)}/assets/${asset.id}/read`, {}, 'governance.ownership.read', 'GDA');
    const rz = res.body?.resolution ?? {}; const du = rz.duties ?? {};
    if (res.ok) ((rz.state === 'resolved' && du.owner?.principal === eriksen.principalId) ? ok : bad)(`the asset's authority RESOLVED live: ${rz.state} — owner ${du.owner?.name ?? nm(du.owner?.principal)} (${du.owner?.state}), steward ${du.steward?.name ?? nm(du.steward?.principal)} (${du.steward?.state}), custodian ${du.custodian?.role} (${du.custodian?.state}), consumers ${(du.consumer?.roles ?? []).join(', ')} (${du.consumer?.state}), policy authority ${du.policy_authority?.role} (${du.policy_authority?.state})`);
    else fail('T. Richter reads the asset\'s authority', res);
    // THE RECONCILIATION (the steward): the ownership-gap register STATES what has no authority — listed (observed), never hidden
    const rc = await dwr(aydin, D, `${DRD(D)}/reconcile`, 'governance.ownership.reconcile', {}, 'GDA');
    if (!rc.ok) fail('F. Aydın reconciles the corridor\'s ownership', rc);
    else ok(`F. Aydın RECONCILED the corridor's ownership (${rc.body.reconciliation?.mode}): found ${(rc.body.reconciliation?.found ?? []).length}, opened ${(rc.body.reconciliation?.opened ?? []).length}, resolved ${(rc.body.reconciliation?.resolved ?? []).length} — ${rc.body.reconciliation?.open} gap(s) OPEN and LISTED (no-owner gaps are listed, not held, in an observed domain); products to degrade ${(rc.body.reconciliation?.degrade ?? []).length}`);
    // A STEWARDSHIP CASE: opened by the steward, reviewed by ANOTHER (the domain administrator), closed by the owner with evidence
    const CASE_TITLE = 'Duplicate-warning check on the corridor warning stream (SYNTHETIC case)';
    let sc = await q1(`select case_id::text id, case_ref, state, digest from governance.stewardship_cases where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, CASE_TITLE]);
    if (!sc) {
      const r = await dwr(aydin, D, `${DRD(D)}/cases/open`, 'governance.ownership.case.open', { kind: 'quality', subjectKind: 'catalog_asset', subjectId: asset.id, title: CASE_TITLE,
        action: 'confirm the stream de-duplicates on the warning id before the next corridor review', evidence: [{ kind: 'ledger', ref: 'the corridor warning stream\'s event ledger (products) as read 2026-10-15' }], consequence: 'C2' }, 'STW');
      if (!r.ok) fail('F. Aydın opens the stewardship case', r);
      else { sc = { id: r.body.case.case_id, case_ref: r.body.case.case_ref, state: r.body.case.state, digest: r.body.case.digest }; ok(`F. Aydın OPENED ${sc.case_ref} (quality, C2): its owner resolved ${nm(r.body.case.owner_principal_id)}, ${r.body.case.reviewers_required} reviewer, SLA ${r.body.case.sla} with its timer`); }
    }
    if (sc && sc.state === 'open') {
      expectRefused('F. Aydın (its opener) reviews the case', await dwr(aydin, D, `${DRD(D)}/cases/${sc.id}/review`, 'governance.ownership.case.review', { digest: sc.digest, outcome: 'approve', note: 'the opener reviewing (refused)' }, 'STW', sc.id), 403, /separation_of_duties/);
      const r = await dwr(richter, D, `${DRD(D)}/cases/${sc.id}/review`, 'governance.ownership.case.review', { digest: sc.digest, outcome: 'approve', note: 'the proposed action is proportionate to the evidence (SYNTHETIC)' }, 'STW', sc.id);
      if (!r.ok) fail('T. Richter reviews the case', r); else ok(`T. Richter (domain administrator, human gate) REVIEWED ${sc.case_ref}: ${r.body.case.state}`);
      sc = await q1(`select case_id::text id, case_ref, state, digest from governance.stewardship_cases where case_id = $1`, [sc.id]);
    }
    if (sc && sc.state === 'approved') {
      const r = await dwr(eriksen, D, `${DRD(D)}/cases/${sc.id}/close`, 'governance.ownership.case.close', { note: 'the stream de-duplicates on the warning id; no duplicate found in the ledger (SYNTHETIC)', evidence: [{ kind: 'ledger', ref: 'the corridor warning stream\'s event ledger re-read (SYNTHETIC)' }] }, 'STW', sc.id);
      if (!r.ok) fail('N. Eriksen closes the case', r); else ok(`N. Eriksen (the owner) CLOSED ${sc.case_ref} with evidence: ${r.body.case.state}`);
      sc = await q1(`select case_id::text id, case_ref, state from governance.stewardship_cases where case_id = $1`, [sc.id]);
    }
    if (sc) (sc.state === 'closed' ? ok : bad)(`the stewardship case ${sc.case_ref}: ${String(sc.state).toUpperCase()}`);
  }
}
{
  // A COMPONENT OWNERSHIP TRANSFER (PLATFORM): the export path's component L3-C05 — proposed by the steward with the nine-item checklist, accepted by the RECEIVING
  // accountable owner (K. Mensah), ratified and SIGNED by the product authority (never a party)
  const comp = await q1(`select artifact_id::text id, external_key, title from governance.artifacts where kind = 'component' and external_key = 'L3-C05' and superseded_at is null`);
  const own = comp ? await q1(`select version, accountable_principal_id::text acc from governance.component_ownerships where component_artifact = $1 and superseded_at is null`, [comp.id]) : null;
  if (!comp) bad('the component L3-C05 is not registered');
  else if (own) note(`L3-C05 "${comp.title}" has its ratified ownership v${own.version} (accountable ${nm(own.acc)}): stands — an earlier run`);
  else {
    let t = await q1(`select transfer_id::text id, state, digest from governance.component_transfers where component_artifact = $1 and state in ('proposed', 'accepted') limit 1`, [comp.id]);
    if (!t) {
      const r = await wr(steward, `${OWN}/transfers/propose`, 'governance.ownership.component.propose', { componentId: comp.id, expectedVersion: 0,
        proposal: { owningTeam: 'Export and retention team (SYNTHETIC)', accountable: ops.principalId, primaryContact: ops.principalId, secondaryContact: productA.principalId, operatorRole: 'operations_authority',
          ownedContracts: ['/v1/tenants/:tenantId/domains/:domainId/retention'], stateStores: ['retention.*'], policyDecisions: ['retention.'], telemetryNamespace: 'eye.retention', failureDomain: 'api-retention', deployableUnits: ['api.retention'] },
        checklist: { code: { ref: 'apps/api/src/retention' }, state: { ref: 'the retention schema (migrations 0071–0077)' }, contracts: { ref: '/v1/tenants/:tenantId/domains/:domainId/retention' },
          dashboards: { ref: 'none yet — B64 (SLO computation) carries them' }, alerts: { ref: 'the attention classes of the corridor (governance.exception)' }, runbooks: { ref: 'docs/ops/DEMONSTRATION_RUNBOOK.md (the export and import sections)' },
          risks: { ref: 'the export-path exception of this act (V6:MS-17)' }, exceptions: { ref: 'the open exceptions linked to L3-C05 (carried by the transfer)' }, incidents: { ref: 'none recorded on the demonstration' } } }, 'GCT', comp.id);
      if (!r.ok) fail('P. Castellano proposes the ownership transfer of L3-C05', r);
      else { t = { id: r.body.transfer.transfer_id, state: r.body.transfer.state, digest: r.body.transfer.digest }; ok(`P. Castellano PROPOSED the ownership of L3-C05 "${comp.title}": accountable K. Mensah, the export and retention team, the nine-item checklist; the open exceptions handed over ${(r.body.transfer.open_exceptions ?? []).map((x) => x.key).join(', ') || 'none'}`); }
    }
    if (t && t.state === 'proposed') {
      expectRefused('R. Moreau ratifies before the receiving owner accepted', await wr(productB, `${OWN}/transfers/${t.id}/decide`, 'governance.ownership.component.ratify', { digest: t.digest, decision: 'ratify', reason: 'ratifying before acceptance (refused)' }, 'GCT', t.id), 409, /accepts it before it is ratified/);
      const a = await wr(ops, `${OWN}/transfers/${t.id}/accept`, 'governance.ownership.component.accept', { digest: t.digest }, 'GCT', t.id);
      if (!a.ok) fail('K. Mensah accepts the transfer', a); else ok('K. Mensah (the RECEIVING accountable owner, human gate) ACCEPTED the transfer on its digest');
      t = await q1(`select transfer_id::text id, state, digest from governance.component_transfers where transfer_id = $1`, [t.id]);
    }
    if (t && t.state === 'accepted') {
      expectRefused('K. Mensah (a party — the receiving owner) ratifies his own transfer', await wr(ops, `${OWN}/transfers/${t.id}/decide`, 'governance.ownership.component.ratify', { digest: t.digest, decision: 'ratify', reason: 'a party ratifying (refused)' }, 'GCT', t.id), 403);
      const d = await wr(productB, `${OWN}/transfers/${t.id}/decide`, 'governance.ownership.component.ratify', { digest: t.digest, decision: 'ratify', reason: 'the handover inventory read item by item (SYNTHETIC)' }, 'GCT', t.id);
      if (!d.ok) fail('R. Moreau ratifies the transfer', d); else ok(`R. Moreau (product authority — not a party, human gate) RATIFIED and SIGNED the ownership of L3-C05: v${d.body.transfer.ownership?.version}, accountable K. Mensah`);
    }
  }
  const l = await rd(steward, `${OWN}/lint/read`, {}, 'governance.ownership.read', 'GDA');
  if (!l.ok) fail('the owned-contract lint', l);
  else {
    const li = l.body.lint ?? {};
    ok(`the OWNED-CONTRACT LINT over this API's routes (ES-11-002 — every unowned route LISTED, never hidden): ${li.routes ?? li.total ?? '?'} routes, owned ${li.owned ?? (li.covered ?? []).length ?? '?'}, unowned ${li.unowned_count ?? (li.unowned ?? []).length}`);
  }
}

/* ── B107-3 PART II ──────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-3 PART II — the exception EXPIRES on the database clock; the candidate is HELD; the renewal (stale evidence refused, current approved) lifts the hold; the candidate checked and ATTESTED — not a release');
const waitFor = async (label, until) => {
  const now = await dbNow();
  const ms = new Date(until).getTime() - now.getTime() + 2_000;
  if (ms > 0) { note(`WAITING ${Math.ceil(ms / 1000)} s on the database clock for ${label} (until ${iso(until)}) — a real short validity, nothing moved`); WAITS.push(`${label}: ${Math.ceil(ms / 1000)} s`); await sleep(ms); }
  else note(`${label} passed at ${iso(until)} (database clock ${iso(now)}) — no wait`);
};
if (EX && RC) {
  const exRows = async () => q(`select version, state, expires_at, digest, decided_at from governance.ws_exceptions where exception_id = $1 order by version`, [EX.id]);
  let rows = await exRows();
  const renewed = rows.find((x) => x.version > 1 && x.state === 'approved');
  if (renewed) note(`the exception was RENEWED (v${renewed.version} approved, in force until ${iso(renewed.expires_at)}): stands — an earlier run`);
  else {
    const v1 = rows.find((x) => x.version === 1);
    await waitFor(`the export-path exception's expiry`, v1.expires_at);
    const ws1 = await home();
    const shown = (ws1?.exceptions ?? []).find((x) => x.exception_id === EX.id && x.version === 1);
    note(`the workspace reads ${shown?.ref} v1 as: ${shown?.effective_state ?? shown?.state}`);
    if ((await exRows()).find((x) => x.version === 1).state === 'approved') {
      const sw = await wr(steward, `${PG}/exceptions/sweep`, 'governance.exception.sweep', {}, 'GEX');
      if (!sw.ok) fail('P. Castellano sweeps the exceptions', sw);
      else ok(`P. Castellano's SWEEP: expired ${(sw.body.sweep?.expired ?? []).map((x) => `${x.ref ?? short(x.exception_id)} v${x.version}`).join(', ') || 'none'} — every affected artifact HELD`);
    } else note('the attention tick swept it first (the exception is expired): the hold is the tick\'s');
    rows = await exRows();
    (rows.find((x) => x.version === 1).state === 'expired' ? ok : bad)(`the exception v1: ${rows.find((x) => x.version === 1).state.toUpperCase()} at ${iso(rows.find((x) => x.version === 1).expires_at)}`);
    const h = await q(`select reason_kind, reason, lifted_at from governance.holds where subject_artifact = $1 and source_artifact = $2 order by opened_at`, [RC.id, EX.id]);
    (h.some((x) => x.reason_kind === 'exception_expired' && x.lifted_at === null) ? ok : bad)(`the release candidate is HELD: ${h.map((x) => `${x.reason_kind}${x.lifted_at ? ' (lifted)' : ''} — ${String(x.reason).slice(0, 140)}`).join(' | ')}`);
    const cver = (await q1(`select max(version)::int v from governance.cm_release_candidates where candidate_id = $1`, [RC.id])).v;
    expectRefused('P. Castellano checks the held candidate', await wr(steward, `${CM}/candidates/${RC.id}/check`, 'governance.conformance.candidate.check', { version: cver }, 'RCN', RC.id), 409, /\(held\)/);
    const item = await q1(`select count(*)::int n, max(state) s from executive.attention_items where subject_id = $1 and signal_class = 'governance.exception'`, [EX.id]);
    note(`the attention item for the expired exception in the corridor: ${item.n} (${item.s ?? 'none yet — the tick raises it'})`);
    // THE RENEWAL: evidence captured BEFORE the approval is not current — refused; the export-path tests RE-RUN now are
    const v1row = rows.find((x) => x.version === 1);
    expectRefused('K. Mensah renews with the evidence of the first approval (captured before it)', await wr(ops, `${PG}/exceptions/propose`, 'governance.exception.propose', { exceptionId: EX.id, expectedVersion: 1,
      expiresAt: new Date((await dbNow()).getTime() + 14 * 86_400_000).toISOString(), evidence: exEvidence(EXPORT) }, 'GEX', EX.id), 409, /not current evidence/);
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'b107-rerun-'));
    const outFile = join(dir, 'export-path-rerun.vitest.json');
    let rerun = null;
    try {
      execFileSync(join(SELF_ROOT, 'apps', 'api', 'node_modules', '.bin', 'vitest'), ['run', 'test/unit/retention', '--reporter=json', `--outputFile=${outFile}`], { cwd: join(SELF_ROOT, 'apps', 'api'), stdio: 'ignore', timeout: 180_000 });
      const raw = readFileSync(outFile, 'utf8'); const j = JSON.parse(raw);
      ok(`K. Mensah RE-RAN the export-path tests now (apps/api/test/unit/retention): ${j.numPassedTests}/${j.numTotalTests} passed, started ${iso(j.startTime)}`);
      const r = await wr(steward, `${RG}/verification/ingest`, 'governance.verification.ingest', { format: 'vitest', name: `The export-path tests RE-RUN after the exception expired (${iso(j.startTime)})`, report: raw, claim: 'construction', validDays: 30 }, 'VER');
      if (!r.ok) fail('P. Castellano ingests the re-run', r);
      else {
        const rec = r.body.verification.record;
        const art = await q1(`select artifact_id::text id, digest from governance.artifacts where kind = 'evidence' and external_key = $1 and superseded_at is null`, [`verification:${rec.source_digest}`]);
        rerun = { recordId: rec.record_id, artifactDigest: art.digest, capturedAt: new Date(j.startTime).toISOString(), validUntil: rec.valid_until };
        ok(`P. Castellano INGESTED the re-run (record ${short(rec.record_id)}, ${rec.totals?.passed}/${rec.totals?.cases} passed)`);
      }
    } catch (e) { bad(`the export-path re-run failed: ${String(e.message ?? e).slice(0, 200)}`); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    if (rerun) {
      const ev = [{ kind: 'test_report', ref: `the export-path tests re-run ${iso(rerun.capturedAt)} (verification record ${short(rerun.recordId)})`, digest: rerun.artifactDigest, captured_at: rerun.capturedAt, valid_until: new Date(rerun.validUntil).toISOString() }];
      const p = await wr(ops, `${PG}/exceptions/propose`, 'governance.exception.propose', { exceptionId: EX.id, expectedVersion: 1, expiresAt: new Date((await dbNow()).getTime() + 14 * 86_400_000).toISOString(), evidence: ev }, 'GEX', EX.id);
      if (!p.ok) fail('K. Mensah proposes the renewal with current evidence', p);
      else {
        const e2 = p.body.exception;
        ok(`K. Mensah PROPOSED the RENEWAL ${e2.ref} v${e2.version} (renewal of v${e2.renewal_of}) with the re-run as current evidence, 14 days — a proposal lifts nothing`);
        const pv = await rd(assurance, `${PG}/preview`, { kind: 'exception', id: EX.id, version: e2.version }, 'governance.read', 'GWS');
        if (pv.ok) note(`H. Achterberg's preview: ${String(pv.body.consequence ?? '').slice(0, 220)}`);
        const d = await wr(assurance, `${PG}/exceptions/${EX.id}/decide`, 'governance.exception.decide', { version: e2.version, decision: 'approve', digest: pv.ok ? pv.body.digest : e2.digest,
          reason: 'renewed by the matrix\'s named approver over evidence captured after the expiry (SYNTHETIC)' }, 'GEX', EX.id);
        if (!d.ok) fail('H. Achterberg approves the renewal', d);
        else ok(`H. Achterberg APPROVED and SIGNED the renewal v${e2.version}: holds LIFTED ${(d.body.exception.holds_lifted ?? []).map((x) => x.subject_key ?? short(x.subject)).join(', ') || 'none'}`);
      }
    }
  }
  const open = await q(`select reason_kind from governance.holds where subject_artifact = $1 and lifted_at is null`, [RC.id]);
  (open.length === 0 ? ok : bad)(`the release candidate's open holds: ${open.map((x) => x.reason_kind).join(', ') || 'none'}`);
  let c = await q1(`select version, state, digest from governance.cm_release_candidates where candidate_id = $1 order by version desc limit 1`, [RC.id]);
  if (c.state === 'attested') note(`the release candidate v${c.version} is ATTESTED: stands — an earlier run`);
  else {
    const ch = await wr(steward, `${CM}/candidates/${RC.id}/check`, 'governance.conformance.candidate.check', { version: c.version }, 'RCN', RC.id);
    if (!ch.ok) fail('P. Castellano checks the candidate again', ch); else (ch.body.check?.outcome === 'conformant' ? ok : bad)(`the CHECK after the renewal: ${String(ch.body.check?.outcome).toUpperCase()}`);
    const pv = await call(`${CM}/candidates/${RC.id}/preview`, plat(assurance, 'governance.read', 'RCN', RC.id), {}, assurance.token);
    if (!pv.ok) fail('H. Achterberg previews the attestation', pv);
    else {
      note(`H. Achterberg's preview: can attest ${pv.body.eligibility?.can_attest}; ${String(pv.body.consequence ?? '').slice(0, 260)}`);
      expectRefused('P. Castellano (the proposer, a steward) attests the candidate', await wr(steward, `${CM}/candidates/${RC.id}/attest`, 'governance.conformance.candidate.attest', { version: c.version, digest: pv.body.digest, reason: 'the proposer attesting (refused)' }, 'RCN', RC.id), 403);
      const a = await wr(assurance, `${CM}/candidates/${RC.id}/attest`, 'governance.conformance.candidate.attest', { version: c.version, digest: pv.body.digest,
        reason: 'the evidence of the three required families reads true at this head; the expired exception was renewed over current evidence (SYNTHETIC)' }, 'RCN', RC.id);
      if (!a.ok) fail('H. Achterberg attests the candidate', a);
      else ok(`H. Achterberg (independent assurance — never its proposer, never its builder; human gate) ATTESTED the release candidate v${c.version} (signed manifest_attestation): ${a.body.attestation.state} — ${String(a.body.attestation.boundary ?? '').slice(0, 160)}`);
    }
  }
  c = await q1(`select version, state from governance.cm_release_candidates where candidate_id = $1 order by version desc limit 1`, [RC.id]);
  (c.state === 'attested' ? ok : bad)(`the release candidate ${short(RC.id)} v${c.version}: ${c.state.toUpperCase()} — a LOCAL CONFORMANCE RECORD (B65 substituted): nothing was released anywhere`);
}

/* ── B107-4 PART II ──────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB107-4 PART II — the journey evidence EXPIRES; the corridor\'s acceptance is CONSTRAINED; expansion to Polska HELD; re-acceptance over renewed evidence');
if (ACC && SHORT) {
  const states = await q(`select version, state from governance.acceptance_records where record_id = $1 order by version`, [ACC.id]);
  const reaccepted = states.find((x) => x.version > 1 && x.state === 'accepted');
  if (reaccepted) note(`the corridor's acceptance was RE-ACCEPTED (v${reaccepted.version}): stands — an earlier run`);
  else {
    await waitFor('the journey evidence\'s validity', SHORT.valid_until);
    let v = await accVersion(ACC.id, 1);
    if (v.state === 'accepted') {
      const sw = await dwr(steward, D, `${AR(D)}/sweep`, 'governance.acceptance.sweep', {}, 'ACR');
      if (!sw.ok) fail('P. Castellano runs the acceptance reconciliation', sw);
      else ok(`P. Castellano RECONCILED the corridor's acceptances: changed ${(sw.body.sweep?.changed ?? []).map((x) => `${short(x.record_id)} → ${x.state}`).join(', ') || 'none'}`);
    } else note(`the attention tick reconciled it first: v1 ${v.state}`);
    v = await accVersion(ACC.id, 1);
    (v.state === 'constrained' ? ok : bad)(`the acceptance v1: ${v.state.toUpperCase()} — ${(v.constrained_reasons ?? []).map((x) => x.kind).join(', ')}; the effective scope keeps ${(v.effective_scope?.journeys ?? []).join(', ')} and REMOVES ${(v.effective_scope?.removed?.journeys ?? []).join(', ')} (FEX-31: the previously accepted unaffected scope only)`);
    const sc = await drd(richter, D, `${AR(D)}/scope/read`, { subjectKey: CAP_KEY }, 'governance.acceptance.read', 'ACR');
    if (sc.ok) (sc.body.scope?.state === 'constrained' && sc.body.scope?.expansion_held === true ? ok : bad)(`the accepted scope in the corridor: ${sc.body.scope?.state}, expansion held ${sc.body.scope?.expansion_held}`);
    const hold = await q1(`select count(*)::int n from governance.holds where source_artifact = $1 and reason_kind = 'acceptance_constrained' and lifted_at is null`, [ACC.id]);
    (hold.n > 0 ? ok : bad)(`the EXPANSION hold on CAP-FW-07 is open (${hold.n})`);
    // expansion to NORDWERK Polska is HELD until re-acceptance (ES-71-004)
    let dpItem = await q1(`select evidence_id::text id from governance.acceptance_evidence where tenant_id = $1 and domain_id = $2 and kind = 'test_report' and subject_id = $3 limit 1`, [T, DP, SUPPLY?.artifactId]);
    if (!dpItem && SUPPLY) {
      const r = await dwr(steward, DP, `${AR(DP)}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'test_report', title: 'The supply-chain intelligence tests at the deployed head (verification record) — for a Polska proposal', subjectKind: 'governance.artifact',
        subjectId: SUPPLY.artifactId, covers: { journeys: ['JRN-11'] }, outcome: 'passed', capturedAt: new Date(SUPPLY.capturedAt).toISOString(), validUntil: new Date(SUPPLY.validUntil).toISOString() }, 'AEV');
      if (r.ok) dpItem = { id: r.body.evidence.evidence_id }; else fail('P. Castellano records the Polska evidence', r);
    }
    if (dpItem) expectRefused('E. Lindgren proposes CAP-FW-07 for NORDWERK Polska while the corridor\'s acceptance is constrained', await dwr(productA, DP, `${AR(DP)}/records/propose`, 'governance.acceptance.propose',
      { kind: 'capability', title: 'Supply-chain intelligence workspace (CAP-FW-07) for NORDWERK Polska (SYNTHETIC)', subjectKey: CAP_KEY, scope: ACC_SCOPE(), evidence: [dpItem.id] }, 'ACR'), 409, /\(held\)/);
    // RE-ACCEPTANCE over renewed evidence (same scope): every obligation again
    let fresh = await q1(`select evidence_id::text id from governance.acceptance_evidence where renews = $1`, [SHORT.id]);
    if (!fresh) {
      const bytes = readFileSync(join(SELF_ROOT, JOURNEY_FILE));
      const r = await dwr(steward, D, `${AR(D)}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'journey_evidence', title: 'The B33 browser walk of the supply map (JRN-11) — re-read and renewed for 30 days', subjectKind: 'external',
        pointer: JOURNEY_FILE, digest: sha256(bytes), covers: { journeys: ['JRN-11'] }, outcome: 'passed', capturedAt: JOURNEY_CAPTURED, validUntil: new Date((await dbNow()).getTime() + 30 * 86_400_000).toISOString(), renews: SHORT.id }, 'AEV');
      if (!r.ok) fail('P. Castellano renews the journey evidence', r); else { fresh = { id: r.body.evidence.evidence_id }; ok(`P. Castellano RENEWED the journey evidence (${short(fresh.id)} renews ${short(SHORT.id)}; 30 days)`); }
    }
    if (fresh) {
      let v2 = states.find((x) => x.version === 2) ? await accVersion(ACC.id, 2) : null;
      if (!v2) {
        const r = await dwr(productA, D, `${AR(D)}/records/propose`, 'governance.acceptance.propose', { recordId: ACC.id, expectedVersion: 1, kind: 'capability', title: ACC_TITLE, subjectKey: CAP_KEY, scope: ACC_SCOPE(), evidence: [TEST_ITEM.id, fresh.id], obligations: [] }, 'ACR');
        if (!r.ok) fail('E. Lindgren proposes the re-acceptance', r); else { v2 = await accVersion(ACC.id, 2); ok(`E. Lindgren PROPOSED the RE-ACCEPTANCE v2 over the renewed evidence (the same scope) — v1 stays in force, constrained, until v2 is accepted`); }
      }
      if (v2 && v2.state === 'proposed') await attestAll(ACC.id, 2, v2.digest);
    }
  }
  // the expiry timer scheduled for v1 (its short item's validity) fires on the attention tick AFTER the re-acceptance: it must leave v2 ACCEPTED
  const due = await q(`select timer_id::text id, due_at from executive.workflow_timers where owner_kind = 'acceptance_record' and owner_id = $1 and kind = 'acceptance.evidence_expiry' and fired_at is null and cancelled_at is null and due_at <= clock_timestamp()`, [ACC.id]);
  if (due.length > 0) {
    const t0 = Date.now();
    note(`v1's expiry timer (due ${iso(due[0].due_at)}) has not fired yet — WAITING for the attention tick to fire it (real ticks, nothing moved)`);
    let fired = null;
    while (Date.now() - t0 < 240_000) { fired = await q1(`select fired_at from executive.workflow_timers where timer_id = $1 and fired_at is not null`, [due[0].id]); if (fired) break; await sleep(5_000); }
    WAITS.push(`v1's expiry timer fired by the tick: ${Math.round((Date.now() - t0) / 1000)} s`);
    (fired ? ok : bad)(`the tick FIRED v1's expiry timer at ${iso(fired?.fired_at)} — after the re-acceptance`);
  }
  const all = await q(`select version, state from governance.acceptance_records where record_id = $1 order by version`, [ACC.id]);
  const last = all[all.length - 1];
  (last.state === 'accepted' && all.length >= 2 ? ok : bad)(`the corridor's acceptance: ${all.map((x) => `v${x.version} ${x.state}`).join(', ')}`);
  const open = await q1(`select count(*)::int n from governance.holds where source_artifact = $1 and lifted_at is null`, [ACC.id]);
  (open.n === 0 ? ok : bad)(`the expansion hold LIFTED (open holds from the record: ${open.n})`);
  const sc = await drd(richter, D, `${AR(D)}/scope/read`, { subjectKey: CAP_KEY }, 'governance.acceptance.read', 'ACR');
  const there = await drd(nowak, DP, `${AR(DP)}/scope/read`, { subjectKey: CAP_KEY }, 'governance.acceptance.read', 'ACR');
  if (sc.ok && there.ok) (sc.body.scope?.state === 'accepted' && there.body.scope?.state === 'not_accepted' ? ok : bad)(`the accepted scope: corridor ${sc.body.scope?.state} (journeys ${(sc.body.scope?.effective_scope?.journeys ?? []).join(', ')}), NORDWERK Polska ${there.body.scope?.state}`);
}

/* ── B107-7 THE STATE AND THE LIMITS ─────────────────────────────────────────────────── */
console.log('\nB107-7 THE STATE and the LIMITS');
{
  const n = await q1(`select (select count(*) from governance.artifacts where superseded_at is null)::int artifacts, (select count(*) from governance.links_live)::int links,
     (select count(*) from governance.events)::int events, (select count(*) from governance.signatures)::int platform_signatures,
     (select count(*) from executive.signatures where subject_kind in ('acceptance_attestation', 'design_acceptance'))::int domain_signatures,
     (select count(*) from governance.rg_verification_records)::int verification_records, (select count(*) from governance.holds where lifted_at is null)::int open_holds,
     (select count(*) from governance.ownership_gaps where state in ('open', 'escalated'))::int open_gaps`);
  note(`in the governance ledgers: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const claims = await q1(`select (select count(*) from governance.ws_baselines where claim <> 'demonstration')::int b, (select count(*) from governance.acceptance_records where claim <> 'demonstration')::int a,
     (select count(*) from governance.design_acceptances where claim <> 'demonstration')::int d, (select count(*) from governance.design_conformance_packages where signed)::int signed_packages`);
  (claims.b + claims.a + claims.d + claims.signed_packages === 0 ? ok : bad)(`no record claims more than a DEMONSTRATION (baselines ${claims.b}, acceptance records ${claims.a}, design acceptances ${claims.d} beyond it; signed conformance packages ${claims.signed_packages})`);
  ENV_OUT.EYE_B107_TENANT = T; ENV_OUT.EYE_B107_DOMAIN = D; ENV_OUT.EYE_B107_POLSKA = DP;
  ENV_OUT.EYE_B107_DOMAIN_ADMIN = 't.richter'; ENV_OUT.EYE_B107_SPONSOR = 'w.zielinska'; ENV_OUT.EYE_B107_POLSKA_ADMIN = 'k.nowak'; ENV_OUT.EYE_B107_DATA_STEWARD = 'f.aydin';
  console.log('  the env lines for the walk (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  if (WAITS.length) note(`the REAL WAITS of this run (database clock): ${WAITS.join('; ')}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — the software and its harnesses (phase6-{prelude,registries,conformance,workspace,acceptance,design,ownership}-b107). (2) DEMONSTRATED OPERATION — what RAN here through the governed routes: the repository\'s registers imported read-only (the CSVs stay authoritative; EXC-P0-003 REPORTED expired — renewing or closing it is the owner\'s), the committed component manifest registered, the orphans and the lint STATED; an accountable owner for every capability, the decision-rights matrix and the product baseline SIGNED; the forecast contract\'s deterministic impact recorded as a proposal and its change proposal approved over its six plans (nothing in the contract changed); a local release candidate over REAL test runs at the deployed head, HELD by an expired export-path exception and released by its renewal over a re-run, then ATTESTED; CAP-FW-07 accepted for the corridor domain ONLY (standing for the Regensburg line; NORDWERK Polska is the out-of-scope domain — no domain named Regensburg exists), CONSTRAINED when its short-lived journey evidence expired, expansion HELD, re-accepted over renewed evidence; the design inventory, the lint, the owned assets, the attested design baselines, B92\'s finding taken in as a contribution and published as a pattern version (not adopted in the source — reported as drift), a design acceptance; the corridor\'s domain registry entry, a data authority, a stewardship case and the export component\'s ratified ownership. Every vendor and customer person here is SYNTHETIC — E. Lindgren, R. Moreau, H. Achterberg, P. Castellano, K. Mensah, L. Haddad and S. Iversen were created by the platform administrator for this act; every approval, attestation, acceptance and signature they gave DEMONSTRATES the software (claim: demonstration). (3) REAL ACCEPTANCE — NEVER CLAIMED: named independent and customer authorities (R2: PR-71-006, AT-71, JRN-24, CAP-DL-12), the executive attestation and the independent release authorities (H3), production admission (R1 — the admission check is the construction half), signed releases (B65 — the release candidate is a local record, never a release), SLO computation (B64), accessibility results (B108 → H3; MET-034 unsupported). The conformance packages for UX-70-006 and UX-66-006 are generated and LEFT UNSIGNED. THE ONE SUBSTITUTION: the Decision Agent\'s run session was opened through the identity port (act-b35\'s idiom) to show an agent\'s attestation refused. HARNESS-PROVEN ONLY (not staged here): the fault exercises (an unbound signing key, a database refusal mid-import), the repeat-exception remediation review, conflicts, the acceptance request gate (enforce_acceptance), operational and release acceptances, the design exception expiry, component reconciliation over every manifest component, the B90 residuals (phase6-*-b107).');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
