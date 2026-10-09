#!/usr/bin/env node
/**
 * CP-6 batch B33 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): SUPPLY-CHAIN
 * INTELLIGENCE, THE DOMAIN-PACKAGE FRAMEWORK, COMPETITOR INTELLIGENCE AND THE TWIN PIECES (migration 0111; F-P4-14, F-P4-15 and F-P5-03
 * complete, F-P5-02 and F-P5-04 advance) — exercised by the personas through the REAL HTTP path, each scene stating the effect it produced
 * in the ledgers. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and says
 * "stands — an earlier run" instead of writing it twice. No clock is moved; nothing is planted: every row is a persona's governed act, an
 * agent's run, the real public collection's, or the schedule's (the attention agent's tick, every 60 s on the demonstration — its after-tick
 * hooks twin-supply-scan, domain-competitor-scan and domain-package-health run there; the act WAITS for the ticks, it never drives one).
 *
 *   B33-0 THE STATE: 0111 applied; the casting read from identity.role_bindings; the attention agent and its cadence; the inputs (the corridor
 *         twin and its open 78.074 % estimate, the supply-network twin, the Regensburg line's process twin, NORDWERK's licence).
 *   B33-P THE PRE-STEPS:
 *         P1 THE LICENCE — a domain.* write REFUSED EYE-ENT-001 (NORDWERK's licence v2 lacks domain_package); T. Richter's attempt to reissue
 *            the licence REFUSED (vendor scope); C. Marchetti (commercial authority, PLATFORM) reissues licence v3 = v2's capabilities +
 *            domain_package through the B91 vendor routes (the package and the SKU re-declared, then the issue).
 *         P2 THE ROUTING — T. Richter publishes attention policy v11 (every existing class byte-identical): domain.alert → strategy_owner;
 *            supply.dependency → domain_analyst; supply.disruption → risk_owner, twin_owner; domain.package → domain_specialist, domain_admin;
 *            twin.reconciliation and twin.envelope → twin_owner (so §TW's items are ROUTED, not deprioritized).
 *         P3 THE PERSONAS (SYNTHETIC) — N. Vogel (tenant administrator) provisions D. Ivanova (geopolitical domain specialist) and P. Lindgren
 *            (competitive-intelligence specialist) through the governed principal route, each bound domain_specialist in the corridor domain.
 *         P4 THE AGENTS — the Supply Chain Agent registered with the B29 digest is DRIFTED by B33's scan: its manual trigger REFUSED once
 *            (supply scan refused (drift), escalated); N. Vogel registers it anew (same version, this runtime's digest) and revokes the drifted
 *            registration; the Domain Intelligence Agent registered (kind domain_intelligence, task domain_scan).
 *   §TW  THE TWIN PIECES (the corridor twin): ...
 *   §SC  F-P4-14 (verbatim): "a tier-2 bearing supplier in Shenzhen is inferred behind a tier-1 vendor; the analyst validates it and the
 *        corridor disruption is mapped to the Regensburg line with two alternatives": ...
 *   §CI  F-P4-15 (verbatim): "a competitor gear-motor maker opens a Moroccan plant; the competitor profile updates and an alert reaches the
 *        strategy lead": ...
 *   §PK  F-P4-15 (the tracker's second scene): the geopolitical "Red Sea security situation" indicator set certified: ...
 *   B33-9 THE STATE, the env lines for the four walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC unless it is a real collected public observation (the IMF PortWatch transit counts, the EU sanctions listings,
 * the GDELT discovery feed — the publishers'). Nothing prints a credential: the personas' passwords are EYE_TEST_ADMIN_PASSWORD from the
 * environment, as every other persona's.
 */
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, digest, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

