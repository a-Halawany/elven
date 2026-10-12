#!/usr/bin/env node
/**
 * CP-6 stage B92 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): PRODUCT ANALYTICS,
 * THE METRIC CATALOG AND UX TELEMETRY (migration 0113; feature F-P7-F-03) — exercised by the personas through the REAL HTTP routes only, each
 * scene stating what it shows and ASSERTING it (a scene that does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is
 * RERUN-SAFE: each scene first reads what an earlier run left (read-only SQL) and says "stands — an earlier run" instead of writing it twice.
 * No clock is moved and NOTHING IS PLANTED: no SQL write; the scene's metrics are computed over the demonstration's own records, whatever their
 * honest state is (thin, indeterminate, unpriced) — never a record made to make a metric look good.
 *
 *   B92-0  THE STATE — 0113 applied; the casting (the tenant administrator, the vendor's commercial authority, the domain administrator, the
 *          chair, the forecast and decision owners); the inputs of the corridor scope (the objective, the PortWatch chokepoint4 series, the
 *          Bab el-Mandeb geography the warnings name; no graph entity named Bab el-Mandeb exists in the domain — said).
 *   B92-1  THE LICENCE — an analytics.* write refused EYE-ENT-001 (NORDWERK's licence lacks product_analytics); C. Marchetti (commercial
 *          authority, PLATFORM) re-declares the full-platform package + the SKU and reissues the licence adding product_analytics.
 *   B92-2  THE PERSONAS (SYNTHETIC) and THE ROUTING — N. Vogel (tenant administrator) creates the product analytics owner, the privacy officer
 *          and the product analyst (fresh login names, tenant-wide unique); the chair is the existing executive S. Okafor; T. Richter publishes
 *          the attention policy routing the three analytics classes (every earlier class byte-identical).
 *   B92-3  THE PURPOSES — the analyst proposes the six; the privacy officer approves each at its digest; refused: the proposer approving
 *          (403), an employee-performance purpose (403).
 *   B92-4  THE SCOPE red-sea-corridor — proposed by the analyst, approved by the owner at its digest.
 *   B92-5  THE DEFINITIONS — every contract of definitionsA and definitionsB proposed by the analyst through §MD's port (the owner persona
 *          bound as the named owner — product_analytics_owner is admitted for every App M owner role), approved by the owner at its digest;
 *          refused: a definition grouped by a person (acknowledged_by) 403.
 *   B92-6  THE SCENE'S METRICS — MET-001, MET-022, MET-024 for 2026-Q3 in the corridor (and domain-wide): state, value or the EXPLAINED
 *          indeterminate reasons, n, numerator/denominator, window and clock, uncertainty, records by role with ids; the quarterly series
 *          2025-Q4…2026-Q3 (sparse history explicit); a replay reproduced; refused: a person-grained cohort (403); the open quarter 2026-Q4
 *          computed and shown partial (indeterminate, never presented as the quarter).
 *   B92-7  THE CORRECTION — MET-022 v2 (strict: no raised_at proxy) proposed by the analyst, approved by the owner; recomputed beside v1; the
 *          series names the non-comparable versions; a threshold EXCEPTION proposed by the analyst and decided by the owner, shown BESIDE the
 *          MET-024 result (the result unchanged).
 *   B92-8  THE OPERATING REVIEW — opened by the analyst with the chair named; assembled (cites the latest non-preview results, MET-023 listed
 *          "not computed"); held; notes; the follow-through per metric by the chair; refused: a non-chair close (403), a stale digest (409);
 *          closed and signed by the chair at the digest; read back with each metric's drill-down.
 *   B92-9  COMPARABILITY AND COST — a cohort comparison (two periods of one metric) with its interval or explained indeterminate; the cost
 *          reconciliation of 2026-Q3 (unpriced is the honest state — said).
 *   B92-10 EXPERIENCE QUALITY — journeys operating-review and experience-page; event definitions defined by the analyst, reviewed by the privacy
 *          officer; two personas consent themselves; events of the operating-review journey; a person without consent NOT collected (counted);
 *          a held definition refuses, released → collected again; a baseline; a finding and the owner's action (never automatic); an export.
 *   B92-11 THE STATE, the env lines for the walk, the LIMITS (three claims kept apart).
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument) when given. Nothing prints a credential: every persona's password
 * is EYE_TEST_ADMIN_PASSWORD from the environment.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

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
// the contracts are the BUILT API's (this act's own tree first): definitionsA / definitionsB are data the analyst proposes
const requireBuilt = createRequire(join(existsSync(join(SELF_ROOT, 'apps', 'api', 'dist')) ? SELF_ROOT : ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const A = `${X}/analytics`; const UX = `${A}/experience`; const E = `${X}/executive/attention`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 420)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const num = (x, d = 3) => (x === null || x === undefined ? '—' : Number(x).toFixed(d).replace(/\.?0+$/, ''));
const tStart = Date.now();
console.log(`THE B92 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, status, re, code) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? ''))) && (code === undefined || r.body?.code === code)) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${status}${code ? ` ${code}` : ''} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};
const dom = (s, action, objectType, objectId = null) => as(s, scope, { purposeId: 'intelligence', consequence: 'C2', action, objectType, objectId, trace: 'phase6-b92' });
const rd = (s, objectType, objectId = null) => as(s, scope, { purposeId: 'intelligence', consequence: 'C2', action: 'analytics.read', objectType, objectId, sideEffect: 'none', trace: 'phase6-b92' });
const plat = (s, over) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'commercial', consequence: 'C2', ...over });
const PERIOD = '2026-Q3'; const OPEN_PERIOD = '2026-Q4'; const SCOPE_KEY = 'red-sea-corridor';
const SCENE = ['MET-001', 'MET-022', 'MET-024'];
const REVIEW_TITLE = 'NORDWERK corridor operating review — 2026-Q3 (SYNTHETIC)';
const dayPlus = async (n) => (await q(`select to_char((clock_timestamp() at time zone 'UTC')::date + $1::int, 'YYYY-MM-DD') d`, [n]))[0].d;
const TODAY = await dayPlus(0);

/* ── B92-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB92-0 THE STATE — 0113, the casting, the inputs of the corridor scope');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0113%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0113 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D]))[0].n > 0;
const CAST = [['n.vogel', 'tenant_admin', 'TENANT'], ['c.marchetti', 'commercial_authority', 'PLATFORM'], ['t.richter', 'domain_admin', 'DOMAIN'], ['s.okafor', 'executive', 'DOMAIN'],
  ['n.eriksen', 'forecast_owner', 'DOMAIN'], ['l.brandt', 'decision_owner', 'DOMAIN'], ['c.brenner', 'risk_owner', 'DOMAIN']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}`); else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const renew = async (s) => { const n = await login(s.login, PW); if (n === null) { bad(`${s.login} could not authenticate again`); return s; } Object.assign(s, n); return s; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) await renew(s); };
const vogel = await persona('n.vogel'); const vendor = await persona('c.marchetti'); const richter = await persona('t.richter'); const chair = await persona('s.okafor');
const eriksen = await persona('n.eriksen'); const brandt = await persona('l.brandt');
const NAME = { [vogel.principalId]: 'N. Vogel', [vendor.principalId]: 'C. Marchetti', [richter.principalId]: 'T. Richter', [chair.principalId]: 'S. Okafor', [eriksen.principalId]: 'N. Eriksen',
  [brandt.principalId]: 'L. Brandt' };
const nm = (id) => NAME[id] ?? short(id);
// THE SCOPE'S INPUTS (read-only)
const OBJECTIVE = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active'
                             and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const SERIES = 'portwatch:chokepoint4:n_total';
const GEO = 'BAB-EL-MANDEB';
{
  (OBJECTIVE ? ok : bad)(`the corridor objective: ${OBJECTIVE ? `"${OBJECTIVE.title}" ${short(OBJECTIVE.id)}` : 'ABSENT'}`);
  const s = (await q(`select count(*)::int n from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = $3`, [T, D, SERIES]))[0].n;
  (s === 1 ? ok : bad)(`the PortWatch series ${SERIES} is registered in the domain (the real IMF PortWatch daily transit counts for Bab el-Mandeb, chokepoint4)`);
  const g = (await q(`select count(*)::int n from prediction.warnings_current where tenant_id = $1 and domain_id = $2 and affected -> 'geographies' ? $3`, [T, D, GEO]))[0].n;
  note(`the geography token ${GEO}: named by ${g} warning(s) of the domain (the warning rule matches it, case-insensitively)`);
  const ent = await q(`select entity_id::text, canonical_name from graph.entities_current where tenant_id = $1 and domain_id = $2 and lifecycle_state = 'active' and canonical_name ilike '%mandeb%'`, [T, D]);
  note(ent.length > 0 ? `the Bab el-Mandeb graph entity: ${ent.map((e) => `${e.canonical_name} ${short(e.entity_id)}`).join(', ')}`
    : 'NO graph entity named Bab el-Mandeb exists in the domain (its 13 entities are the parts, the ships, the plant, Suez, the Cape…): the scope names the strait by its GEOGRAPHY token and its PortWatch series — no entity is created for the scene');
}
const BAB_ENTITIES = (await q(`select entity_id::text id from graph.entities_current where tenant_id = $1 and domain_id = $2 and lifecycle_state = 'active' and canonical_name ilike '%mandeb%'`, [T, D])).map((e) => e.id);

/* ── B92-1 THE LICENCE ───────────────────────────────────────────────────────────────── */
console.log('\nB92-1 THE LICENCE — an analytics.* write refused EYE-ENT-001; C. Marchetti reissues NORDWERK\'s licence adding product_analytics');
const liveLicence = async () => (await q(`select licence_id::text, version, package_key, state, capabilities, issued_at from commercial.licences where tenant_id = $1 and state <> 'superseded' order by issued_at desc, version desc limit 1`, [T]))[0] ?? null;
{
  let live = await liveLicence();
  const cap = (await q(`select capability_key || ' v' || version || ' (' || status || ', prefixes ' || array_to_string(action_prefixes, ',') || ')' c from commercial.capabilities where capability_key = 'product_analytics' order by version desc limit 1`))[0]?.c;
  note(`the catalogue: ${cap ?? 'product_analytics ABSENT'}; NORDWERK's live licence: ${live ? `v${live.version} ${live.package_key} (${live.state})` : 'NONE (uncontracted)'}`);
  if (live?.capabilities.includes('product_analytics')) {
    const den = (await q(`select created_at, reason from policy.policy_decisions where tenant_id = $1 and action like 'analytics.%' and decision = 'deny' and reason ilike '%product_analytics%' order by created_at limit 1`, [T]))[0] ?? null;
    note(`licence v${live.version} carries product_analytics — an earlier run${den ? `; the refusal it answered stands in the policy ledger (${iso(den.created_at)}: "${String(den.reason).slice(0, 200)}")` : ''}`);
  } else {
    // 1. the refusal, explained: the executive S. Okafor (a chair role) opens an operating review while the licence lacks product_analytics
    const r = await call(`${A}/reviews/open`, dom(chair, 'analytics.review.open', 'AOR'), { title: REVIEW_TITLE, period: PERIOD, metricKeys: ['MET-001'], chair: chair.principalId, participantRoles: ['executive'] }, chair.token);
    expectRefused(`S. Okafor (executive) opens an operating review under licence v${live?.version} (no product_analytics)`, r, 403, /^capability unavailable \(entitlement\): product_analytics is not licensed for this tenant/, 'EYE-ENT-001');
    // 2. the vendor: the full-platform package v(n+1) = its capabilities + product_analytics; the SKU re-declared on it; the licence issued
    const pk = (await q(`select version, capabilities, tier from commercial.packages where package_key = 'full-platform' and status <> 'superseded' order by version desc limit 1`))[0] ?? null;
    if (pk === null) bad('the full-platform package is absent (act-b91 --restore declares it)');
    else {
      let pkv = pk.version;
      if (!pk.capabilities.includes('product_analytics')) {
        const r1 = await call('/v1/commercial/packages/declare', plat(vendor, { action: 'commercial.offer.package', objectType: 'PKG' }), { key: 'full-platform', expectedVersion: pk.version, title: 'The full platform (SYNTHETIC)',
          capabilities: [...pk.capabilities, 'product_analytics'], limits: {}, tier: pk.tier, reason: 'B92: product analytics, the metric catalog and UX telemetry are built — the full platform now includes product_analytics (SYNTHETIC)' }, vendor.token);
        if (!r1.ok) fail('C. Marchetti re-declares the full-platform package', r1); else { pkv = r1.body.package.version; ok(`C. Marchetti DECLARED the package full-platform v${pkv}: ${r1.body.package.capabilities.join(', ')} (SYNTHETIC)`); }
      } else note(`the package full-platform v${pk.version} already includes product_analytics — an earlier run`);
      const sku = (await q(`select version, package_version from commercial.skus where sku_code = 'EYE-FULL-12M' and status <> 'superseded' order by version desc limit 1`))[0] ?? null;
      if (sku && sku.package_version === pkv) note(`the SKU EYE-FULL-12M v${sku.version} is on full-platform v${pkv} — an earlier run`);
      else {
        const r2 = await call('/v1/commercial/skus/declare', plat(vendor, { action: 'commercial.offer.sku', objectType: 'SKU' }), { code: 'EYE-FULL-12M', expectedVersion: sku?.version ?? 0, title: 'The full platform — 12 months (SYNTHETIC)', packageKey: 'full-platform', termMonths: 12,
          reason: 'the full platform with product analytics on a twelve-month term (SYNTHETIC)' }, vendor.token);
        if (!r2.ok) fail('C. Marchetti re-declares the SKU EYE-FULL-12M', r2); else ok(`C. Marchetti DECLARED the SKU ${r2.body.sku.sku_code} v${r2.body.sku.version}: ${r2.body.sku.package_key} v${r2.body.sku.package_version}, ${r2.body.sku.term_months} months`);
      }
      const r3 = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(vendor, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: 'EYE-FULL-12M',
        orderRef: 'SYNTH-ORDER-NORDWERK-B92-ANALYTICS', reason: 'B92: NORDWERK licensed for product analytics — the previous licence\'s capabilities and product_analytics, no term end (SYNTHETIC)' }, vendor.token);
      if (!r3.ok) fail('C. Marchetti reissues the licence', r3);
      else ok(`C. Marchetti ISSUED NORDWERK licence v${r3.body.licence.version}: ${r3.body.licence.package_key} — ${r3.body.licence.capabilities.length} capabilities incl. product_analytics; supersedes v${r3.body.licence.provenance?.supersedes} (kept in the history); order ${r3.body.licence.provenance?.order_ref}`);
    }
    live = await liveLicence();
  }
  const prev = (await q(`select capabilities from commercial.licences where tenant_id = $1 and version = $2`, [T, (live?.version ?? 1) - 1]))[0]?.capabilities ?? [];
  const lost = prev.filter((c) => !(live?.capabilities ?? []).includes(c));
  (live?.capabilities.includes('product_analytics') && live.state === 'active' && lost.length === 0 ? ok : bad)(`NORDWERK's licence v${live?.version} (${live?.package_key}, ${live?.state}) carries product_analytics and every capability of v${(live?.version ?? 1) - 1}${lost.length ? ` — LOST ${lost.join(', ')}` : ''}: ${(live?.capabilities ?? []).join(', ')}`);
  ENV_OUT.EYE_B92_LICENCE_VERSION = String(live?.version ?? '');
}