// The act may live in a worktree without .eye-local: the RUNTIME root is the tree it runs from (the main tree), the code's own root otherwise.
const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
// the built API this act's code belongs to (the agents' identities are this runtime's scans): the act's own tree first
const requireBuilt = createRequire(join(existsSync(join(SELF_ROOT, 'apps', 'api', 'dist')) ? SELF_ROOT : ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const P = `${X}/prediction`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive/attention`;
const W = `${X}/twins`; const S = `${X}/simulations`; const BR = `${X}/twin-branches`; const ES = `${X}/twin-estimation`; const EN = `${X}/twin-envelope`;
const SC = `${X}/twin-supply`; const PK = `${X}/domain-packages`; const CI = `${X}/domain-competitors`; const I = `${X}/intelligence`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 400)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t;
const dbDay = async (minus = 0) => (await q(`select to_char((clock_timestamp() at time zone 'UTC')::date - $1::int, 'YYYY-MM-DD') d`, [minus]))[0].d;
const dayOf = (v) => { if (v === null || v === undefined) return null; if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`; return String(v).slice(0, 10); };
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const f3 = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(3).replace(/\.?0+$/, ''));
const tStart = Date.now();
const mins = (t0) => `${((Date.now() - t0) / 60000).toFixed(1)} min`;
console.log(`THE B33 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
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
/** The governed envelope of governed.mjs call(), sent WITHOUT a client timeout: a route that reads a PortWatch series runs for minutes. */
function callLong(path, over, payload = {}, token = null) {
  const envelope = { message_id: randomUUID(), scope: over.scope, tenant_id: over.tenantId ?? null, domain_id: over.domainId ?? null, principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'observation', action: over.action, side_effect_class: over.sideEffect ?? 'reversible', consequence_class: over.consequence ?? 'C1',
    object_type: over.objectType, object_id: over.objectId ?? null, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: randomUUID(), trace_id: over.trace ?? 'phase6-b33', payload_digest: digest(payload) };
  const body = JSON.stringify({ envelope, payload });
  const u = new URL(API + path);
  return new Promise((resolve) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let data = ''; res.setEncoding('utf8'); res.on('data', (c) => { data += c; });
      res.on('end', () => { let b = {}; try { b = JSON.parse(data); } catch { b = { raw: data.slice(0, 300) }; } resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: b, correlationId: envelope.correlation_id }); });
    });
    // a transport error is an answer (status 0), not a crash — the act is rerun-safe: whatever the server completed is found on the next run
    req.on('socket', (sock) => sock.setKeepAlive(true, 30_000));
    req.setTimeout(0); req.on('error', (e) => resolve({ ok: false, status: 0, body: { code: e.code ?? 'TRANSPORT', message: `the connection failed before an answer: ${e.message}` } })); req.end(body);
  });
}
const ENV_OUT = {};
const dom = (s, purpose, over) => as(s, scope, { purposeId: purpose, consequence: 'C2', ...over });
const plat = (s, over) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'commercial', consequence: 'C2', ...over });
const READ = { sideEffect: 'none' };

/* ── B33-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB33-0 THE STATE — 0111, the casting, the attention agent, the inputs');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0111%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0111 is not applied'); process.exit(1); }
}
const CAST = { 't.nakamura': ['twin_owner'], 'e.kovacs': ['twin_owner'], 'a.hoffmann': ['domain_analyst'], 'h.weber': ['domain_analyst'], 'c.brenner': ['risk_owner'],
  'j.weber': ['strategy_owner'], 'a.novak': ['strategy_owner'], 't.richter': ['domain_admin'], 'm.dvorak': ['collection_manager', 'executive'], 'o.steiner': ['ontology_steward'],
  'h.petrovic': ['method_steward'], 's.larsen': ['resolution_manager'], 'l.ferreira': ['extraction_manager'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')} — no role is granted`); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                                                    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
                                                      and (b.scope = 'PLATFORM' or b.tenant_id = $4)`, [login_, role, sc, T]))[0].n > 0;
for (const [l, role, sc] of [['n.vogel', 'tenant_admin', 'TENANT'], ['c.marchetti', 'commercial_authority', 'PLATFORM']]) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc} (act-b91 created it)`); else { bad(`${l} does not hold ${role} at the ${sc} — act-b91 creates it first`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l, at: Date.now() }; };
/** A session lives 15 minutes and some reads take minutes: each persona's session is renewed (a fresh login) at each scene and before a long
 *  call — the persona object keeps its identity, its token is replaced. */