/* ── B92-2 THE PERSONAS AND THE ROUTING ──────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-2 THE PERSONAS (SYNTHETIC) — N. Vogel creates the owner, the privacy officer and the analyst; the chair; the routing of the analytics classes');
const NEW = [
  { key: 'owner', login: 'm.okonkwo', name: 'M. Okonkwo — product analytics owner (SYNTHETIC)', short: 'M. Okonkwo', role: 'product_analytics_owner' },
  { key: 'privacy', login: 'l.haas', name: 'L. Haas — privacy officer (SYNTHETIC)', short: 'L. Haas', role: 'privacy_officer' },
  { key: 'analyst', login: 'j.sato', name: 'J. Satō — product analyst (SYNTHETIC)', short: 'J. Satō', role: 'product_analyst' },
];
const P = {};
for (const sp of NEW) {
  const existing = (await q(`select p.id::text, p.display_name, p.tenant_id::text t from identity.principals p where p.login_name = $1`, [sp.login]))[0] ?? null;
  if (existing && existing.display_name !== sp.name) { bad(`the login name ${sp.login} is taken by "${existing.display_name}" — a login name is tenant-wide; choose another`); process.exit(1); }
  const present = existing !== null && (await holds(sp.login, sp.role, 'DOMAIN'));
  const r = await createPersona(vogel, T, { displayName: sp.name, loginName: sp.login, password: PW, roleCode: sp.role, domainId: D });
  if (r.session === null) { bad(`${sp.short} could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (r.created) ok(`N. Vogel (tenant administrator) CREATED ${sp.short} through the governed principal route — "${sp.name}", login ${sp.login} (no collision: the name was free tenant-wide), ${sp.role} at the DOMAIN (the corridor domain)`);
  else if (present) note(`${sp.short} (${sp.login}, ${sp.role}, the corridor domain) is present — an earlier run`);
  else { bad(`${sp.login} exists but holds no ${sp.role} binding in the corridor domain`); process.exit(1); }
  P[sp.key] = { ...r.session, login: sp.login }; PERSONAS.push(P[sp.key]); NAME[r.session.principalId] = sp.short;
}
const owner = P.owner; const privacy = P.privacy; const analyst = P.analyst;
(new Set([owner.principalId, privacy.principalId, analyst.principalId]).size === 3 ? ok : bad)(`three DIFFERENT people: the owner ${nm(owner.principalId)}, the privacy officer ${nm(privacy.principalId)}, the analyst ${nm(analyst.principalId)}; the chair is the existing executive S. Okafor ("S. Okafor — executive approver")`);
ENV_OUT.EYE_B92_OWNER = owner.login; ENV_OUT.EYE_B92_PRIVACY = privacy.login; ENV_OUT.EYE_B92_ANALYST = analyst.login; ENV_OUT.EYE_B92_CHAIR = chair.login;
{
  const ROUTES = { 'analytics.metric': ['product_analytics_owner'], 'analytics.privacy': ['privacy_officer'], 'analytics.experience': ['product_analytics_owner'] };
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const routed = (rules) => Object.entries(ROUTES).every(([c, roles]) => JSON.stringify(rules?.classes?.[c]?.route_roles ?? []) === JSON.stringify(roles));
  if (active === null) bad('no active attention policy on the corridor domain');
  else if (routed(active.rules)) { note(`attention policy version ${active.version} routes ${Object.entries(ROUTES).map(([c, r]) => `${c} → [${r.join(', ')}]`).join('; ')} — an earlier run`); ENV_OUT.EYE_B92_POLICY_VERSION = String(active.version); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    for (const [c, roles] of Object.entries(ROUTES)) if (rules.classes[c] === undefined) rules.classes[c] = { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: roles, ack_within_minutes: 1440, notify: 'in_app' };
    const r = await call(`${E}/policy/publish`, as(richter, scope, { purposeId: 'executive', consequence: 'C2', action: 'executive.attention.policy.publish', objectType: 'ATP' }), { rules,
      reason: 'B92: metric reviews and operating-review follow-through to the product analytics owner; privacy reviews to the privacy officer; experience reviews to the product analytics owner — every earlier class unchanged (SYNTHETIC)' }, richter.token);
    if (!r.ok) fail('T. Richter publishes the attention policy', r);
    else {
      const pub = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0];
      const kept = Object.keys(active.rules.classes).filter((c) => JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c]));
      (kept.length === Object.keys(active.rules.classes).length && routed(pub.rules) ? ok : bad)(`T. Richter PUBLISHED attention policy VERSION ${pub.version} (supersedes ${active.version}): ${Object.entries(ROUTES).map(([c, ro]) => `${c} → [${ro.join(', ')}]`).join('; ')}; ${kept.length} of ${Object.keys(active.rules.classes).length} earlier classes byte-identical`);
      ENV_OUT.EYE_B92_POLICY_VERSION = String(pub.version);
    }
  }
}

/* ── B92-3 THE PURPOSES ──────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-3 THE PURPOSES — the analyst proposes, the privacy officer approves at the digest; the proposer approving and a performance purpose refused');
const PURPOSES = [
  { key: 'product-quality', kind: 'product_improvement', title: 'Product quality of the intelligence workflow', retentionDays: 365,
    description: 'Measure whether the product\'s provenance, knowledge, observation and search work as specified, so the product team can improve them — aggregates only, never a person.' },
  { key: 'mission-outcomes', kind: 'mission_outcome', title: 'Mission outcomes of decisions and foresight', retentionDays: 730,
    description: 'Measure whether decisions close their loop and forecasts and warnings serve the objectives they were raised for — aggregates over records, never a person.' },
  { key: 'governance-assurance', kind: 'governance', title: 'Governance assurance', retentionDays: 730,
    description: 'Measure whether human authority, explanation, replay and provenance controls hold across the product\'s consequential acts — records and roles, never a person.' },
  { key: 'service-reliability', kind: 'reliability', title: 'Service reliability', retentionDays: 365,
    description: 'Measure delivery, acknowledgement and degradation latencies of the product\'s services so the operators can keep them reliable — durations of records, never a person.' },
  { key: 'analytics-cost', kind: 'cost', title: 'Analytics cost allocation', retentionDays: 730,
    description: 'Meter the rows read and compute time of each metric computation and reconcile them against the commercial usage ledger — no person is metered.' },
  { key: 'experience-telemetry', kind: 'product_improvement', title: 'Experience telemetry of the analytics pages', retentionDays: 180,
    description: 'Pseudonymous, consented step outcomes and durations of the operating-review and experience journeys to improve the pages — never content, never a person, never employee performance, ranking or surveillance.' },
];
const purposeRow = async (key) => (await q(`select purpose_id::text id, version, state, digest, proposed_by::text, decided_by::text from analytics.purposes where tenant_id = $1 and domain_id = $2 and purpose_key = $3 order by version desc limit 1`, [T, D, key]))[0] ?? null;
{
  let refusedOnce = false;
  for (const p of PURPOSES) {
    let row = await purposeRow(p.key);
    if (row?.state === 'approved') { note(`purpose ${p.key} v${row.version} APPROVED by ${nm(row.decided_by)} — stands (an earlier run)`); continue; }
    if (row === null || row.state !== 'proposed') {
      const r = await call(`${A}/purposes/propose`, dom(analyst, 'analytics.purpose.propose', 'APU'), { key: p.key, title: p.title, kind: p.kind, description: p.description, retentionDays: p.retentionDays }, analyst.token);
      if (!r.ok) { fail(`J. Satō proposes the purpose ${p.key}`, r); continue; }
      row = { id: r.body.purpose.purpose_id, version: r.body.purpose.version, state: r.body.purpose.state, digest: r.body.purpose.digest };
      ok(`J. Satō (analyst) PROPOSED purpose ${p.key} v${row.version} (${p.kind}, raw retention ${p.retentionDays} days) — digest ${row.digest.slice(0, 12)}…`);
    }
    if (!refusedOnce) {
      refusedOnce = true;
      expectRefused(`J. Satō (the proposer) approves her own purpose ${p.key}`, await call(`${A}/purposes/${row.id}/decide`, dom(analyst, 'analytics.purpose.decide', 'APU', row.id), { decision: 'approve', digest: row.digest, reason: 'the proposer approving her own purpose (refused)' }, analyst.token), 403);
    }
    const d = await call(`${A}/purposes/${row.id}/decide`, dom(privacy, 'analytics.purpose.decide', 'APU', row.id), { decision: 'approve', digest: row.digest,
      reason: `the privacy and minimisation review: ${p.key} states a ${p.kind} purpose over records and aggregates, no person, retention ${p.retentionDays} days (SYNTHETIC)` }, privacy.token);
    if (!d.ok) fail(`L. Haas approves ${p.key}`, d); else ok(`L. Haas (privacy officer, not the proposer) APPROVED ${p.key} v${d.body.purpose.version} at digest ${d.body.purpose.digest.slice(0, 12)}…`);
  }
  if (!refusedOnce) {   // a rerun: the separation of duties shown again on a decided purpose's id (refused at the PEP before the port)
    const row = await purposeRow('product-quality');
    expectRefused('J. Satō (the proposer) decides the purpose product-quality', await call(`${A}/purposes/${row.id}/decide`, dom(analyst, 'analytics.purpose.decide', 'APU', row.id), { decision: 'approve', digest: row.digest, reason: 'the proposer approving her own purpose (refused)' }, analyst.token), 403);
  }
  expectRefused('J. Satō proposes "staff-acknowledgement-scoring" (employee performance)', await call(`${A}/purposes/propose`, dom(analyst, 'analytics.purpose.propose', 'APU'), { key: 'staff-acknowledgement-scoring', title: 'Acknowledgement speed per employee',
    kind: 'product_improvement', description: 'Rank staff by how fast each employee acknowledges warnings, for the annual performance review.', retentionDays: 365 }, analyst.token), 403, /^analytics purpose rejected \(person\)/);
  const all = await q(`select purpose_key, version, state from analytics.purposes where tenant_id = $1 and domain_id = $2 and state = 'approved' order by purpose_key`, [T, D]);
  (PURPOSES.every((p) => all.some((a) => a.purpose_key === p.key)) ? ok : bad)(`the purpose register: ${all.map((a) => `${a.purpose_key} v${a.version}`).join(', ')} APPROVED`);
}

/* ── B92-4 THE SCOPE ─────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-4 THE SCOPE red-sea-corridor — proposed by the analyst, approved by the owner at its digest');
let SCOPE_ROW = null;
{
  let row = (await q(`select scope_id::text id, version, state, digest, entity_ids, objective_ids, series_keys, geographies from analytics.scopes where tenant_id = $1 and domain_id = $2 and scope_key = $3 order by version desc limit 1`, [T, D, SCOPE_KEY]))[0] ?? null;
  if (row?.state === 'approved') note(`scope ${SCOPE_KEY} v${row.version} APPROVED — stands (an earlier run)`);
  else {
    if (row === null || row.state !== 'proposed') {
      const r = await call(`${A}/scopes/propose`, dom(analyst, 'analytics.scope.propose', 'ASC'), { key: SCOPE_KEY, title: 'The Red Sea corridor (Bab el-Mandeb)',
        entityIds: BAB_ENTITIES, objectiveIds: OBJECTIVE ? [OBJECTIVE.id] : [], seriesKeys: [SERIES], geographies: [GEO],
        description: 'The Red Sea corridor through Bab el-Mandeb: a decision package concerns it when it serves the objective "Keep the Regensburg line supplied through Q1"; a warning when its affected objectives or geographies name it; a forecast or outcome when it is on the PortWatch chokepoint4 series. No graph entity of the strait exists, so the geography carries it.' }, analyst.token);
      if (!r.ok) fail('J. Satō proposes the scope', r);
      else { row = { id: r.body.scope.scope_id, version: r.body.scope.version, state: r.body.scope.state, digest: r.body.scope.digest }; ok(`J. Satō PROPOSED scope ${SCOPE_KEY} v${row.version} — digest ${row.digest.slice(0, 12)}…`); }
    }
    if (row) {
      const d = await call(`${A}/scopes/${row.id}/decide`, dom(owner, 'analytics.scope.decide', 'ASC', row.id), { decision: 'approve', digest: row.digest, reason: 'the corridor as the operating review reads it: the objective, the chokepoint4 series, the strait (SYNTHETIC)' }, owner.token);
      if (!d.ok) fail('M. Okonkwo approves the scope', d); else ok(`M. Okonkwo (owner, not the proposer) APPROVED scope ${SCOPE_KEY} v${d.body.scope.version} at its digest`);
    }
  }
  SCOPE_ROW = (await q(`select scope_id::text id, version, state, digest, entity_ids, objective_ids, series_keys, geographies from analytics.scopes where tenant_id = $1 and domain_id = $2 and scope_key = $3 and state = 'approved'`, [T, D, SCOPE_KEY]))[0] ?? null;
  (SCOPE_ROW ? ok : bad)(`THE SCOPE ${SCOPE_KEY} v${SCOPE_ROW?.version}: objectives [${(SCOPE_ROW?.objective_ids ?? []).map(short).join(', ')}] · series [${(SCOPE_ROW?.series_keys ?? []).join(', ')}] · geographies [${(SCOPE_ROW?.geographies ?? []).join(', ')}] · entities [${(SCOPE_ROW?.entity_ids ?? []).map(short).join(', ') || 'none — no Bab el-Mandeb entity in the graph'}]`);
  ENV_OUT.EYE_B92_SCOPE = SCOPE_KEY; ENV_OUT.EYE_B92_PERIOD = PERIOD;
}

/* ── B92-5 THE DEFINITIONS ───────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-5 THE DEFINITIONS — every contract of definitionsA and definitionsB proposed by the analyst, approved by the owner at its digest');
const { definitionsA } = requireBuilt('./dist/analytics/computations-a/definitions-a.js');
const { definitionsB } = requireBuilt('./dist/analytics/computations-b/definitions-b.js');
const CONTRACTS = [...definitionsA, ...definitionsB];
const defRows = async (key) => q(`select definition_id::text id, version, state, digest, supported, computation_key, params, proposed_by::text, decided_by::text, effective_from from analytics.metric_definitions
                                   where tenant_id = $1 and domain_id = $2 and metric_key = $3 order by version`, [T, D, key]);
{
  let proposed = 0; let approved = 0; let stood = 0; const failed = [];
  for (const c of CONTRACTS) {
    const rows = await defRows(c.metricKey);
    if (rows.some((x) => x.state === 'approved' || x.state === 'superseded')) { stood += 1; continue; }
    let row = rows.find((x) => x.state === 'proposed') ?? null;
    if (row === null) {
      const r = await call(`${A}/definitions/propose`, dom(analyst, 'analytics.definition.propose', 'AMD'), { contract: c, ownerPrincipalId: owner.principalId }, analyst.token);
      if (!r.ok) { failed.push(`${c.metricKey} propose: ${refusalLine(r)}`); continue; }
      row = { id: r.body.definition.definition_id, version: r.body.definition.version, digest: r.body.definition.digest }; proposed += 1;
    }
    const d = await call(`${A}/definitions/${row.id}/decide`, dom(owner, 'analytics.definition.decide', 'AMD', row.id), { decision: 'approve', digest: row.digest,
      reason: `the contract of ${c.metricKey} read whole: purpose ${c.purposeKey}, ${c.computationKey ? `computed by ${c.computationKey}` : 'unsupported with its carrier'} (SYNTHETIC demonstration)` }, owner.token);
    if (!d.ok) { failed.push(`${c.metricKey} approve: ${refusalLine(d)}`); continue; }
    approved += 1;
    if (c.metricKey === 'MET-001') {   // the first approval said in full
      expectRefused(`J. Satō (the proposer) re-decides ${c.metricKey} v${row.version}`, await call(`${A}/definitions/${row.id}/decide`, dom(analyst, 'analytics.definition.decide', 'AMD', row.id), { decision: 'approve', digest: row.digest, reason: 'the proposer approving (refused)' }, analyst.token), 403);
    }
  }
  for (const f of failed) bad(f);
  if (proposed + approved > 0) ok(`J. Satō PROPOSED ${proposed} definition(s) through §MD's port; M. Okonkwo APPROVED ${approved} at their digests (the owner bound as each contract's named owner)`);
  if (stood > 0) note(`${stood} definition(s) were approved by an earlier run — they stand`);
  const reg = (await q(`select metric_key, version, state, supported from analytics.metric_definitions where tenant_id = $1 and domain_id = $2 and state = 'approved' order by metric_key`, [T, D]));
  const sup = reg.filter((x) => x.supported).length;
  (CONTRACTS.every((c) => reg.some((x) => x.metric_key === c.metricKey)) ? ok : bad)(`THE CATALOG: ${reg.length} approved definitions (${sup} computed, ${reg.length - sup} unsupported with their carriers) of the ${CONTRACTS.length} contracts (definitionsA ${definitionsA.length}, definitionsB ${definitionsB.length})`);
  const owners = (await q(`select count(distinct owner_principal_id)::int n, min(owner_principal_id::text) o from analytics.metric_definitions where tenant_id = $1 and domain_id = $2 and state = 'approved'`, [T, D]))[0];
  note(`every approved definition names its owner: ${owners.n === 1 ? nm(owners.o) : `${owners.n} owners`} (CAP-DL-11 "Chief Product Officer" → product_analytics_owner)`);
  // the refusal: a definition grouped by a person
  const m22 = CONTRACTS.find((c) => c.metricKey === 'MET-022');
  expectRefused('J. Satō proposes MET-022 grouped by acknowledged_by (a person)', await call(`${A}/definitions/propose`, dom(analyst, 'analytics.definition.propose', 'AMD'),
    { contract: { ...m22, dimensions: ['severity', 'acknowledged_by'] }, ownerPrincipalId: owner.principalId }, analyst.token), 403, /^metric definition rejected \(person\)/);
  const card = await call(`${A}/definitions/MET-024/read`, rd(analyst, 'AMD'), {}, analyst.token);
  const v = (card.body?.versions ?? []).find((x) => x.state === 'approved');
  (card.ok && v ? ok : bad)(`the contract card of MET-024 (definitions/MET-024/read): v${v?.version} ${v?.state} — "${v?.title}", ${v?.kind} in ${v?.unit}, direction ${v?.direction}, band ${JSON.stringify(v?.threshold?.band)}, window ${v?.window_spec?.kind} on the ${v?.window_spec?.clock} clock, floor ${v?.floor_n}, k ${v?.k_min}, purpose ${v?.purpose_key}, owner ${nm(v?.owner_principal_id)}, digest ${String(v?.digest).slice(0, 12)}…`);
}

/* ── B92-6 THE SCENE'S METRICS ───────────────────────────────────────────────────────── */
await renewAll();
console.log(`\nB92-6 THE SCENE'S METRICS — MET-001, MET-022, MET-024 for ${PERIOD} in ${SCOPE_KEY} (and domain-wide); the series; a replay; the refusals`);
/** The FIRST citable result of (metric, period, scope) — of one definition version when named: what an earlier run of this act computed. */
const firstResult = async (key, period, scopeKey, version = null) => (await q(`select r.result_id::text id from analytics.metric_results r where r.tenant_id = $1 and r.domain_id = $2 and r.metric_key = $3 and r.period_key = $4
    and r.scope_key is not distinct from $5 and not r.preview and r.replay_of is null and r.cohort = '{}'::jsonb and ($6::int is null or r.definition_version = $6) order by r.computed_at, r.result_id limit 1`, [T, D, key, period, scopeKey, version]))[0]?.id ?? null;