const renew = async (s) => { const n = await login(s.login, PW); if (n === null) { bad(`${s.login} could not authenticate again`); return s; } Object.assign(s, n, { at: Date.now() }); return s; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) await renew(s); };
const nakamura = await persona('t.nakamura'); const kovacs = await persona('e.kovacs'); const hoffmann = await persona('a.hoffmann'); const hweber = await persona('h.weber');
const brenner = await persona('c.brenner'); const weber = await persona('j.weber'); const novak = await persona('a.novak'); const richter = await persona('t.richter');
const dvorak = await persona('m.dvorak'); const steiner = await persona('o.steiner'); const petrovic = await persona('h.petrovic'); const larsen = await persona('s.larsen');
const ferreira = await persona('l.ferreira'); const vogel = await persona('n.vogel'); const vendor = await persona('c.marchetti');
const NAME = { [nakamura.principalId]: 'T. Nakamura', [kovacs.principalId]: 'E. Kovács', [hoffmann.principalId]: 'A. Hoffmann', [hweber.principalId]: 'H. Weber', [brenner.principalId]: 'C. Brenner',
  [weber.principalId]: 'J. Weber', [novak.principalId]: 'A. Novák', [richter.principalId]: 'T. Richter', [dvorak.principalId]: 'M. Dvořák', [steiner.principalId]: 'O. Steiner',
  [petrovic.principalId]: 'H. Petrović', [larsen.principalId]: 'S. Larsen', [ferreira.principalId]: 'L. Ferreira', [vogel.principalId]: 'N. Vogel', [vendor.principalId]: 'C. Marchetti',
  [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const longAs = async (s, path, over, payload) => { await renew(s); return callLong(path, over, payload, s.token); };
// THE ATTENTION AGENT: the tick's host — its after-tick hooks run the supply scan, the domain scan and the package health; the act waits for its ticks
const ATT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (ATT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
NAME[ATT.principal_id] = 'the attention agent';
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [ATT.agent_id]))[0];
  (last.n > 0 ? ok : bad)(`the attention agent ${short(ATT.agent_id)} — cadence ${ATT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${iso(last.t)})` : ''} — the act waits for its ticks, it calls no tick route`);
}
// THE INPUTS
const twinOf = async (title) => (await q(`select t.twin_id::text id, t.title, t.kind, t.owner_principal_id::text owner,
     (select max(v.version) from twin.twin_versions v where v.twin_id = t.twin_id and v.branch_id = 'actual' and v.state = 'admitted')::int head
   from twin.twins_current t where t.tenant_id = $1 and t.domain_id = $2 and t.title = $3 limit 1`, [T, D, title]))[0] ?? null;
const CORRIDOR_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const NETWORK_TITLE = 'Hub-module supply network — NORDWERK Regensburg (3 tiers)';
const LINE_TITLE = 'Regensburg plant — assembly line (process twin)';
const CORRIDOR = await twinOf(CORRIDOR_TITLE); const NETWORK = await twinOf(NETWORK_TITLE); const LINE = await twinOf(LINE_TITLE);
for (const [label, t, owner] of [['the corridor twin', CORRIDOR, nakamura], ['the supply network', NETWORK, nakamura], ['the Regensburg line', LINE, kovacs]]) {
  if (t === null) { bad(`${label} is absent`); process.exit(1); }
  (t.owner === owner.principalId ? ok : bad)(`${label} ${short(t.id)} "${t.title}" (${t.kind}) — owner ${nm(t.owner)}, actual head v${t.head}`);
}
const KEY = 'corridor.capacity_share';
const OPEN78 = (await q(`select estimate_id::text id, state, proposed_value::float8 v, proposer_kind, proposed_at, attention_item_id::text item from twin.estimates
                          where twin_id = $1 and key = $2 and round(proposed_value::numeric, 3) = 78.074 order by proposed_at limit 1`, [CORRIDOR.id, KEY]))[0] ?? null;
note(`the corridor's ${KEY} estimate of 78.074 %: ${OPEN78 ? `${short(OPEN78.id)} ${OPEN78.state.toUpperCase()} (proposed ${iso(OPEN78.proposed_at)} by the ${OPEN78.proposer_kind}${OPEN78.item ? `, item ${short(OPEN78.item)}` : ''})` : 'ABSENT on this database'}`);
const liveLicence = async () => (await q(`select licence_id::text, version, package_key, state, capabilities, issued_at from commercial.licences where tenant_id = $1 and state <> 'superseded' order by issued_at desc, version desc limit 1`, [T]))[0] ?? null;
{
  const l = await liveLicence();
  note(`NORDWERK's live licence: ${l ? `v${l.version} ${l.package_key} (${l.state}) — ${l.capabilities.includes('domain_package') ? 'CARRIES' : 'lacks'} domain_package` : 'NONE (uncontracted)'}; the catalogue: ${(await q(`select capability_key || ' v' || version || ' ' || array_to_string(action_prefixes, ',') c from commercial.capabilities where capability_key = 'domain_package' and status = 'active'`)).map((x) => x.c).join('; ')}`);
}

/* ── B33-P THE PRE-STEPS ─────────────────────────────────────────────────────────────── */
console.log('\nB33-P1 THE LICENCE — a domain.* write refused EYE-ENT-001; the domain administrator cannot reissue a licence; C. Marchetti reissues v3 (+ domain_package)');
const GEO_KEY = 'geopolitical-red-sea';
const GEO_TITLE = 'Geopolitical intelligence — Red Sea security situation';
{
  let live = await liveLicence();
  if (live?.capabilities.includes('domain_package')) {
    const den = (await q(`select created_at, reason from policy.policy_decisions where tenant_id = $1 and action = 'domain.package.declare' and decision = 'deny' order by created_at limit 1`, [T]))[0] ?? null;
    note(`licence v${live.version} (${live.package_key}) carries domain_package — an earlier run${den ? `; the refusal it answered stands in the policy ledger (${iso(den.created_at)}: "${String(den.reason).slice(0, 160)}")` : ''}`);
  } else {
    // 1. the refusal, explained: J. Weber declares the geopolitical package while the licence lacks domain_package
    const r = await call(`${PK}/declare`, dom(weber, 'intelligence', { action: 'domain.package.declare', objectType: 'DPG' }), { key: GEO_KEY, kind: 'geopolitical', title: GEO_TITLE, owner: weber.principalId }, weber.token);
    expectRefused(`J. Weber declares the package ${GEO_KEY} under licence v${live?.version} (no domain_package)`, r, 403, /^capability unavailable \(entitlement\): domain_package is not licensed for this tenant/, 'EYE-ENT-001');
    // 2. the domain administrator cannot reissue a licence (the vendor's act, PLATFORM-scoped)
    const rr = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(richter, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: 'EYE-FULL-12M', orderRef: 'SYNTH-ORDER-NORDWERK-B33-BY-RICHTER', reason: 'the domain administrator tries to add the domain package himself (SYNTHETIC)' }, richter.token);
    expectRefused('T. Richter (domain administrator) reissues the licence', rr, 403);
    // 3. the vendor: the full-platform package v(n+1) = its capabilities + domain_package; the SKU re-declared on it; the licence issued
    const pk = (await q(`select version, capabilities, tier from commercial.packages where package_key = 'full-platform' and status <> 'superseded' order by version desc limit 1`))[0] ?? null;
    if (pk === null) bad('the full-platform package is absent (act-b91 --restore declares it)');
    else {
      let pkv = pk.version;
      if (!pk.capabilities.includes('domain_package')) {
        const r1 = await call('/v1/commercial/packages/declare', plat(vendor, { action: 'commercial.offer.package', objectType: 'PKG' }), { key: 'full-platform', expectedVersion: pk.version, title: 'The full platform (SYNTHETIC)',
          capabilities: [...pk.capabilities, 'domain_package'], limits: {}, tier: pk.tier, reason: 'B33: the in-tenant certified domain-package framework is built — the full platform now includes domain_package (SYNTHETIC)' }, vendor.token);
        if (!r1.ok) fail('C. Marchetti re-declares the full-platform package', r1); else { pkv = r1.body.package.version; ok(`C. Marchetti DECLARED the package full-platform v${pkv}: ${r1.body.package.capabilities.join(', ')} (SYNTHETIC)`); }
      } else note(`the package full-platform v${pk.version} already includes domain_package — an earlier run`);
      const sku = (await q(`select version, package_version from commercial.skus where sku_code = 'EYE-FULL-12M' and status <> 'superseded' order by version desc limit 1`))[0] ?? null;
      if (sku && sku.package_version === pkv) note(`the SKU EYE-FULL-12M v${sku.version} is on full-platform v${pkv} — an earlier run`);
      else {
        const r2 = await call('/v1/commercial/skus/declare', plat(vendor, { action: 'commercial.offer.sku', objectType: 'SKU' }), { code: 'EYE-FULL-12M', expectedVersion: sku?.version ?? 0, title: 'The full platform — 12 months (SYNTHETIC)', packageKey: 'full-platform', termMonths: 12,
          reason: 'the full platform with the domain package on a twelve-month term (SYNTHETIC)' }, vendor.token);
        if (!r2.ok) fail('C. Marchetti re-declares the SKU EYE-FULL-12M', r2); else ok(`C. Marchetti DECLARED the SKU ${r2.body.sku.sku_code} v${r2.body.sku.version}: ${r2.body.sku.package_key} v${r2.body.sku.package_version}, ${r2.body.sku.term_months} months`);
      }
      const r3 = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(vendor, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: 'EYE-FULL-12M',
        orderRef: 'SYNTH-ORDER-NORDWERK-B33-DOMAIN', reason: 'B33: NORDWERK licensed for the domain packages — v2\'s capabilities and domain_package, no term end (SYNTHETIC)' }, vendor.token);
      if (!r3.ok) fail('C. Marchetti reissues the licence', r3);
      else ok(`C. Marchetti ISSUED NORDWERK licence v${r3.body.licence.version}: ${r3.body.licence.package_key} — ${r3.body.licence.capabilities.length} capabilities incl. domain_package; supersedes v${r3.body.licence.provenance?.supersedes} (kept in the history); order ${r3.body.licence.provenance?.order_ref}`);
    }
    live = await liveLicence();
  }
  (live?.capabilities.includes('domain_package') && live.state === 'active' ? ok : bad)(`NORDWERK's licence v${live?.version} (${live?.package_key}, ${live?.state}) carries domain_package: ${(live?.capabilities ?? []).join(', ')}`);
  ENV_OUT.EYE_B33_LICENCE_VERSION = String(live?.version ?? '');
}