const readResult = async (s, id) => { const r = await call(`${A}/results/${id}/read`, rd(s, 'AMR', id), { recordsLimit: 5000 }, s.token); return r.ok ? r.body.result : null; };
/** Compute once: the first citable result of (metric, period, scope) — of `version` when named — stands (an earlier run); else the analyst
 *  computes it on the approved definition. A rerun never adds a result (a later version's recompute is its own scene, B92-7). */
async function computeOnce(s, key, period, scopeKey, label, version = null) {
  let id = await firstResult(key, period, scopeKey, version);
  if (id) { const r = await readResult(s, id); note(`${label}: result ${short(id)} (definition v${r?.definition_version}) stands — an earlier run`); return r; }
  const r = await call(`${A}/metrics/compute`, dom(s, 'analytics.metric.compute', 'AMR'), { metricKey: key, period, ...(scopeKey ? { scopeKey } : {}) }, s.token);
  if (!r.ok) { fail(`${label}: the computation`, r); return null; }
  id = r.body.result.result_id;
  ok(`${label}: ${nm(s.principalId)} COMPUTED result ${short(id)} on definition v${r.body.result.definition_version}`);
  return readResult(s, id);
}
const intervalOf = (r) => {
  const u = r?.uncertainty;
  if (!u) return 'no interval (no value)';
  if (u.lo !== undefined && u.hi !== undefined) return `95 % ${r.kind === 'duration' ? 'distribution-free interval of the median' : 'Wilson'} [${num(u.lo)}, ${num(u.hi)}]`;
  return `uncertainty ${JSON.stringify(u).slice(0, 160)}`;
};
function showResult(label, r) {
  if (!r) { bad(`${label}: no result`); return; }
  const byRole = r.records_by_role ?? {};
  const ids = {};
  for (const x of r.records ?? []) { (ids[x.role] ??= []); if (ids[x.role].length < 3) ids[x.role].push(`${x.record_kind}:${short(x.record_id)}`); }
  const value = r.state === 'determinate' ? `${num(r.value, 4)} ${r.unit}` : r.state.toUpperCase();
  console.log(`    ${label} — ${value}; n = ${r.n ?? '—'}${r.kind === 'rate' ? ` (numerator ${r.numerator ?? '—'} / denominator ${r.denominator ?? '—'})` : ''}; window ${iso(r.window_from)} → ${iso(r.window_to)} on the ${r.clock} clock, as of ${iso(r.as_of)}`);
  console.log(`      ${intervalOf(r)}${r.distribution ? `; distribution p50 ${num(r.distribution.p50)} p90 ${num(r.distribution.p90)} (min ${num(r.distribution.min)}, max ${num(r.distribution.max)})` : ''}${r.threshold_eval ? `; threshold ${JSON.stringify(r.threshold_eval.threshold)} breach ${r.threshold_eval.breach}` : ''}`);
  console.log(`      records by role: ${Object.entries(byRole).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} — ${Object.entries(ids).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') || 'no record'}`);
  for (const reason of r.reasons ?? []) console.log(`      reason: ${reason}`);
  if (r.quality && Object.keys(r.quality).length) console.log(`      quality: ${JSON.stringify(r.quality).slice(0, 400)}`);
  console.log(`      definition v${r.definition_version} (digest ${String(r.definition_digest).slice(0, 12)}…), computation ${r.computation_key} v${r.computation_version}, source revision ${String(r.source_revision).slice(0, 12)}…`);
  const honest = (r.state === 'determinate') === (r.value !== null && r.value !== undefined) && (r.state === 'determinate' || (r.reasons ?? []).length > 0);
  (honest ? ok : bad)(`${label}: ${r.state === 'determinate' ? 'a DETERMINATE value with its n and interval' : `${r.state.toUpperCase()} — value withheld, ${(r.reasons ?? []).length} reason(s) stated (never an invented zero)`}`);
}
const RES = {};
{
  for (const key of SCENE) {
    RES[key] = await computeOnce(analyst, key, PERIOD, SCOPE_KEY, `${key} ${PERIOD} ${SCOPE_KEY}`);
    showResult(`${key} ${PERIOD} ${SCOPE_KEY}`, RES[key]);
    RES[`${key}@domain`] = await computeOnce(analyst, key, PERIOD, null, `${key} ${PERIOD} domain-wide`);
    showResult(`${key} ${PERIOD} domain-wide`, RES[`${key}@domain`]);
  }
  ENV_OUT.EYE_B92_MET022_V1_RESULT = RES['MET-022']?.result_id ?? '';
  // MET-001's link vectors, tallied from its own records (what keeps the loop open — traceable per package)
  if (RES['MET-001']) {
    const miss = {}; for (const x of RES['MET-001'].records ?? []) for (const k of x.detail?.missing ?? []) miss[k] = (miss[k] ?? 0) + 1;
    note(`MET-001's records name what keeps each loop open: ${Object.entries(miss).map(([k, n]) => `${k} missing on ${n}`).join(', ') || 'nothing'} of ${(RES['MET-001'].records ?? []).length} committed package(s) — the demonstration's options cite runs, forecasts and assumptions, no evidence or claim object (decision_metrics' with_evidence kinds), so the evidence link is unmet everywhere: a MEASURED state of the records, not an invented zero`);
  }
  // THE SERIES 2025-Q4 … 2026-Q3 (sparse history explicit)
  for (const key of SCENE) {
    const s = await call(`${A}/reviews/series`, rd(analyst, 'AOR'), { metricKey: key, scopeKey: SCOPE_KEY, through: PERIOD, count: 4 }, analyst.token);
    if (!s.ok) { fail(`the series of ${key}`, s); continue; }
    const per = s.body.series.periods ?? [];
    console.log(`    THE SERIES ${key} ${SCOPE_KEY}: ${per.map((p) => `${p.period} ${p.status === 'computed' ? `${p.state}${p.value !== null && p.value !== undefined ? ` ${num(p.value, 4)}` : ''} (v${p.definition_version})` : p.status.toUpperCase()}`).join(' · ')}`);
    console.log(`      history origin: ${s.body.series.history?.origin ? `${iso(s.body.series.history.origin)} (${s.body.series.history.source})` : s.body.series.history?.why}`);
    for (const p of per.filter((x) => x.status !== 'computed')) console.log(`      ${p.period}: ${(p.reasons ?? []).join(' | ')}`);
    const zeros = per.filter((p) => p.status !== 'computed' && p.value !== null && p.value !== undefined);
    (per.length === 4 && zeros.length === 0 && per.every((p) => ['computed', 'not_computed', 'no_history'].includes(p.status)) ? ok : bad)(`the series of ${key} lists EVERY period 2025-Q4…2026-Q3 — ${per.filter((p) => p.status === 'no_history').length} named "no history", ${per.filter((p) => p.status === 'not_computed').length} "not computed", never a zero`);
  }
  // A REPLAY → reproduced
  const target = RES['MET-001'];
  if (target) {
    const prior = (await q(`select result_id::text id, replay_verdict from analytics.metric_results where replay_of = $1 order by computed_at limit 1`, [target.result_id]))[0] ?? null;
    if (prior) (prior.replay_verdict === 'reproduced' ? note : bad)(`the replay of MET-001 ${short(target.result_id)} stands (an earlier run): ${short(prior.id)} ${prior.replay_verdict}`);
    else {
      const r = await call(`${A}/results/${target.result_id}/replay`, dom(analyst, 'analytics.metric.replay', 'AMR', target.result_id), {}, analyst.token);
      if (!r.ok) fail('J. Satō replays the MET-001 result', r);
      else (r.body.replay.replay_verdict === 'reproduced' ? ok : bad)(`J. Satō REPLAYED MET-001 ${short(target.result_id)} at its own as-of ${iso(target.as_of)} → ${String(r.body.replay.replay_verdict).toUpperCase()} (source revision ${String(r.body.replay.source_revision).slice(0, 12)}… = the original's ${String(r.body.replay.original?.source_revision).slice(0, 12)}…; state ${r.body.replay.state})`);
    }
  }
  // THE REFUSAL: a person-grained cohort
  expectRefused('J. Satō computes MET-022 for a cohort of one acknowledger (acknowledged_by)', await call(`${A}/metrics/compute`, dom(analyst, 'analytics.metric.compute', 'AMR'),
    { metricKey: 'MET-022', period: PERIOD, scopeKey: SCOPE_KEY, cohort: { acknowledged_by: chair.principalId } }, analyst.token), 403, /^metric computation rejected \(person\)/);
  // THE OPEN QUARTER: computed and shown partial — never presented as the quarter
  const q4 = await computeOnce(analyst, 'MET-022', OPEN_PERIOD, SCOPE_KEY, `MET-022 ${OPEN_PERIOD} ${SCOPE_KEY} (the open quarter)`);
  if (q4) {
    showResult(`MET-022 ${OPEN_PERIOD} ${SCOPE_KEY}`, q4);
    (q4.state !== 'determinate' && (q4.reasons ?? []).some((x) => /partial period is not presented as the period/.test(x)) ? ok : bad)(`the OPEN quarter ${OPEN_PERIOD} is REFUSED AS PARTIAL: indeterminate — "${(q4.reasons ?? []).find((x) => /partial/.test(x)) ?? '—'}" (any governed record the product makes today lands in ${OPEN_PERIOD} by the record clock)`);
  }
}