await renewAll();
console.log('\nB33-P2 THE ROUTING — T. Richter publishes attention policy v11: the B33 classes routed; every existing class byte-identical');
const ROUTES = { 'domain.alert': ['strategy_owner'], 'supply.dependency': ['domain_analyst'], 'supply.disruption': ['risk_owner', 'twin_owner'], 'domain.package': ['domain_specialist', 'domain_admin'],
  'twin.reconciliation': ['twin_owner'], 'twin.envelope': ['twin_owner'] };
let POLICY_VERSION = null;
{
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const routed = (rules) => Object.entries(ROUTES).every(([c, roles]) => JSON.stringify(rules?.classes?.[c]?.route_roles ?? []) === JSON.stringify(roles));
  if (active === null) bad('no active attention policy on the corridor domain');
  else if (routed(active.rules)) { POLICY_VERSION = active.version; note(`attention policy version ${active.version} routes ${Object.entries(ROUTES).map(([c, r]) => `${c} → [${r.join(', ')}]`).join('; ')} — an earlier run`); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    const already = Object.keys(ROUTES).filter((c) => rules.classes[c] !== undefined);
    for (const [c, roles] of Object.entries(ROUTES)) if (rules.classes[c] === undefined) rules.classes[c] = { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: roles, ack_within_minutes: 1440, notify: 'in_app' };
    const r = await call(`${E}/policy/publish`, dom(richter, 'executive', { action: 'executive.attention.policy.publish', objectType: 'ATP' }), { rules,
      reason: 'B33: domain alerts to the strategy owner; inferred supply dependencies to the analysts; supply disruptions to the risk and twin owners; package governance to the specialists and the administrator; the twin reconciliation and envelope items to the twin owner — every earlier class unchanged (SYNTHETIC)' }, richter.token);
    if (!r.ok) fail('T. Richter publishes the attention policy', r);
    else {
      const pub = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0];
      const kept = Object.keys(active.rules.classes).filter((c) => JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c]));
      const others = Object.keys(active.rules).filter((k) => k !== 'classes').every((k) => JSON.stringify(pub.rules[k]) === JSON.stringify(active.rules[k]));
      (kept.length === Object.keys(active.rules.classes).length && others && routed(pub.rules) && already.length === 0 ? ok : bad)(`T. Richter PUBLISHED attention policy VERSION ${pub.version} (supersedes ${active.version}): ${Object.entries(ROUTES).map(([c, ro]) => `${c} → [${ro.join(', ')}]`).join('; ')}; ${kept.length} of ${Object.keys(active.rules.classes).length} earlier classes byte-identical, the other sections ${others ? 'unchanged' : 'CHANGED'}`);
      POLICY_VERSION = pub.version;
    }
  }
  ENV_OUT.EYE_B33_POLICY_VERSION = String(POLICY_VERSION ?? '');
}