/* ── B92-7 THE CORRECTION ────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-7 THE CORRECTION — MET-022 v2 (strict: no raised_at proxy) approved and recomputed beside v1; an exception shown beside a result');
let MET022_V2 = null;
{
  const rows = await defRows('MET-022');
  const v1 = rows.find((x) => x.version === 1);
  let v2 = rows.find((x) => x.version === 2) ?? null;
  const base = CONTRACTS.find((c) => c.metricKey === 'MET-022');
  const strict = { ...base, params: { ...base.params, start: 'receipt' },
    exclusions: [...base.exclusions.filter((e) => !/no declared proxy/.test(e.rule)), { rule: 'no delivery receipt, or acknowledged before it', reason: 'no receipt instant: the latency is undefined — v2 declares NO proxy (raised_at is never a stand-in)' }],
    quality: { ...base.quality, proxy: 'NONE (v2, strict): a warning with no receipt — or acknowledged before it — is excluded with its reason; raised_at never stands in' } };
  if (v2?.state === 'approved') note(`MET-022 v2 APPROVED (effective ${iso(v2.effective_from)}) — stands (an earlier run)`);
  else {
    if (v2 === null) {
      const r = await call(`${A}/definitions/propose`, dom(analyst, 'analytics.definition.propose', 'AMD'), { contract: strict, ownerPrincipalId: owner.principalId }, analyst.token);
      if (!r.ok) fail('J. Satō proposes MET-022 v2', r); else { v2 = { id: r.body.definition.definition_id, version: r.body.definition.version, digest: r.body.definition.digest }; ok(`J. Satō PROPOSED MET-022 v${v2.version} (strict: params.start = receipt) — digest ${v2.digest.slice(0, 12)}…`); }
    }
    if (v2) {
      const d = await call(`${A}/definitions/${v2.id}/decide`, dom(owner, 'analytics.definition.decide', 'AMD', v2.id), { decision: 'approve', digest: v2.digest,
        reason: 'the operating review must not mix raise-time proxies with receipts: v2 measures receipt to acknowledgement only (SYNTHETIC)' }, owner.token);
      if (!d.ok) fail('M. Okonkwo approves MET-022 v2', d); else ok(`M. Okonkwo APPROVED MET-022 v${d.body.definition.version} at its digest — v1 SUPERSEDED (${short(d.body.definition.superseded)})`);
    }
  }
  const after = await defRows('MET-022');
  v2 = after.find((x) => x.version === 2) ?? null; MET022_V2 = v2;
  if (v1 && v2) {
    const diff = await call(`${A}/definitions/diff`, rd(analyst, 'AMD'), { from: v1.id, to: v2.id }, analyst.token);
    const changed = diff.body?.diff?.changed ?? diff.body?.diff ?? [];
    (diff.ok ? ok : bad)(`the field-level diff v1 → v2: ${(Array.isArray(changed) ? changed : []).map((c) => c.field).join(', ') || JSON.stringify(diff.body).slice(0, 200)}`);
  }
  const r2 = await computeOnce(analyst, 'MET-022', PERIOD, SCOPE_KEY, `MET-022 ${PERIOD} ${SCOPE_KEY} on v2`, v2?.version ?? 2);
  const r1 = RES['MET-022'];
  if (r1 && r2) {
    console.log('    BESIDE EACH OTHER:');
    showResult(`MET-022 v${r1.definition_version} (the declared raised_at proxy)`, r1);
    showResult(`MET-022 v${r2.definition_version} (strict, receipt only)`, r2);
    (r1.definition_version !== r2.definition_version && r1.result_id !== r2.result_id ? ok : bad)(`the recompute stands BESIDE the first: v${r1.definition_version} ${r1.state} (n ${r1.n ?? '—'}, ${r1.records_by_role?.excluded ?? 0} excluded) vs v${r2.definition_version} ${r2.state} (n ${r2.n ?? '—'}, ${r2.records_by_role?.excluded ?? 0} excluded) — the v1 result is unchanged and still readable`);
    RES['MET-022'] = r2;
  }
  ENV_OUT.EYE_B92_MET022_V2_RESULT = r2?.result_id ?? '';
  const s = await call(`${A}/reviews/series`, rd(analyst, 'AOR'), { metricKey: 'MET-022', scopeKey: SCOPE_KEY, through: OPEN_PERIOD, count: 5 }, analyst.token);
  if (s.ok) (s.body.series.comparable === false && (s.body.series.definition_versions ?? []).length > 1 ? ok : bad)(`the series of MET-022 through ${OPEN_PERIOD}: ${(s.body.series.periods ?? []).map((p) => `${p.period} ${p.status === 'computed' ? `v${p.definition_version} ${p.state}` : p.status}`).join(' · ')} — versions [${(s.body.series.definition_versions ?? []).join(', ')}], comparable ${s.body.series.comparable}: "${s.body.series.comparability_note ?? ''}"`);
  else fail('the MET-022 series', s);
  // THE EXCEPTION (§I) beside the MET-024 result
  const m24 = RES['MET-024'];
  let ex = (await q(`select exception_id::text id, state, digest, proposed_by::text, decided_by::text, expires_at from analytics.metric_exceptions where tenant_id = $1 and domain_id = $2 and metric_key = 'MET-024' and period_key = $3 and scope_key = $4 order by proposed_at desc limit 1`, [T, D, PERIOD, SCOPE_KEY]))[0] ?? null;
  if (ex?.state === 'approved') note(`the MET-024 threshold exemption ${short(ex.id)} APPROVED by ${nm(ex.decided_by)} — stands (an earlier run)`);
  else {
    if (ex === null || ex.state !== 'proposed') {
      const expiresAt = `${await dayPlus(120)}T00:00:00Z`;
      const r = await call(`${A}/exceptions/propose`, dom(analyst, 'analytics.exception.propose', 'AMD'), { metricKey: 'MET-024', kind: 'threshold_exemption', period: PERIOD, scopeKey: SCOPE_KEY,
        reason: 'PortWatch publishes the chokepoint4 counts two to four weeks late: the corridor forecasts of 2026-Q3 are not yet scored, so a band breach review on this ledger would review a partial record (SYNTHETIC demonstration)', expiresAt }, analyst.token);
      if (!r.ok) fail('J. Satō proposes the exception', r); else { ex = { id: r.body.exception.exception_id, state: r.body.exception.state, digest: r.body.exception.digest }; ok(`J. Satō PROPOSED a threshold EXEMPTION of MET-024 for ${PERIOD} in ${SCOPE_KEY} (expires ${expiresAt}) — digest ${ex.digest.slice(0, 12)}…`); }
    }
    if (ex) {
      expectRefused('J. Satō (the proposer) decides her own exception', await call(`${A}/exceptions/${ex.id}/decide`, dom(analyst, 'analytics.exception.decide', 'AMD', ex.id), { decision: 'approve', digest: ex.digest, reason: 'the proposer deciding (refused)' }, analyst.token), 403);
      const d = await call(`${A}/exceptions/${ex.id}/decide`, dom(owner, 'analytics.exception.decide', 'AMD', ex.id), { decision: 'approve', digest: ex.digest, reason: 'the late publication is the corridor feed\'s known lag, not the forecasts\' miscalibration (SYNTHETIC)' }, owner.token);
      if (!d.ok) fail('M. Okonkwo decides the exception', d); else ok(`M. Okonkwo (owner, not the proposer) APPROVED the exemption ${short(ex.id)} at its digest`);
    }
  }
  if (m24) {
    const again = await readResult(analyst, m24.result_id);
    const exNow = (await call(`${A}/exceptions/list`, rd(analyst, 'AMD'), { metricKey: 'MET-024' }, analyst.token)).body?.exceptions ?? [];
    const e = exNow.find((x) => x.period_key === PERIOD && x.scope_key === SCOPE_KEY);
    (again && again.state === m24.state && again.value === m24.value && again.source_revision === m24.source_revision && e?.state === 'approved' ? ok : bad)(`BESIDE the MET-024 result ${short(m24.result_id)} (${again?.state}, value ${again?.value ?? '—'}, revision ${String(again?.source_revision).slice(0, 12)}…, UNCHANGED): the exemption ${short(e?.exception_id)} ${e?.state} — proposed by ${nm(e?.proposed_by)}, decided by ${nm(e?.decided_by)}: "${String(e?.reason ?? '').slice(0, 140)}"`);
  }
}

/* ── B92-8 THE OPERATING REVIEW ──────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-8 THE OPERATING REVIEW — opened, assembled, held, noted, decided by the chair, closed and signed at the digest');
const REVIEW_METRICS = ['MET-001', 'MET-022', 'MET-024', 'MET-023'];
let REVIEW = null;
{
  const readReview = async (s, id) => { const r = await call(`${A}/reviews/${id}/read`, rd(s, 'AOR', id), {}, s.token); return r.ok ? r.body.review : null; };
  let row = (await q(`select review_id::text id, state from analytics.operating_reviews where tenant_id = $1 and domain_id = $2 and title = $3 order by created_at desc limit 1`, [T, D, REVIEW_TITLE]))[0] ?? null;
  if (row?.state === 'closed') note(`the review "${REVIEW_TITLE}" ${short(row.id)} was CLOSED by its chair — stands (an earlier run)`);
  else {
    if (row === null) {
      const r = await call(`${A}/reviews/open`, dom(analyst, 'analytics.review.open', 'AOR'), { title: REVIEW_TITLE, period: PERIOD, scopeKey: SCOPE_KEY, metricKeys: REVIEW_METRICS, chair: chair.principalId,
        participantRoles: ['executive', 'product_analytics_owner', 'product_analyst', 'privacy_officer', 'risk_owner', 'forecast_owner', 'decision_owner'] }, analyst.token);
      if (!r.ok) { fail('J. Satō opens the review', r); } else { row = { id: r.body.review.review_id, state: r.body.review.state }; ok(`J. Satō OPENED the review ${short(row.id)} "${REVIEW_TITLE}": ${PERIOD}, scope ${SCOPE_KEY}, metrics ${REVIEW_METRICS.join(', ')}, chair S. Okafor (named), participants by ROLE`); }
    }
    if (row && row.state === 'draft') {
      const a = await call(`${A}/reviews/${row.id}/assemble`, dom(analyst, 'analytics.review.assemble', 'AOR', row.id), { pins: {} }, analyst.token);
      if (!a.ok) fail('J. Satō assembles the review', a);
      else ok(`J. Satō ASSEMBLED it (round ${a.body.assembly.assembly}; it computes nothing): ${a.body.assembly.cited} cited; not computed: [${(a.body.assembly.not_computed ?? []).join(', ')}] — ${(a.body.assembly.citations ?? []).map((c) => `${c.metric_key} ${c.status}${c.result_id ? ` ${short(c.result_id)}` : ''}${c.note ? ` ("${c.note}")` : ''}`).join('; ')}`);
      const h = await call(`${A}/reviews/${row.id}/hold`, dom(chair, 'analytics.review.hold', 'AOR', row.id), {}, chair.token);
      if (!h.ok) fail('S. Okafor holds the review', h); else ok('S. Okafor (the chair) HELD the review — its citations frozen for the meeting');
      row.state = 'held';
    }
    if (row && row.state === 'held') {
      const notes = (await q(`select count(*)::int n from analytics.review_notes where review_id = $1`, [row.id]))[0].n;
      if (notes === 0) {
        for (const [s, mk, body] of [[analyst, 'MET-022', 'Two readings beside each other: v1 used the declared raised_at proxy, v2 measures receipt to acknowledgement only. The corridor\'s acknowledged warnings are few; the strict reading is the one cited.'],
          [analyst, 'MET-024', 'No scored live outcome of the chokepoint4 series falls in the quarter: PortWatch lags, the forecasts are not yet scored. The band is not judged on an empty ledger.'],
          [chair, null, 'The quarter is thin on every metric: the review records the honest state and decides the follow-through per metric.']]) {
          const n = await call(`${A}/reviews/${row.id}/notes/add`, dom(s, 'analytics.review.note', 'AOR', row.id), { metricKey: mk, body }, s.token);
          if (!n.ok) fail(`${nm(s.principalId)} notes the review`, n); else ok(`${nm(s.principalId)} NOTED${mk ? ` on ${mk}` : ''}: "${body.slice(0, 90)}…"`);
        }
      } else note(`${notes} note(s) stand — an earlier run`);
      const view = await readReview(chair, row.id);
      const due = await dayPlus(45);
      const FT = {
        'MET-001': (m) => ({ kind: 'action', action: 'Review the corridor\'s committed decision packages with their owners: cite the evidence they rest on, record the outcome assessments and link the lessons, so the loop can close', owner: brandt.principalId, dueOn: due,
          reason: m?.result?.state === 'determinate' ? `MET-001 is ${num(m.result.value, 4)} on n = ${m.result.n}: no committed package of the quarter closes its loop (evidence, outcome or learning missing on its records)` : `MET-001 is ${m?.result?.state ?? 'not computed'}: ${String((m?.result?.reasons ?? [])[0] ?? '').slice(0, 160)}` }),
        'MET-022': (m) => ({ kind: 'no_action', reason: `the strict v2 reading stands; MET-022 is ${m?.result?.state ?? 'not computed'} on the corridor's few acknowledged warnings — nothing to act on beyond measuring next quarter` }),
        'MET-024': (m) => ({ kind: 'action', action: 'Score the corridor\'s chokepoint4 forecasts against the published PortWatch counts as they arrive, so 2026-Q3 calibration can be judged against the band', owner: eriksen.principalId, dueOn: due,
          reason: `MET-024 is ${m?.result?.state ?? 'not computed'}: no scored live outcome in the quarter (the threshold exemption stands for ${PERIOD})` }),
        'MET-023': (m) => ({ kind: 'no_action', reason: `MET-023 was not computed for this review (${m?.citation?.status ?? 'not computed'}); it is computed for the next quarter's review` }),
      };
      for (const mk of REVIEW_METRICS) {
        const has = (await q(`select count(*)::int n from analytics.review_followups where review_id = $1 and metric_key = $2`, [row.id, mk]))[0].n;
        if (has > 0) { note(`the follow-through of ${mk} stands — an earlier run`); continue; }
        const m = (view?.metrics ?? []).find((x) => x.metric_key === mk);
        const f = FT[mk](m);
        const r = await call(`${A}/reviews/${row.id}/decide`, dom(chair, 'analytics.review.decide', 'AOR', row.id), { metricKey: mk, ...f }, chair.token);
        if (!r.ok) fail(`S. Okafor decides the follow-through of ${mk}`, r);
        else ok(`S. Okafor DECIDED ${mk}: ${f.kind === 'action' ? `ACTION "${f.action.slice(0, 80)}…" — owner ${nm(f.owner)}, due ${f.dueOn}${r.body.followthrough.item ? `, routed item ${short(r.body.followthrough.item.item_id)} (${r.body.followthrough.item.state}, [${(r.body.followthrough.item.route_roles ?? []).join(', ')}])` : ''}` : `NO ACTION — "${f.reason.slice(0, 120)}"`}`);
      }
      // refusals: a non-chair close (403), a stale digest (409)
      const v0 = await readReview(chair, row.id);
      expectRefused('M. Okonkwo (owner, not the chair) closes the review', await call(`${A}/reviews/${row.id}/close`, dom(owner, 'analytics.review.close', 'AOR', row.id), { digest: v0.digest_now, statement: 'the owner closing a review she does not chair (refused)' }, owner.token), 403, /^operating review rejected \(authority\)/);
      const late = await call(`${A}/reviews/${row.id}/notes/add`, dom(analyst, 'analytics.review.note', 'AOR', row.id), { metricKey: 'MET-001', body: 'Added after the chair read the review: the packages committed in the quarter are named on the result\'s records.' }, analyst.token);
      if (!late.ok) fail('J. Satō adds a late note', late); else ok('J. Satō NOTED on MET-001 after the chair read the digest (the review changed)');
      expectRefused('S. Okafor closes at the digest she read before the late note (stale)', await call(`${A}/reviews/${row.id}/close`, dom(chair, 'analytics.review.close', 'AOR', row.id), { digest: v0.digest_now, statement: 'closing at the digest read before the late note (refused)' }, chair.token), 409, /^operating review rejected \(stale\)/);
      const v1 = await readReview(chair, row.id);
      const c = await call(`${A}/reviews/${row.id}/close`, dom(chair, 'analytics.review.close', 'AOR', row.id), { digest: v1.digest_now,
        statement: 'The corridor\'s 2026-Q3 metrics are thin and said so; the follow-through is decided per metric (SYNTHETIC demonstration).' }, chair.token);
      if (!c.ok) fail('S. Okafor closes the review', c); else ok(`S. Okafor (the chair) CLOSED and SIGNED the review at digest ${v1.digest_now.slice(0, 12)}… — immutable`);
    }
  }
  row = (await q(`select review_id::text id from analytics.operating_reviews where tenant_id = $1 and domain_id = $2 and title = $3 order by created_at desc limit 1`, [T, D, REVIEW_TITLE]))[0] ?? null;
  if (row) {
    expectRefused('M. Okonkwo (not the chair) closes the closed review', await call(`${A}/reviews/${row.id}/close`, dom(owner, 'analytics.review.close', 'AOR', row.id), { digest: '0'.repeat(64), statement: 'a non-chair close (refused)' }, owner.token), 403, /^operating review rejected \(authority\)/);
    const v = await readReview(chair, row.id); REVIEW = v;
    (v?.state === 'closed' && v?.signature?.verified === true ? ok : bad)(`THE REVIEW READ BACK ${short(v?.review_id)}: ${String(v?.state).toUpperCase()}, chaired by ${v?.chair_name}; signature ${String(v?.signature?.digest).slice(0, 12)}… verified ${v?.signature?.verified} (${v?.signature?.kind}); "${v?.close_statement ?? v?.signature?.statement}"`);
    for (const m of v?.metrics ?? []) {
      const res = m.result ?? null;
      const drill = m.drilldown?.route ?? (res ? `results/${res.result_id}/read` : null);
      console.log(`    ${m.metric_key} ${m.definition?.title ?? ''}: ${m.citation?.status ?? '—'}${res ? ` — ${res.state}${res.value !== null && res.value !== undefined ? ` ${num(res.value, 4)}` : ''}, n ${res.n ?? '—'}, ${(res.reasons ?? []).length} reason(s)` : ` — ${m.citation?.note ?? ''}`}; drill-down ${drill ?? '—'}`);
      if (m.series) console.log(`      series: ${(m.series.periods ?? []).map((p) => `${p.period} ${p.status === 'computed' ? p.state : p.status}`).join(' · ')}`);
    }
    for (const f of v?.followthrough ?? []) console.log(`    follow-through ${f.metric_key ?? 'the review'}: ${f.kind}${f.action ? ` "${String(f.action).slice(0, 80)}" owner ${nm(f.owner_principal_id)} due ${f.due_on}` : ` — ${String(f.reason).slice(0, 100)}`}`);
    const cited = (v?.metrics ?? []).filter((m) => m.citation?.status === 'cited'); const nc = (v?.metrics ?? []).filter((m) => m.citation?.status === 'not_computed');
    (cited.length >= 3 && nc.some((m) => m.metric_key === 'MET-023') ? ok : bad)(`the review cites ${cited.length} result(s) (${cited.map((m) => m.metric_key).join(', ')}) and lists ${nc.map((m) => m.metric_key).join(', ') || 'none'} NOT COMPUTED — never hidden`);
    const one = cited[0];
    if (one) {
      const rid = one.result?.result_id ?? one.citation?.result_id;
      const dd = await readResult(chair, rid);
      (dd ? ok : bad)(`the DRILL-DOWN of ${one.metric_key} (results/${short(rid)}/read): definition v${dd?.definition?.version} "${dd?.definition?.title}" → result ${dd?.state} → ${dd?.records?.length} record(s) (${Object.entries(dd?.records_by_role ?? {}).map(([k, n]) => `${k} ${n}`).join(', ')}); uses ${(dd?.uses ?? []).map((u) => u.used_in_kind).join(', ')}`);
    }
    ENV_OUT.EYE_B92_REVIEW_TITLE = REVIEW_TITLE; ENV_OUT.EYE_B92_REVIEW_ID = row.id;
  } else bad('the review is absent');
}

/* ── B92-9 COMPARABILITY AND COST ────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-9 COMPARABILITY AND COST — a cohort comparison; the cost reconciliation of 2026-Q3');
{
  const prior = (await q(`select comparison_id::text id from analytics.comparisons where tenant_id = $1 and domain_id = $2 and metric_key = 'MET-022' order by run_at desc limit 1`, [T, D]).catch(() => []))[0] ?? null;
  let cmp = null;
  if (prior) { note(`the MET-022 comparison ${short(prior.id)} stands — an earlier run`); cmp = (await call(`${A}/comparisons/${prior.id}/read`, rd(analyst, 'ACM', prior.id), {}, analyst.token)).body?.comparison ?? null; }
  else {
    const r = await call(`${A}/comparisons/run`, dom(analyst, 'analytics.comparison.run', 'ACM'), { metricKey: 'MET-022', a: { period: '2026-Q2' }, b: { period: PERIOD } }, analyst.token);
    if (!r.ok) fail('J. Satō compares two periods of MET-022 (domain-wide)', r); else { cmp = r.body.comparison; ok(`J. Satō RAN the comparison ${short(cmp.comparison_id)}: MET-022 domain-wide, 2026-Q2 vs ${PERIOD}`); }
  }
  if (cmp) {
    const stated = cmp.state === 'determinate' ? `the estimate ${JSON.stringify(cmp.estimate).slice(0, 200)} with its interval ${JSON.stringify(cmp.interval).slice(0, 200)} (${cmp.method}); claim: ${cmp.claim ?? '—'}` : `${String(cmp.state).toUpperCase()} — ${(cmp.reasons ?? []).join(' | ').slice(0, 600)}`;
    ((cmp.state === 'determinate' && cmp.interval) || (cmp.state !== 'determinate' && (cmp.reasons ?? []).length > 0) ? ok : bad)(`THE COMPARISON ${short(cmp.comparison_id)} (${cmp.metric_key}, ${cmp.kind}): ${stated}`);
    if (cmp.comparability) console.log(`      comparability: ${JSON.stringify(cmp.comparability).slice(0, 400)}`);
  }
  for (const period of [PERIOD, OPEN_PERIOD]) {
    const rec0 = (await q(`select reconciliation_id::text id from analytics.reconciliations where tenant_id = $1 and domain_id = $2 and period_key = $3 order by run_at desc limit 1`, [T, D, period]))[0] ?? null;
    let rec = null;
    if (rec0) { note(`the ${period} cost reconciliation ${short(rec0.id)} stands — an earlier run`); rec = ((await call(`${A}/reconciliations/list`, rd(analyst, 'ARC'), {}, analyst.token)).body?.reconciliations ?? []).find((x) => x.reconciliation_id === rec0.id) ?? null; }
    else {
      const r = await call(`${A}/reconciliations/run`, dom(analyst, 'analytics.reconciliation.run', 'ARC'), { period }, analyst.token);
      if (!r.ok) fail(`J. Satō reconciles the analytics cost of ${period}`, r); else { rec = r.body.reconciliation; ok(`J. Satō RAN the cost reconciliation ${short(rec.reconciliation_id)} for ${period}`); }
    }
    if (rec) {
      const said = rec.outcome === 'empty' ? `nothing was metered in ${period} — every computation of this act ran in ${OPEN_PERIOD} by the record clock; an EMPTY reconciliation is said, never a pass`
        : rec.outcome === 'unpriced' ? 'UNPRICED is the honest state: B91 prices no analytics dimension — the analytics cost is metered here (rows read, compute ms) and named unpriced, never silently passed'
        : `${rec.outcome}`;
      (['empty', 'unpriced', 'matched', 'discrepant'].includes(rec.outcome) && (rec.outcome === 'matched' || (rec.reasons ?? []).length > 0) ? ok : bad)(`THE COST RECONCILIATION ${period}: ${String(rec.outcome).toUpperCase()} — counts ${JSON.stringify(rec.counts ?? {})}; totals ${JSON.stringify(rec.totals ?? {}).slice(0, 300)} — ${said}`);
      for (const reason of rec.reasons ?? []) console.log(`      reason: ${reason}`);
    }
  }
}

/* ── B92-10 EXPERIENCE QUALITY ───────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB92-10 EXPERIENCE QUALITY — journeys, event definitions and their privacy review, consent, events, hold/release, a baseline, a finding → an action, an export');
const PURPOSE_UX = 'experience-telemetry';
{
  const J = [
    { key: 'operating-review', title: 'The operating review — open, drill down, close', steps: ['open', 'drill_down', 'done'],
      objective: 'A chair and the analysts reach a metric\'s records from the operating review and close it without losing their place (task success, step latency)' },
    { key: 'experience-page', title: 'The experience-quality page — open and act', steps: ['open', 'act'],
      objective: 'The analytics team reaches the journeys, the definitions and the consent controls and acts on them without an error (task success)' },
  ];
  for (const j of J) {
    const has = (await q(`select journey_id::text id, version from analytics.experience_journeys where tenant_id = $1 and domain_id = $2 and journey_key = $3 and state = 'active'`, [T, D, j.key]))[0] ?? null;
    if (has) { note(`journey ${j.key} v${has.version} is active — stands (an earlier run)`); continue; }
    const r = await call(`${UX}/journeys/declare`, dom(analyst, 'analytics.experience.journey.declare', 'AJN'), { key: j.key, title: j.title, purposeKey: PURPOSE_UX, objective: j.objective, objectiveIds: [], steps: j.steps, floor: 5 }, analyst.token);
    if (!r.ok) fail(`J. Satō declares the journey ${j.key}`, r); else ok(`J. Satō DECLARED the journey ${j.key} (${j.steps.join(' → ')}) under ${PURPOSE_UX}: "${j.objective.slice(0, 90)}…"`);
  }
  const EVENTS = [
    { key: 'operating-review.open', journey: 'operating-review', step: 'open', fields: {} },
    { key: 'operating-review.drill_down', journey: 'operating-review', step: 'drill_down', fields: {} },
    { key: 'operating-review.done', journey: 'operating-review', step: 'done', fields: {} },
    { key: 'experience-page.open', journey: 'experience-page', step: 'open', fields: {} },
    { key: 'experience-page.act', journey: 'experience-page', step: 'act', fields: { tab: { type: 'enum', values: ['journeys', 'definitions', 'experiments', 'findings', 'exports'] } } },
  ];
  const TD = {};
  for (const e of EVENTS) {
    let d = (await q(`select definition_id::text id, version, state, digest, collection from analytics.telemetry_definitions where tenant_id = $1 and domain_id = $2 and event_key = $3 order by version desc limit 1`, [T, D, e.key]))[0] ?? null;
    if (d?.state === 'approved') { note(`event ${e.key} v${d.version} approved (collection ${d.collection}) — stands`); TD[e.key] = d; continue; }
    if (d === null || d.state !== 'proposed') {
      const r = await call(`${UX}/telemetry/define`, dom(analyst, 'analytics.telemetry.define', 'ATD'), { eventKey: e.key, title: `${e.journey} — ${e.step} (outcome and duration only)`, journeyKey: e.journey, stepKey: e.step, fields: e.fields }, analyst.token);
      if (!r.ok) { fail(`J. Satō defines ${e.key}`, r); continue; }
      d = { id: r.body.definition.definition_id, version: r.body.definition.version, digest: r.body.definition.digest };
      ok(`J. Satō DEFINED event ${e.key} v${d.version}: fields ${JSON.stringify(e.fields)} (outcome and duration only — no content, no identifier)`);
    }
    const v = await call(`${UX}/telemetry/${d.id}/review`, dom(privacy, 'analytics.telemetry.review', 'ATD', d.id), { decision: 'approve', digest: d.digest, reason: `the minimisation review: ${Object.keys(e.fields).length ? 'one enumerated field, ' : ''}an outcome and a bounded duration under the 180-day purpose (SYNTHETIC)` }, privacy.token);
    if (!v.ok) fail(`L. Haas reviews ${e.key}`, v); else ok(`L. Haas (privacy officer, not the proposer) APPROVED ${e.key} v${v.body.definition.version} — retention ${v.body.definition.retention_days} days from the purpose`);
    TD[e.key] = (await q(`select definition_id::text id, version, state, digest, collection from analytics.telemetry_definitions where tenant_id = $1 and domain_id = $2 and event_key = $3 and state = 'approved'`, [T, D, e.key]))[0] ?? null;
  }
  // CONSENT: two personas consent themselves; the privacy officer does not
  for (const s of [analyst, owner]) {
    const r = await call(`${UX}/consent/grant`, dom(s, 'analytics.consent.grant', 'ACN'), { purposeKey: PURPOSE_UX }, s.token);
    if (!r.ok) fail(`${nm(s.principalId)} grants consent`, r); else (r.body.consent?.unchanged ? note : ok)(`${nm(s.principalId)} ${r.body.consent?.unchanged ? 'has consented to' : 'GRANTED consent THEMSELVES for'} ${PURPOSE_UX}${r.body.consent?.unchanged ? ' — stands (an earlier run)' : ` (purpose v${r.body.consent?.purpose_version})`}`);
  }
  const selfRead = await call(`${UX}/self/read`, dom(privacy, 'analytics.consent.read', 'ACN'), {}, privacy.token);
  const pu = (selfRead.body?.purposes ?? []).find((x) => x.purpose_key === PURPOSE_UX);
  (selfRead.ok && pu && !pu.consented ? ok : bad)(`L. Haas's own consent state (self/read): ${PURPOSE_UX} — ${pu?.consented ? 'CONSENTED' : 'NOT CONSENTED'} (nobody grants for another)`);
  // EVENTS of the operating-review journey — durations measured from the personas' own reads of the closed review and its drill-down
  const evCount = async () => (await q(`select count(*)::int n from analytics.telemetry_events where tenant_id = $1 and domain_id = $2 and journey_key = 'operating-review'`, [T, D]))[0].n;
  const rec = (s, eventKey, outcome, durationMs) => call(`${UX}/telemetry/record`, dom(s, 'analytics.telemetry.record', 'ATE'), { eventKey, outcome, ...(durationMs === undefined ? {} : { durationMs }), fields: {}, deviceClass: 'desktop', locale: 'de' }, s.token);
  const n0 = await evCount();
  if (n0 > 0) note(`${n0} event(s) of the operating-review journey are collected — stands (an earlier run or the walk)`);
  else if (REVIEW) {
    for (const s of [analyst, owner]) {
      const t0 = Date.now(); await call(`${A}/reviews/${REVIEW.review_id}/read`, rd(s, 'AOR', REVIEW.review_id), {}, s.token); const open = Date.now() - t0;
      const rid = (REVIEW.metrics ?? []).find((m) => m.result?.result_id)?.result?.result_id;
      const t1 = Date.now(); if (rid) await readResult(s, rid); const drill = Date.now() - t1;
      for (const [k, o, ms] of [['operating-review.open', 'success', open], ['operating-review.drill_down', 'success', drill], ['operating-review.done', 'success', open + drill]]) {
        const r = await rec(s, k, o, ms);
        if (!r.ok || r.body.telemetry?.collected !== true) fail(`${nm(s.principalId)} records ${k}`, r);
      }
      ok(`${nm(s.principalId)} (consented) RECORDED the operating-review journey: open ${open} ms, drill_down ${drill} ms, done — COLLECTED under a per-day pseudonym (no principal id stored)`);
    }
  }
  const ncBefore = (await q(`select count(*)::int n from analytics.telemetry_attempts where tenant_id = $1 and domain_id = $2 and disposition = 'not_consented'`, [T, D]))[0].n;
  if (ncBefore > 0) note(`L. Haas's event without consent was NOT COLLECTED and is counted — stands (an earlier run): ${ncBefore} not_consented attempt(s), no event stored for it`);
  else { const nc = await rec(privacy, 'operating-review.open', 'success', 1200);
  (nc.ok && nc.body.telemetry?.collected === false && nc.body.telemetry?.reason === 'not_consented' ? ok : bad)(`L. Haas (no consent) records operating-review.open → ${nc.status} {collected: ${nc.body?.telemetry?.collected}, reason: ${nc.body?.telemetry?.reason}} — NOT COLLECTED, counted, never an error that nags the person${ncBefore !== null ? ` (not_consented attempts ${ncBefore} → ${(await q(`select count(*)::int n from analytics.telemetry_attempts where tenant_id = $1 and domain_id = $2 and disposition = 'not_consented'`, [T, D]))[0].n})` : ''}`); }
  // HOLD → refused; RELEASE → collected again (the recovery)
  const dd = TD['operating-review.drill_down'];
  if (dd) {
    let cur = (await q(`select collection from analytics.telemetry_definitions where definition_id = $1`, [dd.id]))[0].collection;
    const heldBefore = (await q(`select count(*)::int n from analytics.telemetry_attempts where definition_id = $1 and disposition = 'held'`, [dd.id]))[0].n;
    if (cur === 'open' && heldBefore > 0) note(`the hold → refusal → release of operating-review.drill_down stands — an earlier run (${heldBefore} refused attempt(s) while held)`);
    else if (cur === 'open') {
      const h = await call(`${UX}/telemetry/${dd.id}/hold`, dom(privacy, 'analytics.telemetry.hold', 'ATD', dd.id), { reason: 'the privacy review re-checks the drill-down step\'s duration field bounds before more is collected (SYNTHETIC)' }, privacy.token);
      if (!h.ok) fail('L. Haas holds operating-review.drill_down', h); else ok('L. Haas HELD collection of operating-review.drill_down (reason stated)');
      const refused = await rec(analyst, 'operating-review.drill_down', 'success', 800);
      expectRefused('J. Satō records operating-review.drill_down while it is HELD', refused, 409, /^telemetry event rejected \(state\)/);
      const att = (await q(`select count(*)::int n from analytics.telemetry_attempts where definition_id = $1 and disposition = 'held'`, [dd.id]).catch(() => [{ n: '?' }]))[0].n;
      note(`the refused attempt is COUNTED with its shape, never its values (held attempts on the definition: ${att})`);
      const rl = await call(`${UX}/telemetry/${dd.id}/release`, dom(privacy, 'analytics.telemetry.release', 'ATD', dd.id), { reason: 'the bounds are confirmed; collection resumes under the same approved definition (SYNTHETIC)' }, privacy.token);
      if (!rl.ok) fail('L. Haas releases operating-review.drill_down', rl); else ok('L. Haas RELEASED collection of operating-review.drill_down');
      const again = await rec(analyst, 'operating-review.drill_down', 'success', 750);
      (again.ok && again.body.telemetry?.collected === true ? ok : bad)(`THE RECOVERY: J. Satō records operating-review.drill_down after the release → collected ${again.body?.telemetry?.collected}`);
    } else if (cur === 'held') {
      const rl = await call(`${UX}/telemetry/${dd.id}/release`, dom(privacy, 'analytics.telemetry.release', 'ATD', dd.id), { reason: 'the bounds are confirmed; collection resumes under the same approved definition (SYNTHETIC)' }, privacy.token);
      if (!rl.ok) fail('L. Haas releases operating-review.drill_down (left held)', rl); else ok('L. Haas RELEASED operating-review.drill_down (an earlier run left it held)');
    }
    cur = (await q(`select collection from analytics.telemetry_definitions where definition_id = $1`, [dd.id]))[0].collection;
    const held = (await q(`select count(*)::int n from analytics.telemetry_attempts where definition_id = $1 and disposition = 'held'`, [dd.id]).catch(() => [{ n: 0 }]))[0].n;
    (cur === 'open' && held > 0 ? ok : bad)(`operating-review.drill_down collection ${cur.toUpperCase()}; ${held} refused attempt(s) while held stand in the ledger`);
  }
  // A BASELINE (the analyst), from the events — honest: two consenting people are below every floor and k
  let bl = (await q(`select baseline_id::text id, state, value, n, reasons, period_key from analytics.experience_baselines where tenant_id = $1 and domain_id = $2 and journey_key = 'operating-review' order by recorded_at desc limit 1`, [T, D]).catch(() => []))[0] ?? null;
  if (bl) note(`the operating-review baseline ${short(bl.id)} (${bl.period_key}) stands — an earlier run`);
  else {
    const r = await call(`${UX}/baselines/record`, dom(analyst, 'analytics.experience.baseline.record', 'ABL'), { journeyKey: 'operating-review', measure: 'task_success_rate', period: `R7@${TODAY}` }, analyst.token);
    if (!r.ok) fail('J. Satō records the baseline', r); else { bl = { id: r.body.baseline.baseline_id, ...r.body.baseline }; ok(`J. Satō RECORDED the baseline ${short(bl.id)}: task_success_rate of operating-review over R7@${TODAY}`); }
  }
  if (bl) {
    const b = (await q(`select state, value, n, reasons, period_key from analytics.experience_baselines where baseline_id = $1`, [bl.id]))[0];
    ((b.state === 'determinate') === (b.value !== null) ? ok : bad)(`THE BASELINE: ${b.state.toUpperCase()}${b.value !== null ? ` ${num(b.value, 4)}` : ''}, n ${b.n ?? '—'} — ${(b.reasons ?? []).join(' | ').slice(0, 400)}`);
  }
  // A FINDING (the analyst) → an ACTION decided by the owner (never automatic)
  let fi = (await q(`select finding_id::text id, state, digest from analytics.experience_findings where tenant_id = $1 and domain_id = $2 and journey_key = 'operating-review' order by proposed_at desc limit 1`, [T, D]).catch(() => []))[0] ?? null;
  if (fi?.state && fi.state !== 'proposed') note(`the finding ${short(fi.id)} is ${fi.state} — stands (an earlier run)`);
  else if (bl) {
    if (fi === null) {
      const r = await call(`${UX}/findings/propose`, dom(analyst, 'analytics.experience.finding.propose', 'AFI'), { originKind: 'baseline', originId: bl.id, journeyKey: 'operating-review',
        statement: 'The operating-review journey cannot be measured yet: two consenting people are below the floor and below k = 5 — no quality judgement is possible from them.', evidence: { baseline_id: bl.id } }, analyst.token);
      if (!r.ok) fail('J. Satō proposes the finding', r); else { fi = { id: r.body.finding.finding_id, digest: r.body.finding.digest, state: r.body.finding.state }; ok(`J. Satō PROPOSED the finding ${short(fi.id)} from the baseline`); }
    }
    if (fi) {
      const pv = await call(`${UX}/findings/${fi.id}/preview`, rd(owner, 'AFI', fi.id), { kind: 'research_request', targetId: null }, owner.token);
      if (!pv.ok) fail('M. Okonkwo previews the action', pv);
      else {
        note(`the consequence preview (research_request): ${(pv.body.preview.effects ?? []).join(' | ')} — automatic ${pv.body.preview.automatic}`);
        expectRefused('J. Satō (the proposer) decides the action on her own finding', await call(`${UX}/findings/${fi.id}/decide`, dom(analyst, 'analytics.experience.action.decide', 'AAC', fi.id), { decision: 'act', kind: 'research_request', reason: 'the proposer deciding (refused)', findingDigest: fi.digest, previewDigest: pv.body.preview.preview_digest }, analyst.token), 403);
        const d = await call(`${UX}/findings/${fi.id}/decide`, dom(owner, 'analytics.experience.action.decide', 'AAC', fi.id), { decision: 'act', kind: 'research_request',
          reason: 'recruit consenting participants for the operating-review journey before any design change is judged (SYNTHETIC)', findingDigest: fi.digest, previewDigest: pv.body.preview.preview_digest }, owner.token);
        if (!d.ok) fail('M. Okonkwo decides the action', d); else ok(`M. Okonkwo DECIDED the action: ${d.body.action.decision} — ${d.body.action.kind}, at the finding's and the preview's digests (never automatic)`);
      }
    }
  }
  // THE EXPORT (the owner): aggregates only, digested
  const EXPORT_TITLE = 'NORDWERK experience quality — 2026-10 (SYNTHETIC)';
  let xp = (await q(`select export_id::text id, digest, canonical_bytes from analytics.exports where tenant_id = $1 and domain_id = $2 and title = $3 order by created_at desc limit 1`, [T, D, EXPORT_TITLE]).catch(() => []))[0] ?? null;
  if (xp) note(`the export ${short(xp.id)} stands — an earlier run`);
  else {
    const r = await call(`${UX}/exports/create`, dom(owner, 'analytics.export.create', 'AXP'), { title: EXPORT_TITLE }, owner.token);
    if (!r.ok) fail('M. Okonkwo creates the export', r); else { xp = { id: r.body.export.export_id, digest: r.body.export.digest, canonical_bytes: r.body.export.canonical_bytes }; ok(`M. Okonkwo CREATED the export ${short(xp.id)}: ${xp.canonical_bytes} canonical bytes, digest ${xp.digest.slice(0, 12)}…`); }
  }
  if (xp) {
    const dl = await call(`${UX}/exports/${xp.id}/download`, rd(owner, 'AXP', xp.id), {}, owner.token);
    const text = String(dl.body?.export?.canonical ?? '');
    let pkg = {}; try { pkg = JSON.parse(text); } catch { pkg = {}; }
    const raw = /"pseudonym"|"event_day"|"principal_id"|"event_id"/.test(text);
    (dl.ok && dl.body.export.verified === true && !raw && text.length > 0 ? ok : bad)(`the export downloaded, its digest RE-VERIFIED ${dl.body?.export?.verified} (${dl.body?.export?.canonical_bytes} bytes, ${String(dl.body?.export?.digest).slice(0, 12)}…) — sections ${Object.keys(pkg).join(', ') || '—'}; aggregates only (no pseudonym, no raw event, no principal id: ${!raw})`);
  }
  const ws = await call(`${UX}/workspace`, rd(owner, 'AJN'), {}, owner.token);
  const jr = (ws.body?.journeys ?? []).find((j) => j.journey?.journey_key === 'operating-review');
  (ws.ok && jr && (jr.metrics ?? []).length > 0 && (jr.findings ?? []).length > 0 ? ok : bad)(`the four-part anatomy of operating-review (workspace): objective "${String(jr?.objective?.statement ?? '').slice(0, 70)}…" → ${(jr?.metrics ?? []).length} metric(s) with lineage → ${(jr?.segments ?? []).length} segment baseline(s) → ${(jr?.findings ?? []).length} finding(s) with ${(jr?.findings ?? []).filter((f) => f.action).length} decided action(s); consent counts ${JSON.stringify(ws.body?.consent_counts ?? {}).slice(0, 160)}`);
}

/* ── B92-11 THE STATE, THE ENV LINES, THE LIMITS ─────────────────────────────────────── */
await renewAll();
console.log('\nB92-11 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from analytics.purposes where tenant_id = $1)::int purposes, (select count(*) from analytics.scopes where tenant_id = $1)::int scopes,
     (select count(*) from analytics.metric_definitions where tenant_id = $1)::int definitions, (select count(*) from analytics.metric_results where tenant_id = $1)::int results,
     (select count(*) from analytics.metric_uses where tenant_id = $1)::int uses, (select count(*) from analytics.operating_reviews where tenant_id = $1)::int reviews,
     (select count(*) from analytics.telemetry_definitions where tenant_id = $1)::int telemetry_definitions, (select count(*) from analytics.telemetry_events where tenant_id = $1)::int events,
     (select count(*) from analytics.consents where tenant_id = $1)::int consents`, [T]))[0];
  note(`in the ledgers: ${n.purposes} purpose version(s), ${n.scopes} scope version(s), ${n.definitions} definition version(s), ${n.results} result(s), ${n.uses} use(s), ${n.reviews} operating review(s); ${n.telemetry_definitions} telemetry definition version(s), ${n.events} pseudonymous event(s), ${n.consents} consent record(s)`);
  console.log('  the env lines for the walk (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/[\s()|]/.test(String(v)) ? `'${v}'` : v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) SOFTWARE CAPABILITY — what RAN on this deployment through its governed routes: the licence gate on analytics.* and the vendor\'s reissue; the purpose register with the privacy officer\'s digest-bound approvals and the person-purpose refusal; the corridor scope; the whole catalog of App M / V1 / ES contracts proposed by a named analyst and approved by a named owner (the supported ones computed by their registered SQL computations, the unsupported ones served unsupported with their carriers); the computations of MET-001, MET-022 and MET-024 with their records, reasons, uncertainty and replay; the person-grained cohort refused; the version-2 correction and the non-comparable series; the threshold exemption beside an unchanged result; the operating review from opening to the chair\'s digest-bound close; the comparison and the cost reconciliation; the experience workflow from consent to export. (2) SYNTHETIC DEMONSTRATION — every NORDWERK figure is SYNTHETIC: the personas M. Okonkwo, L. Haas and J. Satō (created by the tenant administrator for this act), the chair\'s statement, the notes and the follow-through, the purposes\' texts, the exception\'s reason, the experience events (two consenting personas\' own reads of the review), the export. The decision packages, warnings and forecasts the metrics count are the demonstration\'s own records; the PortWatch chokepoint4 counts are the only REAL collected public observations in the corridor scope. The scene\'s metrics are THIN on this demonstration and are said so — nothing was planted to move them; whatever governed record the product makes today lands in 2026-Q4 by the record clock (the open quarter, shown partial). (3) EXTERNAL ACCEPTANCE — never closed by a substitute: the SIGNED acceptance records of the metric catalog and the experience workflow (AT-70, UX-70-006: product owner, independent assurance, customer authority) → R2; accessibility conformance (MET-034) → B107/H3; deployment parity (MET-035) → B106; customer time to operation (MET-039) and customer onboarding → B94. B91 prices no analytics dimension: the analytics cost is metered by B92 and reconciled UNPRICED, never silently passed. HARNESS-PROVEN ONLY (not staged here): the experiments (two approvals, SRM invalidation, conclusion — phase6-experience-b92 UX6), the purge (UX8), the standing evaluation\'s stale / biased / gamed / outcome-detached checks and the fault exercise (phase6-comparability-b92 CO1, CO6), the B90 semantic objects (CO3), DP-44-005\'s serving uses (phase6-definitions-b92 MD5), the uses refused for a preview and an unqualified indeterminate citation in a briefing (MD4).');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