console.log('\nB33-P3 THE PERSONAS (SYNTHETIC) — N. Vogel provisions the two domain specialists through the governed principal route');
const SPECIALISTS = [{ login: 'd.ivanova', name: 'D. Ivanova — geopolitical domain specialist (SYNTHETIC)', short: 'D. Ivanova' },
  { login: 'p.lindgren', name: 'P. Lindgren — competitive-intelligence specialist (SYNTHETIC)', short: 'P. Lindgren' }];
const SPEC = {};
for (const sp of SPECIALISTS) {
  const present = (await q(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id where p.login_name = $1 and b.role_code = 'domain_specialist' and b.revoked_at is null and b.domain_id = $2`, [sp.login, D]))[0].n > 0;
  const r = await createPersona(vogel, T, { displayName: sp.name, loginName: sp.login, password: PW, roleCode: 'domain_specialist', domainId: D });
  if (r.session === null) { bad(`${sp.short} could not be created or opened (${r.status} ${r.message ?? ''})`); continue; }
  const bound = (await q(`select b.scope, b.domain_id::text d, (select display_name from identity.principals where id = b.principal_id) dn from identity.role_bindings b where b.principal_id = $1 and b.role_code = 'domain_specialist' and b.revoked_at is null`, [r.session.principalId]))[0] ?? null;
  if (r.created) ok(`N. Vogel (tenant administrator) CREATED ${sp.short} through the governed principal route — "${bound?.dn}", domain_specialist at the DOMAIN ${bound?.d === D ? '(the corridor domain)' : bound?.d}`);
  else if (present) note(`${sp.short} (domain_specialist, the corridor domain) is present — an earlier run`);
  else bad(`${sp.login} exists but holds no domain_specialist binding in the corridor domain`);
  SPEC[sp.login] = { ...r.session, login: sp.login, at: Date.now() }; PERSONAS.push(SPEC[sp.login]); NAME[r.session.principalId] = sp.short;
}
const ivanova = SPEC['d.ivanova']; const lindgren = SPEC['p.lindgren'];
if (!ivanova || !lindgren) { bad('the two specialists are required by §PK and §CI'); process.exit(1); }
ENV_OUT.EYE_B33_SPECIALIST = 'd.ivanova'; ENV_OUT.EYE_B33_CI_SPECIALIST = 'p.lindgren';

await renewAll();
console.log('\nB33-P4 THE AGENTS — the drifted Supply Chain Agent refused once, registered anew; the Domain Intelligence Agent registered');
const agentsOf = async (kind) => q(`select agent_id::text, principal_id::text, agent_version, code_digest, status, budgets, stop_conditions, created_at from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = $3 order by created_at`, [T, D, kind]);
const SCA_ID = requireBuilt('./dist/executive/agents/supply-chain-agent.js');
const DIA_ID = requireBuilt('./dist/domains/domain-intelligence-agent.js');
const SCA_DIGEST = SCA_ID.SUPPLY_CHAIN_AGENT_DIGEST; const DIA_DIGEST = DIA_ID.DOMAIN_INTELLIGENCE_AGENT_DIGEST;
(SCA_DIGEST === '45166e81a0b722f9a728c91560d07394c63467eec4574b53f6ebdf2bcad9ed4e' ? ok : bad)(`this runtime's Supply Chain Agent: ${SCA_ID.SUPPLY_CHAIN_AGENT_VERSION}, digest ${SCA_DIGEST.slice(0, 12)}… (B33's scan)`);
(DIA_DIGEST === '4cb4aca3bd2b50def4429550afc0d2f132dc7a44a9a76e0bf5ba85c129cc45f3' ? ok : bad)(`this runtime's Domain Intelligence Agent: ${DIA_ID.DOMAIN_INTELLIGENCE_AGENT_VERSION}, digest ${DIA_DIGEST.slice(0, 12)}…`);
const ag = (s) => as(s, scope, { purposeId: 'platform.administration', consequence: 'C2', action: 'agent.register', objectType: 'AGT' });
let SCA = null; let DIA = null;
{
  const all = await agentsOf('supply_chain');
  const current = all.find((a) => a.status === 'active' && a.code_digest === SCA_DIGEST) ?? null;
  const drifted = all.filter((a) => a.status === 'active' && a.code_digest !== SCA_DIGEST);
  const priorRefusal = (await q(`select r.run_id::text, r.outcome, r.refusals, r.started_at from executive.agent_runs r join executive.agents a on a.agent_id = r.agent_id
                                  where a.tenant_id = $1 and a.agent_kind = 'supply_chain' and r.refusals::text like '%supply scan refused (drift)%' order by r.started_at limit 1`, [T]))[0] ?? null;
  if (priorRefusal) note(`the drifted agent's refused scan stands — an earlier run (run ${short(priorRefusal.run_id)} ${priorRefusal.outcome}, ${iso(priorRefusal.started_at)}): "${String(priorRefusal.refusals?.[0]?.reason ?? '').slice(0, 200)}"`);
  else if (drifted.length > 0) {
    const old = drifted[drifted.length - 1];
    const r = await call(`${X}/agents/decision/${old.agent_id}/run`, dom(richter, 'twin', { action: 'agent.trigger', objectType: 'AGT', objectId: old.agent_id }), { task: 'supply_scan' }, richter.token);
    const run = r.body?.run ?? {};
    const reason = String((run.refusals ?? [])[0]?.reason ?? run.outputs?.reason ?? r.body?.message ?? '');
    (/^supply scan refused \(drift\): the agent is registered as 1\.0\.0 with code digest 06da2e9120cb…/.test(reason) ? ok : bad)(`T. Richter TRIGGERED the drifted Supply Chain Agent ${short(old.agent_id)} (digest ${old.code_digest.slice(0, 12)}…): ${r.status} — run ${short(run.runId ?? run.run_id)} ${run.outcome ?? '—'}${run.escalated ?? run.escalation ? ', ESCALATED' : ''}: "${reason.slice(0, 260)}"`);
    const esc = (await q(`select outcome, escalated_to::text esc from executive.agent_runs where run_id = $1`, [run.runId ?? run.run_id ?? '00000000-0000-0000-0000-000000000000']).catch(() => []))[0] ?? null;
    if (esc) note(`the run's record: outcome ${esc.outcome}, escalated to ${nm(esc.esc)}`);
  } else note('no drifted Supply Chain Agent is active — nothing to refuse');
  if (current) { SCA = current; note(`the Supply Chain Agent ${short(current.agent_id)} is registered with this runtime's digest — an earlier run (max_reads ${current.budgets?.max_reads}, ${JSON.stringify(current.stop_conditions)})`); }
  else {
    const r = await call(`${X}/agents/decision/register`, ag(vogel), { kind: 'supply_chain', version: SCA_ID.SUPPLY_CHAIN_AGENT_VERSION, codeDigest: SCA_DIGEST,
      ownerPrincipalId: nakamura.principalId, escalationPrincipalId: richter.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 300_000 }, stopConditions: [{ kind: 'max_items', value: 10 }] }, vogel.token);
    if (!r.ok) fail('N. Vogel registers the Supply Chain Agent anew', r);
    else { ok(`N. Vogel REGISTERED the Supply Chain Agent anew ${short(r.body.agent.agentId)} — the SAME version ${SCA_ID.SUPPLY_CHAIN_AGENT_VERSION} with this runtime's digest ${SCA_DIGEST.slice(0, 12)}… (accepted: a new registration, not an edit); accountable T. Nakamura, escalation T. Richter; max_reads 50, max_items 10`); }
    SCA = (await agentsOf('supply_chain')).find((a) => a.status === 'active' && a.code_digest === SCA_DIGEST) ?? null;
  }
  for (const old of (await agentsOf('supply_chain')).filter((a) => a.status === 'active' && a.code_digest !== SCA_DIGEST)) {
    const r = await call(`${X}/agents/decision/${old.agent_id}/revoke`, as(vogel, scope, { purposeId: 'platform.administration', consequence: 'C2', action: 'agent.revoke', objectType: 'AGT', objectId: old.agent_id }),
      { reason: 'B33: superseded by the registration of this runtime\'s scan digest (the B29 digest is drifted)' }, vogel.token);
    if (r.ok) ok(`N. Vogel REVOKED the drifted registration ${short(old.agent_id)} (digest ${old.code_digest.slice(0, 12)}…) — superseded by ${short(SCA?.agent_id)}`); else fail('N. Vogel revokes the drifted registration', r);
  }
  if (SCA) NAME[SCA.principal_id] = 'the Supply Chain Agent';
}
{
  const cur = (await agentsOf('domain_intelligence')).find((a) => a.status === 'active') ?? null;
  if (cur && cur.code_digest === DIA_DIGEST) { DIA = cur; note(`the Domain Intelligence Agent ${short(cur.agent_id)} is registered — an earlier run (${cur.agent_version}, digest ${cur.code_digest.slice(0, 12)}…)`); }
  else {
    const r = await call(`${X}/agents/decision/register`, ag(vogel), { kind: 'domain_intelligence', version: DIA_ID.DOMAIN_INTELLIGENCE_AGENT_VERSION, codeDigest: DIA_DIGEST,
      ownerPrincipalId: weber.principalId, escalationPrincipalId: richter.principalId, budgets: { max_reads: 20, max_gateway_calls: 0, max_elapsed_ms: 300_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] }, vogel.token);
    if (!r.ok) fail('N. Vogel registers the Domain Intelligence Agent', r);
    else ok(`N. Vogel REGISTERED the Domain Intelligence Agent ${short(r.body.agent.agentId)} — kind domain_intelligence (task domain_scan), role ${r.body.agent.role}, ${DIA_ID.DOMAIN_INTELLIGENCE_AGENT_VERSION} digest ${DIA_DIGEST.slice(0, 12)}…; accountable J. Weber, escalation T. Richter; it PROPOSES only`);
    DIA = (await agentsOf('domain_intelligence')).find((a) => a.status === 'active' && a.code_digest === DIA_DIGEST) ?? null;
  }
  if (DIA) NAME[DIA.principal_id] = 'the Domain Intelligence Agent';
}
(SCA && DIA ? ok : bad)(`the agents: the Supply Chain Agent ${short(SCA?.agent_id)} (current digest) and the Domain Intelligence Agent ${short(DIA?.agent_id)} — active`);

/* __SCENES__ */

/* ── B33-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
await renewAll();
console.log('\nB33-9 THE STATE and the LIMITS');
{
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/\s/.test(String(v)) ? `'${v}'` : v}`);
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
