#!/usr/bin/env node
/**
 * CP-6 stage B94 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): CUSTOMER ONBOARDING AND
 * GOVERNED MIGRATION (F-P7-F-04), THE IMPLEMENTATION PROGRAMME AND THE GO-LIVE GATE (F-P7-F-05), THE SERVICE PORTAL WITH GOVERNED SUPPORT ACCESS
 * (F-P7-F-06), and the carryovers (a) premium support routed from the live licence and (b) MET-039 (migration 0114) — exercised by the personas
 * through the REAL HTTP routes only, each scene stating what it shows and ASSERTING it (a scene that does not hold fails the act). EVERY OBJECT IS
 * LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left (read-only SQL) and says "stands — an earlier run"
 * instead of writing it twice. No clock is moved and NOTHING IS PLANTED: no SQL write; the corridor feed's condition is read, never staged.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses); DEMONSTRATED OPERATION (this act — SYNTHETIC personas, a SYNTHETIC
 * legacy spreadsheet, a SYNTHETIC vendor and support engineer; every in-product approval or acceptance by a synthetic persona demonstrates the
 * software and its records carry `claim: demonstration`); REAL CUSTOMER ACCEPTANCE (AT-67/68/69, PR-6x-006, UX-66-006) — R2, never claimed.
 * Production admission and deployment-profile parity: R1 / B111.
 *
 *   B94-0  THE STATE — 0114 applied; the casting; what exists (the subsidiary domain, the contract, the corridor feed's condition as read).
 *   B94-1  COMMERCIAL — C. Marchetti (the vendor's commercial authority, SYNTHETIC) re-declares the full platform with premium_support (v2: built,
 *          no gating prefix — a routing entitlement), reissues NORDWERK's licence, and declares NORDWERK's FIRST contract (decision cell: the
 *          corridor domain; support_boundary premium with a named contact) — BEFORE any onboarding or implementation programme opens (MET-039
 *          measures from the contract current at the programme's opening).
 *   CAST   N. Vogel (tenant administrator) creates the customer sponsor, the onboarding authority, the implementation lead (TENANT) and the vendor's
 *          support engineer (DOMAIN, the corridor only) — SYNTHETIC, fresh login names.
 *   B94-3  SCENE 2, PART I (F-P7-F-06 + carryover a) — the corridor's attention routes and responsibility matrix; M. Dvořák opens the case on
 *          red-sea-corridor-stream (routed PREMIUM from the live licence; the standard objectives read from the policies, never by changing the
 *          licence); a 15-minute grant approved by T. Richter and REVOKED by his customer-control drill; a second 15-minute grant approved and left
 *          to lapse on the database clock (shown in part II).
 *   B94-2  SCENE 1 (F-P7-F-04) — the subsidiary onboarded from its legacy supplier-risk spreadsheet: programme, sponsor intent, steps, the DRAFT
 *          domain, its administrators and policy, responsibility matrix v1 and configuration baseline (approved + signed by the onboarding
 *          authority), the upload source with the legacy CSV and its corrected version, the wave, suggestions, mapping v1, rehearsal 1 (held:
 *          the reconciliation diffs), the cutover HELD, the refusals, remediation (mapping v2, the corrected file, rehearsal 2 clean), the recheck
 *          released, the cutover approved on rehearsal 2's digest, executed, reconciled, the domain ACTIVATED, the rollback rehearsal, acceptance
 *          withheld then accepted (claim: demonstration). Residual: exposures are not proposed at cutover (the rating rides as provenance).
 *   B94-4  SCENE 3 (F-P7-F-05 + carryover b) — the implementation programme in the subsidiary; contract v2 adds the subsidiary as a decision cell;
 *          the training path attested accessible, training and competence records, readiness items; the gate HELD (risk owner unfilled), the
 *          sponsor's go-live refused 409, the lead's refused 403; N. Vogel creates the risk owner; the gate READY; go-live approved + signed by the
 *          sponsor naming the subsidiary's operating cadence and the priority journey. Then B92's routes: MET-039 v2 and ADP-001/-002 proposed by
 *          J. Satō and approved by M. Okonkwo; computed — honestly indeterminate where they are.
 *   B94-3  SCENE 2, PART II — the short grant LAPSES on the database clock (refused before the sweep; the sweep marks it lapsed; the drill
 *          expired_grant_refused); the 4-hour grant requested, previewed and approved by T. Richter; the engineer's diagnostic reads (each logged
 *          with the grant id), an attempted write refused 403, a note, a redacted evidence bundle, a workaround proposed and executed by M. Dvořák
 *          through the real source route, resolved, closure CONFIRMED by M. Dvořák; the access log read back. The 4-hour grant stands and lapses by
 *          itself.
 *   B94-5  REGRESSIONS — B92's operating review read back; the B33 package paths (list, gate, health) read.
 *   B94-6  THE STATE, the env lines for the walk, THE LIMITS (three claims kept apart).
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument) when given. Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment; the signing key is bound in the API's environment by reference and never read here.
 */
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// the contracts and step defaults are the BUILT API's (this act's own tree first)
const BUILT = existsSync(join(SELF_ROOT, 'apps', 'api', 'dist')) ? SELF_ROOT : ROOT;
const requireBuilt = createRequire(join(BUILT, 'apps', 'api', 'package.json'));
const FIXTURES = join(existsSync(join(SELF_ROOT, 'fixtures', 'phase7')) ? SELF_ROOT : ROOT, 'fixtures', 'phase7');
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
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
/** READ-ONLY ledger checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const num = (x, d = 3) => (x === null || x === undefined ? '—' : Number(x).toFixed(d).replace(/\.?0+$/, ''));
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const tStart = Date.now();
console.log(`THE B94 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, status, re, code) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? ''))) && (code === undefined || r.body?.code === code)) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${status}${code ? ` ${code}` : ''} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes: TENANT routes carry a TENANT envelope, DOMAIN routes a DOMAIN one ──────────────────────────────────────────────────────
const ten = (s, action, objectType = 'ONB', objectId = null, purposeId = 'onboarding') => ({ scope: 'TENANT', tenantId: T, domainId: null, principalId: `principal:${s.principalId}`, purposeId,
  consequence: 'C2', action, objectType, objectId, sideEffect: /\.read$/.test(action) ? 'none' : 'reversible', trace: 'phase6-b94' });
const dm = (s, dom, action, objectType = 'ONB', objectId = null, purposeId = 'onboarding') => ({ ...ten(s, action, objectType, objectId, purposeId), scope: 'DOMAIN', domainId: dom });
const plat = (s, over) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'commercial', consequence: 'C2', trace: 'phase6-b94', ...over });
const ON = `/v1/tenants/${T}/onboarding`; const MGT = `/v1/tenants/${T}/onboarding/migration`; const IMT = `/v1/tenants/${T}/implementation`;
const BL = (d) => `/v1/tenants/${T}/domains/${d}/onboarding/baselines`; const MG = (d) => `/v1/tenants/${T}/domains/${d}/onboarding/migration`;
const IMD = (d) => `/v1/tenants/${T}/domains/${d}/implementation`; const SV = (d) => `/v1/tenants/${T}/domains/${d}/service`; const SA = (d) => `/v1/tenants/${T}/domains/${d}/support`;
const OBS = (d) => `/v1/tenants/${T}/domains/${d}/observation`; const ATT = (d) => `/v1/tenants/${T}/domains/${d}/executive/attention`; const HOME = (d) => `/v1/tenants/${T}/domains/${d}/home`;
const A = `/v1/tenants/${T}/domains/${D}/analytics`;
const { STEP_DEFAULTS } = requireBuilt('./dist/delivery/onboarding/rollback.js');
const { ADOPTION_CONTRACTS } = requireBuilt('./dist/delivery/implementation/adoption-definitions.js');
const { definitionsB } = requireBuilt('./dist/analytics/computations-b/definitions-b.js');

/* ── B94-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB94-0 THE STATE — 0114, the casting, what exists');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0114%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0114 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc, dom = D) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, dom])).n > 0;
const CAST = [['n.vogel', 'tenant_admin', 'TENANT'], ['c.marchetti', 'commercial_authority', 'PLATFORM'], ['t.richter', 'domain_admin', 'DOMAIN'], ['m.dvorak', 'collection_manager', 'DOMAIN'],
  ['j.sato', 'product_analyst', 'DOMAIN'], ['m.okonkwo', 'product_analytics_owner', 'DOMAIN'], ['c.brenner', 'risk_owner', 'DOMAIN'], ['s.okafor', 'executive', 'DOMAIN'], ['d.ivanova', 'domain_specialist', 'DOMAIN']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}${sc === 'DOMAIN' ? ' (the corridor domain)' : ''}`); else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const renew = async (s) => { const n = await login(s.login, PW); if (n === null) { bad(`${s.login} could not authenticate again`); return s; } Object.assign(s, n); return s; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) await renew(s); };
const vogel = await persona('n.vogel'); const vendor = await persona('c.marchetti'); const richter = await persona('t.richter'); const dvorak = await persona('m.dvorak');
const analyst = await persona('j.sato'); const owner = await persona('m.okonkwo'); const ivanova = await persona('d.ivanova');
const NAME = { [vogel.principalId]: 'N. Vogel', [vendor.principalId]: 'C. Marchetti', [richter.principalId]: 'T. Richter', [dvorak.principalId]: 'M. Dvořák', [analyst.principalId]: 'J. Satō',
  [owner.principalId]: 'M. Okonkwo', [ivanova.principalId]: 'D. Ivanova' };
const nm = (id) => NAME[id] ?? short(id);
/** every human of the tenant by its short name (the display name before its role) — the act names people, never ids */
const learnNames = async () => { for (const p of await q(`select id::text, display_name from identity.principals where (tenant_id = $1 or tenant_id is null) and kind = 'human'`, [T])) NAME[p.id] ??= p.display_name.split(' — ')[0]; };
await learnNames();
const SUB_NAME = 'NORDWERK Polska — Supplier Risk (SYNTHETIC)';
const PROG_KEY = 'nordwerk-polska-supplier-risk'; const IMP_KEY = 'nordwerk-polska-golive'; const WAVE_KEY = 'polska-supplier-register';
const CONTRACT_REF = 'SYNTH-CONTRACT-NORDWERK-B94';
const subDomain = async () => q1(`select id::text, name, status, activated_at from tenancy.domains where tenant_id = $1 and name = $2`, [T, SUB_NAME]);
const SRC_KEY = 'red-sea-corridor-stream';
const SRC = await q1(`select source_id::text id, contract_version v, lifecycle_state, connector_kind, acquisition_mode, cadence_seconds from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by contract_version desc limit 1`, [T, D, SRC_KEY]);
{
  const sub = await subDomain();
  note(sub ? `the subsidiary domain "${SUB_NAME}" exists (${sub.status}${sub.activated_at ? `, activated ${iso(sub.activated_at)}` : ''}): stands — an earlier run` : `no subsidiary domain exists yet ("${SUB_NAME}" is absent): scene 1 drafts it through the onboarding programme`);
  const n = await q1(`select count(*)::int n, max(version)::int v from commercial.contracts where tenant_id = $1`, [T]);
  note(n.n === 0 ? 'commercial.contracts: NO contract for NORDWERK yet (B94-1 declares the first)' : `commercial.contracts: ${n.n} version(s), the latest v${n.v}: stands — an earlier run`);
  const cap = await q1(`select version, built, status, action_prefixes from commercial.capabilities where capability_key = 'premium_support' and status = 'active'`);
  (cap?.built === true && (cap.action_prefixes ?? []).length === 0 ? ok : bad)(`the catalogue: premium_support v${cap?.version} ${cap?.status}, built ${cap?.built}, gating prefixes [${(cap?.action_prefixes ?? []).join(', ')}] — a ROUTING entitlement (service.* is never licence-gated)`);
  if (SRC === null) { bad(`the corridor source ${SRC_KEY} is absent`); process.exit(1); }
  const runs = await q(`select state, started_at, finished_at, items_admitted, failure_reason from observation.collection_runs_current where source_id = $1 order by started_at desc limit 4`, [SRC.id]);
  const health = await q1(`select new_state, reason, evaluated_at from observation.source_health_events where source_id = $1 order by evaluated_at desc limit 1`, [SRC.id]);
  ok(`the corridor feed ${SRC_KEY} (${SRC.connector_kind}, ${SRC.acquisition_mode}, every ${SRC.cadence_seconds ?? '—'} s): ${SRC.lifecycle_state}; its last runs AS READ: ${runs.map((r) => `${iso(r.started_at)} ${r.state}${r.items_admitted !== null ? ` (${r.items_admitted} admitted)` : ''}${r.failure_reason ? ` — ${r.failure_reason}` : ''}`).join(' · ')}; health ${health ? `${health.new_state} (${health.reason ?? '—'}, ${iso(health.evaluated_at)})` : 'no health event recorded'}`);
}

/* ── B94-1 COMMERCIAL ────────────────────────────────────────────────────────────────── */
console.log('\nB94-1 COMMERCIAL — C. Marchetti reissues NORDWERK\'s licence adding premium_support and declares NORDWERK\'s FIRST contract (SYNTHETIC vendor records)');
const liveLicence = async () => q1(`select licence_id::text, version, package_key, state, capabilities, issued_at from commercial.licences where tenant_id = $1 and state <> 'superseded' order by issued_at desc, version desc limit 1`, [T]);
let LICENCE = null;
{
  let live = await liveLicence();
  if (live?.capabilities.includes('premium_support')) note(`licence v${live.version} (${live.package_key}, ${live.state}) carries premium_support: stands — an earlier run`);
  else {
    const pk = await q1(`select version, capabilities, tier from commercial.packages where package_key = 'full-platform' and status <> 'superseded' order by version desc limit 1`);
    if (pk === null) bad('the full-platform package is absent');
    else {
      let pkv = pk.version;
      if (!pk.capabilities.includes('premium_support')) {
        const r1 = await call('/v1/commercial/packages/declare', plat(vendor, { action: 'commercial.offer.package', objectType: 'PKG' }), { key: 'full-platform', expectedVersion: pk.version, title: 'The full platform (SYNTHETIC)',
          capabilities: [...pk.capabilities, 'premium_support'], limits: {}, tier: pk.tier, reason: 'B94: premium support (v2, built — a routing entitlement: named support and objectives per severity) joins the full platform (SYNTHETIC)' }, vendor.token);
        if (!r1.ok) fail('C. Marchetti re-declares the full-platform package', r1); else { pkv = r1.body.package.version; ok(`C. Marchetti DECLARED the package full-platform v${pkv}: + premium_support (SYNTHETIC)`); }
      } else note(`the package full-platform v${pk.version} already includes premium_support: stands — an earlier run`);
      const sku = await q1(`select version, package_version from commercial.skus where sku_code = 'EYE-FULL-12M' and status <> 'superseded' order by version desc limit 1`);
      if (sku && sku.package_version === pkv) note(`the SKU EYE-FULL-12M v${sku.version} is on full-platform v${pkv}: stands — an earlier run`);
      else {
        const r2 = await call('/v1/commercial/skus/declare', plat(vendor, { action: 'commercial.offer.sku', objectType: 'SKU' }), { code: 'EYE-FULL-12M', expectedVersion: sku?.version ?? 0, title: 'The full platform — 12 months (SYNTHETIC)', packageKey: 'full-platform', termMonths: 12,
          reason: 'the full platform with premium support on a twelve-month term (SYNTHETIC)' }, vendor.token);
        if (!r2.ok) fail('C. Marchetti re-declares the SKU EYE-FULL-12M', r2); else ok(`C. Marchetti DECLARED the SKU EYE-FULL-12M v${r2.body.sku.version} on full-platform v${r2.body.sku.package_version}`);
      }
      const r3 = await call(`/v1/commercial/tenants/${T}/licences/issue`, plat(vendor, { action: 'commercial.licence.issue', objectType: 'LIC', objectId: T }), { skuCode: 'EYE-FULL-12M',
        orderRef: 'SYNTH-ORDER-NORDWERK-B94-PREMIUM', reason: 'B94: NORDWERK licensed for premium support — the previous licence\'s capabilities and premium_support (SYNTHETIC)' }, vendor.token);
      if (!r3.ok) fail('C. Marchetti reissues the licence', r3);
      else ok(`C. Marchetti ISSUED NORDWERK licence v${r3.body.licence.version}: ${r3.body.licence.package_key} — ${r3.body.licence.capabilities.length} capabilities incl. premium_support; supersedes v${r3.body.licence.provenance?.supersedes}`);
    }
    live = await liveLicence();
  }
  const prev = (await q1(`select capabilities from commercial.licences where tenant_id = $1 and version = $2`, [T, (live?.version ?? 1) - 1]))?.capabilities ?? [];
  const lost = prev.filter((c) => !(live?.capabilities ?? []).includes(c));
  (live?.capabilities.includes('premium_support') && live.state === 'active' && lost.length === 0 ? ok : bad)(`NORDWERK's licence v${live?.version} (${live?.package_key}, ${live?.state}) carries premium_support and every capability of v${(live?.version ?? 1) - 1}${lost.length ? ` — LOST ${lost.join(', ')}` : ''}`);
  LICENCE = live;
}
const contractRows = async () => q(`select contract_id::text id, version, decision_cells, support_boundary, effective_from, declared_at, superseded_at, status from commercial.contracts where tenant_id = $1 and contract_ref = $2 order by version`, [T, CONTRACT_REF]);
let CONTRACT_ID = null;
{
  let rows = await contractRows();
  if (rows.length > 0) note(`contract ${CONTRACT_REF} v${rows[0].version} declared ${iso(rows[0].declared_at)} (effective ${iso(rows[0].effective_from)}): stands — an earlier run`);
  else {
    const r = await call(`/v1/commercial/tenants/${T}/contracts/declare`, plat(vendor, { action: 'commercial.contract.declare', objectType: 'CTR' }), { contractRef: CONTRACT_REF, expectedVersion: 0,
      reason: 'B94: NORDWERK\'s first contract — the corridor decision cell under the full platform licence with premium support (SYNTHETIC vendor record)',
      scope: { decision_cells: [D], sources: [], twins: [], authorities: [{ role: 'tenant_admin', principal_id: vogel.principalId }, { role: 'domain_admin', principal_id: richter.principalId }],
        environments: ['local-dev'], support_boundary: { tier: 'premium', statement: 'Premium support: named contact, response objectives per severity; support access only under a grant the customer approves (SYNTHETIC).',
          named_contact: 'The vendor premium desk — named support engineer of the NORDWERK account (SYNTHETIC)' } } }, vendor.token);
    if (!r.ok) fail('C. Marchetti declares the contract', r);
    else ok(`C. Marchetti DECLARED contract ${CONTRACT_REF} v${r.body.contract.version}: decision cell the corridor domain, support_boundary premium with a named contact, effective ${iso(r.body.contract.effective_from)} — a SYNTHETIC vendor record (no real customer signed it)`);
    rows = await contractRows();
  }
  CONTRACT_ID = rows[0]?.id ?? null;
  const progs = await q1(`select (select min(created_at) from onboarding.programmes where tenant_id = $1) onb, (select min(created_at) from implementation.programmes where tenant_id = $1) imp`, [T]);
  const first = rows[0];
  (first && (!progs.onb || new Date(first.declared_at) < new Date(progs.onb)) && (!progs.imp || new Date(first.declared_at) < new Date(progs.imp)) ? ok : bad)(`the contract (declared ${iso(first?.declared_at)}) PRECEDES every onboarding and implementation programme of the tenant (${progs.onb ? `first onboarding ${iso(progs.onb)}` : 'none yet'}; ${progs.imp ? `first implementation ${iso(progs.imp)}` : 'none yet'}) — MET-039 measures from the contract current at the programme's opening`);
}

/* ── CAST ────────────────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nCAST — N. Vogel creates the customer sponsor, the onboarding authority, the implementation lead and the vendor\'s support engineer (SYNTHETIC)');
const P = {};
async function cast(sp) {
  const existing = await q1(`select p.id::text, p.display_name from identity.principals p where p.login_name = $1`, [sp.login]);
  if (existing && existing.display_name !== sp.name) { bad(`the login name ${sp.login} is taken by "${existing.display_name}" — a login name is tenant-wide; choose another`); process.exit(1); }
  const sc = sp.domainId ? 'DOMAIN' : 'TENANT';
  const present = existing !== null && (await holds(sp.login, sp.role, sc, sp.domainId ?? D));
  const r = await createPersona(vogel, T, { displayName: sp.name, loginName: sp.login, password: PW, roleCode: sp.role, ...(sp.domainId ? { domainId: sp.domainId } : {}) });
  if (r.session === null) { bad(`${sp.short} could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (r.created) ok(`N. Vogel (tenant administrator) CREATED ${sp.short} through the governed principal route — "${sp.name}", login ${sp.login}, ${sp.role} at the ${sc}${sp.where ? ` (${sp.where})` : ''}`);
  else if (present) note(`${sp.short} (${sp.login}, ${sp.role}${sp.where ? `, ${sp.where}` : ''}) is present: stands — an earlier run`);
  else { bad(`${sp.login} exists but holds no ${sp.role} binding at the ${sc}`); process.exit(1); }
  P[sp.key] = { ...r.session, login: sp.login }; PERSONAS.push(P[sp.key]); NAME[r.session.principalId] = sp.short;
  ENV_OUT[`EYE_B94_${sp.key.toUpperCase()}`] = sp.login;
  return P[sp.key];
}
const sponsor = await cast({ key: 'sponsor', login: 'w.zielinska', name: 'W. Zielińska — customer sponsor, NORDWERK Polska (SYNTHETIC)', short: 'W. Zielińska', role: 'customer_sponsor' });
const authority = await cast({ key: 'authority', login: 'j.hartmann', name: 'J. Hartmann — onboarding authority, NORDWERK (SYNTHETIC)', short: 'J. Hartmann', role: 'onboarding_authority' });
const lead = await cast({ key: 'lead', login: 'r.costa', name: 'R. Costa — implementation lead, the vendor (SYNTHETIC)', short: 'R. Costa', role: 'implementation_lead' });
const engineer = await cast({ key: 'engineer', login: 'd.brooks', name: 'D. Brooks — vendor support engineer (SYNTHETIC)', short: 'D. Brooks', role: 'support_engineer', domainId: D, where: 'the corridor domain only' });
(new Set([sponsor.principalId, authority.principalId, lead.principalId, engineer.principalId]).size === 4 ? ok : bad)('four DIFFERENT people: the sponsor and the onboarding authority (the customer), the implementation lead and the support engineer (the vendor)');

/* ── B94-3 SCENE 2, PART I ───────────────────────────────────────────────────────────── */
await renewAll();
console.log(`\nB94-3 SCENE 2, PART I (F-P7-F-06 + carryover a) — the corridor's routes and responsibility matrix; the case on ${SRC_KEY} routed premium; a drilled grant; a short grant left to lapse`);
const B94_ROUTE = (roles, ack = 1440) => ({ materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: roles, ack_within_minutes: ack, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' });
async function routeClasses(dom, s, routes, label) {
  const active = await q1(`select policy_id::text id, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, dom]);
  const routed = (rules) => Object.entries(routes).every(([c, roles]) => JSON.stringify(rules?.classes?.[c]?.route_roles ?? []) === JSON.stringify(roles));
  if (active && routed(active.rules)) { note(`${label}: attention policy v${active.version} routes ${Object.keys(routes).join(', ')}: stands — an earlier run`); return active; }
  const rules = active ? JSON.parse(JSON.stringify(active.rules)) : { classes: {}, overload: { max_open_per_role: 50 } };
  for (const [c, roles] of Object.entries(routes)) if (rules.classes[c] === undefined || JSON.stringify(rules.classes[c].route_roles) !== JSON.stringify(roles)) rules.classes[c] = B94_ROUTE(roles);
  const r = await call(`${ATT(dom)}/policy/publish`, dm(s, dom, 'executive.attention.policy.publish', 'ATP', null, 'executive'), { rules,
    reason: `B94: the onboarding, readiness, service-case, support-access and responsibility-gap classes routed to the domain administrator${active ? ' — every earlier class unchanged' : ''} (SYNTHETIC)` }, s.token);
  if (!r.ok) { fail(`${nm(s.principalId)} publishes the attention policy (${label})`, r); return active; }
  const pub = await q1(`select policy_id::text id, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, dom]);
  const kept = active ? Object.keys(active.rules.classes).filter((c) => routes[c] !== undefined || JSON.stringify(pub.rules.classes[c]) === JSON.stringify(active.rules.classes[c])).length : 0;
  (routed(pub.rules) && (!active || kept === Object.keys(active.rules.classes).length) ? ok : bad)(`${nm(s.principalId)} PUBLISHED ${label}'s attention policy VERSION ${pub.version}${active ? ` (supersedes ${active.version}; ${kept} of ${Object.keys(active.rules.classes).length} earlier classes unchanged)` : ' (its first)'}: ${Object.entries(routes).map(([c, ro]) => `${c} → [${ro.join(', ')}]`).join('; ')}`);
  return pub;
}
await routeClasses(D, richter, { 'service.case': ['domain_admin'], 'support.access': ['domain_admin'], 'responsibility.gap': ['domain_admin'] }, 'the corridor');

const ROW_BASE = { accessPath: 'the domain workspace and the control center', evidenceProducer: 'the audit chain and the service ledger', escalationPath: 'the domain administrator, then the onboarding authority' };
const approvedMatrix = async (dom) => q1(`select matrix_id::text id, version, digest, state, signature_id::text sig from service.responsibility_matrices where tenant_id = $1 and domain_id = $2 and state = 'approved' order by version desc limit 1`, [T, dom]);
async function matrixFor(dom, rows, label, programmeId = null) {
  const have = await approvedMatrix(dom);
  if (have) { note(`${label}: responsibility matrix v${have.version} APPROVED and signed (${short(have.sig)}): stands — an earlier run`); return have; }
  let prop = await q1(`select matrix_id::text id, version, digest from service.responsibility_matrices where tenant_id = $1 and domain_id = $2 and state = 'proposed' order by version desc limit 1`, [T, dom]);
  if (!prop) {
    const r = await call(`${SA(dom)}/matrix/propose`, dm(lead, dom, 'service.matrix.propose', 'RSM', null, 'service'), { rows, expectedVersion: 0, profile: 'local-dev', ...(programmeId ? { programmeId } : {}) }, lead.token);
    if (!r.ok) { fail(`R. Costa proposes ${label}'s responsibility matrix`, r); return null; }
    prop = { id: r.body.matrix.matrix_id, version: r.body.matrix.version, digest: r.body.matrix.digest };
    ok(`R. Costa (implementation lead) PROPOSED ${label}'s responsibility matrix v${prop.version}: ${rows.map((x) => `${x.key} → ${x.ownerRole}${x.ownerPrincipalId ? ` (${nm(x.ownerPrincipalId)})` : ''}`).join(', ')} — digest ${dg(prop.digest)}`);
  }
  expectRefused(`R. Costa (the proposer, an implementation lead) approves ${label}'s matrix`, await call(`${SA(dom)}/matrix/${prop.id}/decide`, dm(lead, dom, 'service.matrix.decide', 'RSM', prop.id, 'service'),
    { version: prop.version, decision: 'approve', digest: prop.digest, reason: 'the lead approving its own proposal (refused)' }, lead.token), 403);
  const d = await call(`${SA(dom)}/matrix/${prop.id}/decide`, dm(authority, dom, 'service.matrix.decide', 'RSM', prop.id, 'service'), { version: prop.version, decision: 'approve', digest: prop.digest,
    reason: `the responsibilities of ${label} read against the operating model: every accountable owner named or resolvable (SYNTHETIC)` }, authority.token);
  if (!d.ok) { fail(`J. Hartmann approves ${label}'s matrix`, d); return null; }
  ok(`J. Hartmann (onboarding authority) APPROVED and SIGNED ${label}'s responsibility matrix v${d.body.matrix.version} at digest ${dg(d.body.matrix.digest)} (signature ${short(d.body.matrix.signature_id)})`);
  return approvedMatrix(dom);
}
const CORRIDOR_MATRIX = await matrixFor(D, [
  { key: 'domain.operation', title: 'Operating the corridor domain (SYNTHETIC)', ownerRole: 'domain_admin', ownerPrincipalId: richter.principalId, operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority', ...ROW_BASE },
  { key: 'risk.ownership', title: 'Owning the corridor\'s supply risks (SYNTHETIC)', ownerRole: 'risk_owner', operatorRole: 'domain_analyst', customerAuthority: 'onboarding_authority', ...ROW_BASE },
  { key: 'support.access', title: 'Approving vendor support access to the corridor (SYNTHETIC)', ownerRole: 'domain_admin', ownerPrincipalId: richter.principalId, operatorRole: 'support_engineer', customerAuthority: 'onboarding_authority', ...ROW_BASE },
  { key: 'evidence.custody', title: 'Custody of the corridor\'s evidence (SYNTHETIC)', ownerRole: 'data_steward', operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority', ...ROW_BASE },
], 'the corridor');
{
  const o = await q1(`select service.owner_resolution($1, $2, 'support.access') r`, [T, D]);
  (o?.r?.state === 'resolved' ? ok : bad)(`the accountable owner of support.access in the corridor: ${o?.r?.state} — ${o?.r?.owner_role} ${(o?.r?.principals ?? []).map(nm).join(', ')}`);
}

// THE CASE (M. Dvořák) — titled by the condition AS READ, never a staged stall
const CASE_PREFIX = `Corridor feed ${SRC_KEY}`;
const caseRow = async () => q1(`select case_id::text id, case_ref, title, state, version, severity, routing, object_refs, opened_at, response_due_at, resolution_due_at from service.cases
                                where tenant_id = $1 and domain_id = $2 and opened_by = $3 and title like $4 order by opened_at limit 1`, [T, D, dvorak.principalId, `${CASE_PREFIX}%`]);
let CASE = await caseRow();
{
  if (CASE) note(`case ${CASE.case_ref} "${CASE.title}" (${CASE.state}, v${CASE.version}): stands — an earlier run`);
  else {
    const failed = await q1(`select run_id::text id, started_at, failure_reason from observation.collection_runs_current where source_id = $1 and state = 'failed' and started_at > clock_timestamp() - interval '14 days' order by started_at desc limit 1`, [SRC.id]);
    const last = await q1(`select state, started_at, items_admitted from observation.collection_runs_current where source_id = $1 order by started_at desc limit 1`, [SRC.id]);
    const latest = last ? `the latest run ${iso(last.started_at)} ${last.state}${last.items_admitted !== null ? `, ${last.items_admitted} admitted` : ''}` : 'no run recorded';
    const condition = failed ? `a collection run failed on ${iso(failed.started_at).slice(0, 10)} (${failed.failure_reason}); ${latest}` : `delivery check — ${latest}`;
    const title = (failed ? `${CASE_PREFIX}: the ${iso(failed.started_at).slice(0, 10)} run failed — recurrence check (SYNTHETIC case)` : `${CASE_PREFIX}: delivery check (SYNTHETIC case)`).slice(0, 200);
    const objects = [{ kind: 'source', id: SRC.id }, ...(failed ? [{ kind: 'run', id: failed.id }] : [])];
    const r = await call(`${SV(D)}/cases/open`, dm(dvorak, D, 'service.case.open', 'SVC', null, 'service'), { title, severity: 'S2', capability: 'observation', objects,
      description: `The corridor feed ${SRC_KEY} is what the Regensburg supply review reads every morning. As read when this case was opened: ${condition}. The collection manager asks support to check the source, its runs, its health and its scheduler so the failure does not recur (SYNTHETIC — the case is opened on the demonstration's own recorded runs; no stall was staged).` }, dvorak.token);
    if (!r.ok) fail('M. Dvořák opens the case', r);
    else ok(`M. Dvořák (collection manager) OPENED case ${r.body.case.case_ref} (S2, observation): "${title}" — the condition AS READ, never a staged stall`);
    CASE = await caseRow();
  }
  if (CASE) {
    const rt = CASE.routing ?? {};
    (rt.tier === 'premium' && rt.named_support ? ok : bad)(`ROUTED ${String(rt.tier).toUpperCase()} from the LIVE licence v${rt.licence?.version} (premium_listed ${rt.licence?.premium_listed}): named support "${rt.named_support}", objectives response ${rt.objectives?.response_minutes} min / resolution ${rt.objectives?.resolution_minutes} min; due ${iso(CASE.response_due_at)} / ${iso(CASE.resolution_due_at)} — the routing records the licence version; case opening is never licence-gated`);
    const pol = await call(`${SV(D)}/policies`, dm(richter, D, 'service.read', 'SVC', null, 'service'), {}, richter.token);
    if (!pol.ok) fail('T. Richter reads the routing preview and the SLA policies', pol);
    else {
      const std = (pol.body.policies ?? []).find((x) => x.tier === 'standard' && x.severity === 'S2');
      const pre = (pol.body.policies ?? []).find((x) => x.tier === 'premium' && x.severity === 'S2');
      ok(`the routing preview (live licence): ${Object.entries(pol.body.routing ?? {}).map(([s, x]) => `${s} ${x.tier} ${x.objectives?.response_minutes}/${x.objectives?.resolution_minutes} min`).join(' · ')}`);
      (std ? ok : bad)(`WITHOUT premium_support the STANDARD S2 policy would apply: response ${std?.response_minutes ?? std?.objectives?.response_minutes} min / resolution ${std?.resolution_minutes ?? std?.objectives?.resolution_minutes} min (premium S2: ${pre?.response_minutes ?? pre?.objectives?.response_minutes} / ${pre?.resolution_minutes ?? pre?.objectives?.resolution_minutes}) — read from the policies, the licence never changed back; ${String(pol.body.governance ?? '').slice(0, 160)}`);
    }
  }
}
const caseVersion = async () => (await caseRow())?.version;
if (CASE && CASE.state === 'open') {
  const r = await call(`${SV(D)}/cases/${CASE.id}/triage`, dm(richter, D, 'service.case.triage', 'SVC', CASE.id, 'service'), { expectedVersion: CASE.version, note: 'assessed by the customer\'s service owner: support needs read access to the source, its runs, health and scheduler (SYNTHETIC)' }, richter.token);
  if (!r.ok) fail('T. Richter triages the case', r); else ok(`T. Richter TRIAGED ${CASE.case_ref} (v${r.body.case.version}): the response objective met by the customer's service owner`);
  const v = await caseVersion();
  const p = await call(`${SV(D)}/cases/${CASE.id}/progress`, dm(richter, D, 'service.case.progress', 'SVC', CASE.id, 'service'), { expectedVersion: v, to: 'awaiting_access', statement: 'support needs a scoped, time-boxed grant to read the corridor source (SYNTHETIC)' }, richter.token);
  if (!p.ok) fail('T. Richter marks the case awaiting access', p); else ok(`${CASE.case_ref} → awaiting_access (v${p.body.case.version})`);
  CASE = await caseRow();
}
const grantByPurpose = async (prefix) => q1(`select grant_id::text id, state, request_digest, duration_minutes, starts_at, expires_at, ended_at, end_reason, action_scope from service.support_grants
                                             where tenant_id = $1 and domain_id = $2 and engineer_principal_id = $3 and purpose like $4 order by requested_at desc limit 1`, [T, D, engineer.principalId, `${prefix}%`]);
const diagnose = (what, caseId = CASE?.id) => call(`${SA(D)}/diagnose/${what}`, dm(engineer, D, `support.diagnose.${what}`, 'SRC', SRC.id, 'service'), { sourceId: SRC.id, caseId }, engineer.token);
async function requestAndApprove(purpose, actions, minutes, label) {
  let g = await grantByPurpose(purpose);
  if (g && g.state !== 'requested') { note(`${label}: grant ${short(g.id)} is ${g.state}${g.expires_at ? ` (expires ${iso(g.expires_at)})` : ''}: stands — an earlier run`); return { g, fresh: false }; }
  let r;
  if (g) { note(`${label}: grant ${short(g.id)} was requested by an earlier run and awaits the decision`); r = { ok: true, body: { grant: { grant_id: g.id, request_digest: g.request_digest } } }; }
  else {
    r = await call(`${SA(D)}/grants/request`, dm(engineer, D, 'service.grant.request', 'SGR', null, 'service'), { caseId: CASE.id, purpose, sources: [SRC.id], actions, durationMinutes: minutes }, engineer.token);
    if (!r.ok) { fail(`D. Brooks requests ${label}`, r); return { g: null, fresh: false }; }
    ok(`D. Brooks (support engineer) REQUESTED ${label}: ${minutes} min, sources [${SRC_KEY}], actions [${r.body.grant.action_scope.join(', ')}] — digest ${dg(r.body.grant.request_digest)}; the review task and a support.access item to the domain administrator`);
  }
  const pv = await call(`${SA(D)}/grants/${r.body.grant.grant_id}/preview`, dm(richter, D, 'service.read', 'SGR', r.body.grant.grant_id, 'service'), {}, richter.token);
  if (!pv.ok) fail('T. Richter previews the grant', pv);
  else note(`T. Richter's preview in the control center: eligible ${pv.body.eligibility?.can_decide}${(pv.body.eligibility?.reasons ?? []).length ? ` (${pv.body.eligibility.reasons.join('; ')})` : ' (no reason against)'}; the owner of support.access ${pv.body.owner?.state} (${(pv.body.owner?.principals ?? []).map(nm).join(', ')})`);
  const d = await call(`${SA(D)}/grants/${r.body.grant.grant_id}/decide`, dm(richter, D, 'service.grant.decide', 'SGR', r.body.grant.grant_id, 'service'), { decision: 'approve', digest: r.body.grant.request_digest,
    reason: `${label}: the customer's accountable owner of support.access approves this scope and window (SYNTHETIC)` }, richter.token);
  if (!d.ok) { fail(`T. Richter approves ${label}`, d); return { g: await grantByPurpose(purpose), fresh: true }; }
  ok(`T. Richter (the accountable owner of support.access; human gate) APPROVED ${label} at the request digest: live ${iso(d.body.grant.starts_at)} → ${iso(d.body.grant.expires_at)}`);
  const pr = await q1(`select preview from service.support_grants where grant_id = $1`, [r.body.grant.grant_id]);
  note(`the consequence preview he approved (recorded on the grant): ${(Array.isArray(pr?.preview) ? pr.preview : Array.isArray(pr?.preview?.lines) ? pr.preview.lines : [JSON.stringify(pr?.preview ?? '')]).join(' | ').slice(0, 600)}`);
  return { g: await grantByPurpose(purpose), fresh: true };
}
const G0_PURPOSE = 'Customer-control drill: a 15-minute first look at the corridor source contract, revoked by the customer';
const G1_PURPOSE = 'A 15-minute look at the corridor source health (the shortest window the port admits), left to lapse by itself';
const GA_PURPOSE = 'Diagnose the corridor feed for the case: the source contract, its runs, its health and its scheduler (4 hours)';
let G1 = null;
if (CASE) {
  // without a grant: refused AND logged
  const pre = await grantByPurpose(G0_PURPOSE);
  if (!pre) expectRefused('D. Brooks reads the case before any grant', await call(`${SV(D)}/cases/${CASE.id}/support-read`, dm(engineer, D, 'service.case.support_read', 'SVC', CASE.id, 'service'), {}, engineer.token), 403, /support access rejected \(access\)/);
  // G0 — approved, read once, REVOKED by the customer's drill
  const g0 = await requestAndApprove(G0_PURPOSE, ['diagnose.source'], 15, 'the drill grant (15 min, diagnose.source)');
  if (g0.g && g0.fresh && g0.g.state === 'approved') {
    const r = await diagnose('source');
    (r.ok && r.body.diagnosis?.refused === false ? ok : bad)(`D. Brooks READ the source contract under grant ${short(r.body?.diagnosis?.grant_id)} (logged ${short(r.body?.diagnosis?.log_id)}): ${r.ok ? `${r.body.diagnosis.data?.source_key} ${r.body.diagnosis.data?.lifecycle_state}, rights ${r.body.diagnosis.data?.rights_state}` : refusalLine(r)}`);
    const dr = await call(`${SA(D)}/drills/run`, dm(richter, D, 'service.drill.run', 'SDR', g0.g.id, 'service'), { kind: 'revoke_live_grant', grantId: g0.g.id, reason: 'the customer exercises its own control: a live vendor grant revoked on demand (SYNTHETIC drill)' }, richter.token);
    if (!dr.ok) fail('T. Richter runs the revoke_live_grant drill', dr);
    else ok(`T. Richter RAN the customer-control drill revoke_live_grant on ${short(g0.g.id)}: outcome ${String(dr.body.drill.outcome).toUpperCase()} — probes ${(dr.body.drill.probes ?? []).map((x) => `${x.action}: ${x.live_grant === null ? 'refused' : 'LIVE'}`).join(', ')}; the engineer's sessions revoked ${dr.body.drill.access?.sessions_revoked ?? '—'}`);
    await renew(engineer);
    expectRefused('D. Brooks reads the source again after the drill', await diagnose('source'), 403, /support access rejected \(access\): grant .* is revoked/);
  }
  { const g = await grantByPurpose(G0_PURPOSE); (g?.state === 'revoked' ? ok : bad)(`the drill grant ${short(g?.id)}: ${g?.state} (${g?.end_reason ?? '—'})`); }
  // G1 — approved, read once, LEFT to lapse
  const g1 = await requestAndApprove(G1_PURPOSE, ['diagnose.health'], 15, 'the short-window grant (15 min, diagnose.health)');
  G1 = g1.g;
  if (G1 && g1.fresh && G1.state === 'approved') {
    await renew(engineer);
    const r = await diagnose('health');
    (r.ok && r.body.diagnosis?.refused === false ? ok : bad)(`D. Brooks READ the source health under grant ${short(r.body?.diagnosis?.grant_id)}: ${r.ok ? `${(r.body.diagnosis.data ?? []).length} health event(s)${(r.body.diagnosis.data ?? []).length ? ` — the latest ${r.body.diagnosis.data[0].new_state} (${r.body.diagnosis.data[0].reason ?? '—'})` : ''}` : refusalLine(r)}`);
  }
  if (G1) note(`the short-window grant ${short(G1.id)} is ${G1.state}, expires ${iso(G1.expires_at)} on the database clock — its lapse is shown in PART II, after scenes 1 and 3`);
}

/* ── B94-2 SCENE 1 ───────────────────────────────────────────────────────────────────── */
await renewAll();
console.log(`\nB94-2 SCENE 1 (F-P7-F-04) — "${SUB_NAME}" onboarded from its legacy supplier-risk spreadsheet (SYNTHETIC)`);
const progRow = async () => q1(`select programme_id::text id, version, state, target_domain_id::text target, digest, held_reasons, created_at from onboarding.programmes where tenant_id = $1 and programme_key = $2 and superseded_at is null`, [T, PROG_KEY]);
let PROG = await progRow();
let SUB = null;
const STEP_PLAN = ['intent', 'domain', 'authority', 'policy', 'sources', 'responsibility', 'baseline', 'mapping', 'rehearsal', 'reconciliation', 'cutover'];
const stepRow = async (key) => q1(`select step_id::text id, version, state, realized_by from onboarding.steps where programme_id = $1 and step_key = $2`, [PROG.id, key]);
async function recordStep(key, realizedBy, label) {
  const s = await stepRow(key);
  if (!s) { bad(`the step ${key} is not planned`); return; }
  if (s.state === 'done') { note(`step ${key} done (${s.realized_by?.label ?? s.realized_by?.kind}): stands — an earlier run`); return; }
  const r = await call(`${ON}/steps/${s.id}/record`, ten(lead, 'onboarding.step.record', 'ONB', s.id), { expectedVersion: s.version, state: 'done', realizedBy }, lead.token);
  if (!r.ok) fail(`R. Costa records the ${key} step`, r); else ok(`step ${key} DONE — realized by ${r.body.step.realized_by?.label ?? realizedBy.kind} (${realizedBy.action}); compensation: ${r.body.step.compensation?.action ?? '—'}${label ? ` — ${label}` : ''}`);
}
{
  // THE PROGRAMME (the implementation lead)
  if (PROG) note(`onboarding programme ${PROG_KEY} v${PROG.version} (${PROG.state}): stands — an earlier run`);
  else {
    const r = await call(`${ON}/programmes/open`, ten(lead, 'onboarding.programme.open'), { key: PROG_KEY, title: 'NORDWERK Polska — supplier-risk onboarding (SYNTHETIC)', deploymentProfile: 'local-dev',
      plan: { waves: 1, legacy: 'the supplier-risk spreadsheet of the Polish subsidiary (CSV export)', cutover: 'after a clean rehearsal against the approved mapping' } }, lead.token);
    if (!r.ok) { fail('R. Costa opens the onboarding programme', r); process.exit(1); }
    ok(`R. Costa (implementation lead) OPENED onboarding programme ${PROG_KEY} v${r.body.programme.version} (${r.body.programme.state}) — digest ${dg(r.body.programme.digest)}`);
    PROG = await progRow();
  }
  // THE SPONSOR'S INTENT (the customer sponsor's own record)
  const intent = await q1(`select intent_id::text id, version, target_domain_name from onboarding.sponsor_intents where programme_id = $1 and superseded_at is null`, [PROG.id]);
  if (intent) note(`the sponsor's intent v${intent.version} (target "${intent.target_domain_name}"): stands — an earlier run`);
  else {
    const INTENT = { objectives: ['one governed supplier-risk register for the Polish subsidiary', 'retire the legacy spreadsheet after cutover'],
      scopeStatement: 'The Polish subsidiary\'s supplier-risk register: its suppliers, their legacy identifiers and risk ratings (SYNTHETIC).',
      successMeasures: ['every supplier of the register migrated or its refusal explained', 'go-live accepted by the customer sponsor with an operating cadence'],
      constraints: ['no customer data leaves the tenant', 'cutover only after a clean rehearsal on the approved mapping'], targetDomainName: SUB_NAME, deploymentProfile: 'local-dev' };
    expectRefused('R. Costa (implementation lead) records the sponsor\'s intent', await call(`${ON}/programmes/${PROG.id}/intent`, ten(lead, 'onboarding.intent.record'), INTENT, lead.token), 403);
    const r = await call(`${ON}/programmes/${PROG.id}/intent`, ten(sponsor, 'onboarding.intent.record'), INTENT, sponsor.token);
    if (!r.ok) fail('W. Zielińska records the intent', r); else ok(`W. Zielińska (customer sponsor) RECORDED her intent v${r.body.intent.version}: ${INTENT.objectives.length} objectives, ${INTENT.successMeasures.length} success measures, target "${SUB_NAME}" — digest ${dg(r.body.intent.digest)}`);
  }
  // THE STEPS (JRN-01 → JRN-23), each with its compensating act
  for (const k of STEP_PLAN) {
    if (await stepRow(k)) continue;
    const r = await call(`${ON}/programmes/${PROG.id}/steps/plan`, ten(lead, 'onboarding.step.plan'), { stepKey: k, compensation: STEP_DEFAULTS[k].compensation }, lead.token);
    if (!r.ok) fail(`R. Costa plans the ${k} step`, r);
  }
  const planned = await q(`select step_key, state from onboarding.steps where programme_id = $1 order by ordinal`, [PROG.id]);
  (planned.length >= STEP_PLAN.length ? ok : bad)(`the programme's steps (JRN-01 then JRN-23), each naming its compensating act: ${planned.map((s) => `${s.step_key}:${s.state}`).join(' → ')}`);
  const iv = await q1(`select intent_id::text id from onboarding.sponsor_intents where programme_id = $1 and superseded_at is null`, [PROG.id]);
  if (iv) await recordStep('intent', { kind: 'sponsor_intent', id: iv.id, action: 'onboarding.intent.record' });
  // THE DRAFT DOMAIN (the tenant administrator, through the programme)
  PROG = await progRow();
  if (PROG.target) note(`the programme names its target domain ${short(PROG.target)}: stands — an earlier run`);
  else {
    expectRefused('R. Costa (implementation lead) drafts the domain', await call(`${ON}/programmes/${PROG.id}/domain-draft`, ten(lead, 'tenancy.domain.draft', 'CID'), { name: SUB_NAME }, lead.token), 403);
    const r = await call(`${ON}/programmes/${PROG.id}/domain-draft`, ten(vogel, 'tenancy.domain.draft', 'CID'), { name: SUB_NAME }, vogel.token);
    if (!r.ok) { fail('N. Vogel drafts the domain', r); process.exit(1); }
    ok(`N. Vogel (tenant administrator) DRAFTED the domain "${r.body.domain.name}" ${short(r.body.domain.id)} (status ${r.body.domain.status}) through the programme — lifecycle domain.drafted; the programme's next version names it`);
  }
  SUB = await subDomain();
  if (!SUB) { bad('the subsidiary domain is absent after the draft'); process.exit(1); }
  ENV_OUT.EYE_B94_SUBSIDIARY_DOMAIN = SUB.id;
  const draftCell = await q1(`select count(*)::int n from commercial.contracts where tenant_id = $1 and decision_cells @> to_jsonb(array[$2::text])`, [T, SUB.id]);
  note(SUB.status === 'draft' ? `the subsidiary is DRAFT: a draft domain is never a contract decision cell (0105 refuses non-active cells) — contract versions naming it: ${draftCell.n}` : `the subsidiary is ${SUB.status} (activated by an earlier run); contract versions naming it as a decision cell: ${draftCell.n}`);
  await recordStep('domain', { kind: 'domain', id: SUB.id, action: 'tenancy.domain.draft' });
}
// THE SUBSIDIARY'S PEOPLE (N. Vogel)
const subAdmin = await cast({ key: 'sub_admin', login: 'k.nowak', name: 'K. Nowak — domain administrator, NORDWERK Polska (SYNTHETIC)', short: 'K. Nowak', role: 'domain_admin', domainId: SUB.id, where: 'the subsidiary' });
const subManager = await cast({ key: 'sub_manager', login: 'a.wisniewska', name: 'A. Wiśniewska — collection manager, NORDWERK Polska (SYNTHETIC)', short: 'A. Wiśniewska', role: 'collection_manager', domainId: SUB.id, where: 'the subsidiary' });
const assessor = await cast({ key: 'assessor', login: 'e.sandberg', name: 'E. Sandberg — enablement assessor, NORDWERK Polska (SYNTHETIC)', short: 'E. Sandberg', role: 'enablement_assessor', domainId: SUB.id, where: 'the subsidiary' });
const owner1 = await cast({ key: 'decision_owner_1', login: 'm.kowalczyk', name: 'M. Kowalczyk — decision owner, NORDWERK Polska (SYNTHETIC)', short: 'M. Kowalczyk', role: 'decision_owner', domainId: SUB.id, where: 'the subsidiary' });
const owner2 = await cast({ key: 'decision_owner_2', login: 't.wojcik', name: 'T. Wójcik — decision owner, NORDWERK Polska (SYNTHETIC)', short: 'T. Wójcik', role: 'decision_owner', domainId: SUB.id, where: 'the subsidiary' });
await recordStep('authority', { kind: 'principal', id: subAdmin.principalId, action: 'identity.principal.create' }, 'the subsidiary\'s administrator');
// ITS ATTENTION POLICY (the subsidiary's administrator)
{
  const pol = await routeClasses(SUB.id, subAdmin, { 'onboarding.migration': ['domain_admin'], 'onboarding.drift': ['domain_admin'], 'responsibility.gap': ['domain_admin'], 'implementation.readiness': ['domain_admin'],
    'support.access': ['domain_admin'], 'service.case': ['domain_admin'] }, 'the subsidiary');
  if (pol) await recordStep('policy', { kind: 'attention_policy', id: pol.id, action: 'executive.attention.policy.publish' });
}
// THE RESPONSIBILITY MATRIX v1 (the lead proposes; the onboarding authority approves and signs)
const SUB_MATRIX = await matrixFor(SUB.id, [
  { key: 'data.migration', title: 'Migrating the legacy supplier-risk register (SYNTHETIC)', ownerRole: 'onboarding_authority', ownerPrincipalId: authority.principalId, operatorRole: 'implementation_lead', customerAuthority: 'onboarding_authority', ...ROW_BASE, escalationPath: 'the onboarding authority, then the customer sponsor' },
  { key: 'risk.ownership', title: 'Owning the subsidiary\'s supplier risks (SYNTHETIC)', ownerRole: 'risk_owner', operatorRole: 'domain_admin', customerAuthority: 'onboarding_authority', ...ROW_BASE, escalationPath: 'the domain administrator, then the customer sponsor' },
  { key: 'support.access', title: 'Approving vendor support access to the subsidiary (SYNTHETIC)', ownerRole: 'domain_admin', ownerPrincipalId: subAdmin.principalId, operatorRole: 'support_engineer', customerAuthority: 'onboarding_authority', ...ROW_BASE },
  { key: 'domain.operation', title: 'Operating the subsidiary domain (SYNTHETIC)', ownerRole: 'domain_admin', ownerPrincipalId: subAdmin.principalId, operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority', ...ROW_BASE },
  { key: 'decision.ownership', title: 'Owning the subsidiary\'s supplier decisions (SYNTHETIC)', ownerRole: 'decision_owner', ownerPrincipalId: owner1.principalId, operatorRole: 'domain_admin', customerAuthority: 'onboarding_authority', ...ROW_BASE },
], 'the subsidiary', PROG.id);
if (SUB_MATRIX) {
  await recordStep('responsibility', { kind: 'responsibility_matrix', id: SUB_MATRIX.id, version: SUB_MATRIX.version, action: 'service.matrix.decide' });
  const owners = await q(`select k, (service.owner_resolution($1, $2, k)) r from unnest(array['data.migration', 'risk.ownership', 'support.access', 'decision.ownership']) k`, [T, SUB.id]);
  note(`the subsidiary's owner registry (read LIVE): ${owners.map((o) => `${o.k} ${o.r.state}${o.r.principals?.length ? ` (${o.r.principals.map(nm).join(', ')})` : ''}`).join(' · ')}`);
}
// THE UPLOAD SOURCE in the subsidiary (registered by its administrator, approved and activated by its collection manager; the agent by the platform administrator)
const LEGACY_FILE = 'nordwerk-polska-supplier-risk-legacy.csv'; const CORRECTED_FILE = 'nordwerk-polska-supplier-risk-legacy-corrected.csv';
const SUB_SRC_KEY = 'nordwerk-polska-legacy-supplier-risk';
const subSource = async () => q1(`select source_id::text id, contract_version v, lifecycle_state from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by contract_version desc limit 1`, [T, SUB.id, SUB_SRC_KEY]);
let SUBSRC = await subSource();
const EV = {};
{
  if (SUBSRC) note(`the subsidiary's upload source ${SUB_SRC_KEY} (${SUBSRC.lifecycle_state}): stands — an earlier run`);
  else {
    const contract = {
      source_key: SUB_SRC_KEY, name: 'NORDWERK Polska legacy supplier-risk register (SYNTHETIC)', publisher: 'NORDWERK Polska purchasing (synthetic)', authority_class: 'authoritative',
      connector_kind: 'upload', acquisition_mode: 'replay', data_origin: 'synthetic',
      identity: { source_identity: SUB_SRC_KEY, publisher_identity: 'NORDWERK Polska purchasing (synthetic entity; does not exist)', endpoints: [], scheme_allowlist: ['https'], cadence_seconds: 86_400, jitter_seconds: 0, collection_window: null },
      authority_and_rights: { owner: 'observation.operations', steward: 'NORDWERK Polska purchasing (SYNTHETIC)', authority: 'The subsidiary\'s internal supplier-risk register (synthetic)', legal_basis: 'Internal synthetic data created for the demonstration',
        rights_state: 'confirmed', licence: 'internal', permitted_use: ['internal analysis', 'governed migration'], robots_policy: 'not applicable', purposes: ['observation'],
        classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none' },
      security_and_operations: { credential_ref: null, authentication_method: 'operator upload under an authenticated session',
        authenticity_method: { transport_endpoint: 'not applicable — no transport was performed by this system', byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
          source_origin: 'operator attestation only', content_authenticity: 'not applicable — the register is synthetic and marked as such' },
        budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
        expected_schema: { media_types: ['text/csv'], required_fields: [], drift_tolerance: 0, max_bytes: 16_777_216 },
        freshness_expectation: { threshold_seconds: 2_592_000, expected_interval: 'once — the legacy export' },
        coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one legacy export (and its corrected version)', expected_items_per_window: null, not_applicable_dimensions: ['latency', 'correction_lag', 'authenticity'],
          not_applicable_reason: 'a one-time legacy export supplied by the operator: no publisher to lag behind, no corrections channel, no external origin to authenticate' },
        correction_channel: 'a corrected export supplied by the operator', replay_set: 'nordwerk-polska-legacy' },
      lifecycle: { contract_version: 1, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
    };
    const r = await call(`${OBS(SUB.id)}/sources/register`, dm(subAdmin, SUB.id, 'observation.source.register', 'SRC', null, 'observation'), { contract }, subAdmin.token);
    if (!r.ok) fail('K. Nowak registers the legacy upload source', r); else ok(`K. Nowak (the subsidiary's administrator) REGISTERED the upload source ${SUB_SRC_KEY} in the DRAFT domain`);
    SUBSRC = await subSource();
  }
  if (SUBSRC && SUBSRC.lifecycle_state === 'draft') {
    const a = await call(`${OBS(SUB.id)}/sources/${SUBSRC.id}/approve`, dm(subManager, SUB.id, 'observation.source.approve', 'SRC', SUBSRC.id, 'observation'), { contractVersion: SUBSRC.v, decision: 'approve', reason: 'the legacy export\'s contract reviewed: internal, synthetic, CSV only (SYNTHETIC)' }, subManager.token);
    if (!a.ok) fail('A. Wiśniewska approves the source', a); else ok('A. Wiśniewska (collection manager; not the registrar) APPROVED the source contract');
    SUBSRC = await subSource();
  }
  if (SUBSRC && SUBSRC.lifecycle_state === 'approved') {
    const t = await call(`${OBS(SUB.id)}/sources/${SUBSRC.id}/transition`, dm(subManager, SUB.id, 'observation.source.transition', 'SRC', SUBSRC.id, 'observation'), { contractVersion: SUBSRC.v, target: 'active', reason: 'the legacy export is collected once into evidence (SYNTHETIC)' }, subManager.token);
    if (!t.ok) fail('A. Wiśniewska activates the source', t); else ok('A. Wiśniewska ACTIVATED the source');
    SUBSRC = await subSource();
  }
  if (SUBSRC) {
    const agent = await q1(`select agent_id::text id from observation.agents where source_id = $1 and status = 'active' and revoked_at is null limit 1`, [SUBSRC.id]);
    if (agent) note(`the source's upload agent ${short(agent.id)}: stands — an earlier run`);
    else {
      const r = await call(`${OBS(SUB.id)}/agents/register`, { scope: 'DOMAIN', tenantId: T, domainId: SUB.id, action: 'observation.agent.register', objectType: 'AGT', objectId: null, principalId: `principal:${admin.principalId}`, purposeId: 'observation', trace: 'phase6-b94' },
        { sourceId: SUBSRC.id, connector: 'upload', ownerPrincipalId: subAdmin.principalId }, admin.token);
      if (!r.ok) fail('the platform administrator provisions the upload agent', r); else ok(`the platform administrator PROVISIONED the upload agent (an identity act — a principal is created), owned by K. Nowak`);
    }
    for (const [k, file] of [['legacy', LEGACY_FILE], ['corrected', CORRECTED_FILE]]) {
      const bytes = readFileSync(join(FIXTURES, file));
      const itemKey = `upload:${file}@${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
      const findEv = async () => q1(`select e.object_id::text id, (e.payload ->> 'content_digest') bytes_digest from objects.canonical_objects e
          join objects.canonical_objects o on o.object_type = 'OBS' and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
         where e.object_type = 'EVD' and e.tenant_id = $1 and e.domain_id = $2 and o.payload ->> 'item_key' = $3 order by e.recorded_at desc limit 1`, [T, SUB.id, itemKey]);
      let ev = await findEv();
      if (ev) note(`the ${k} file ${file} is in evidence ${short(ev.id)}: stands — an earlier run`);
      else {
        const r = await call(`${OBS(SUB.id)}/upload`, dm(subAdmin, SUB.id, 'observation.run.trigger', 'RUN', null, 'observation'), { sourceId: SUBSRC.id, contractVersion: SUBSRC.v,
          files: [{ filename: file, mediaType: 'text/csv', base64: bytes.toString('base64'), documentTime: null }] }, subAdmin.token);
        if (!r.ok) fail(`K. Nowak uploads ${file}`, r);
        ev = await findEv();
        (ev ? ok : bad)(`K. Nowak UPLOADED the ${k} spreadsheet export ${file} (${bytes.length} bytes, ${bytes.toString('utf8').trim().split('\n').length - 1} rows): run ${r.body?.run?.state ?? '—'}, admitted ${r.body?.run?.admitted ?? '—'} → evidence ${short(ev?.id)} with custody (sha-256 ${dg(ev?.bytes_digest)})`);
      }
      EV[k] = ev;
    }
    await recordStep('sources', { kind: 'source_contract', id: SUBSRC.id, version: SUBSRC.v, action: 'observation.source.approve' });
  }
}
// THE CONFIGURATION BASELINE (the lead captures and proposes; the onboarding authority approves and signs)
{
  let b = await q1(`select baseline_id::text id, version, state, digest, signature_id::text sig from onboarding.config_baselines where tenant_id = $1 and domain_id = $2 order by version desc limit 1`, [T, SUB.id]);
  if (b?.state === 'approved') note(`configuration baseline v${b.version} APPROVED and signed (${short(b.sig)}): stands — an earlier run`);
  else {
    if (!b) {
      const r = await call(`${BL(SUB.id)}/capture`, dm(lead, SUB.id, 'onboarding.baseline.capture', 'OCB'), { programmeId: PROG.id }, lead.token);
      if (!r.ok) fail('R. Costa captures the configuration baseline', r);
      else ok(`R. Costa CAPTURED configuration baseline v${r.body.baseline.version}: the subsidiary's version pointers (${Object.keys(r.body.baseline.pointers ?? {}).join(', ')}) — digest ${dg(r.body.baseline.digest)}`);
      b = await q1(`select baseline_id::text id, version, state, digest from onboarding.config_baselines where tenant_id = $1 and domain_id = $2 order by version desc limit 1`, [T, SUB.id]);
    }
    if (b && b.state !== 'proposed') {
      const r = await call(`${BL(SUB.id)}/${b.id}/versions/${b.version}/propose`, dm(lead, SUB.id, 'onboarding.baseline.propose', 'OCB', b.id), { digest: b.digest }, lead.token);
      if (!r.ok) fail('R. Costa proposes the baseline', r); else ok(`R. Costa PROPOSED baseline v${b.version} at its digest`);
    }
    if (b) {
      expectRefused('R. Costa (the proposer, an implementation lead) approves the baseline', await call(`${BL(SUB.id)}/${b.id}/versions/${b.version}/decide`, dm(lead, SUB.id, 'onboarding.baseline.decide', 'OCB', b.id),
        { decision: 'approve', digest: b.digest, reason: 'the lead approving its own baseline (refused)' }, lead.token), 403);
      const d = await call(`${BL(SUB.id)}/${b.id}/versions/${b.version}/decide`, dm(authority, SUB.id, 'onboarding.baseline.decide', 'OCB', b.id), { decision: 'approve', digest: b.digest,
        reason: 'the subsidiary\'s desired configuration read pointer by pointer: the attention policy, the source contract, the role census (SYNTHETIC)' }, authority.token);
      if (!d.ok) fail('J. Hartmann approves the baseline', d); else ok(`J. Hartmann APPROVED and SIGNED configuration baseline v${b.version} at digest ${dg(b.digest)} (signature ${short(d.body.baseline.signature_id ?? d.body.baseline.signature?.signature_id)})`);
    }
  }
  b = await q1(`select baseline_id::text id, version, state, digest from onboarding.config_baselines where tenant_id = $1 and domain_id = $2 and state = 'approved' order by version desc limit 1`, [T, SUB.id]);
  if (b) { await recordStep('baseline', { kind: 'config_baseline', id: b.id, version: b.version, action: 'onboarding.baseline.decide' }); ENV_OUT.EYE_B94_BASELINE_DIGEST = b.digest; }
}
// THE WAVE, THE MAPPING, THE REHEARSALS, THE CUTOVER (JRN-23)
const V1 = { key_column: 'Supplier No', columns: [
  { column: 'Supplier No', field: 'legacy_id', transforms: ['trim', 'upper'], ignore: false },
  { column: 'Supplier Name', field: 'name', transforms: ['trim', 'collapse_spaces'], ignore: false },
  { column: 'Country', field: 'country', transforms: ['iso_country'], ignore: false },
  { column: 'Risk Rating', field: 'risk_rating', transforms: ['rating_scale'], ignore: false },
  { column: 'Category', field: 'risk_category', transforms: ['trim', 'lower', 'null_if_blank'], ignore: false },
  { column: 'Annual Spend (EUR)', field: 'annual_spend_eur', transforms: ['null_if_blank', 'decimal'], ignore: false },
  { column: 'Last Review', field: 'last_review_on', transforms: ['null_if_blank', 'date_iso'], ignore: false },
] };
const V2 = { ...V1, columns: [...V1.columns, { column: 'Buyer Note', field: null, transforms: [], ignore: true }] };
const waveRow = async () => q1(`select wave_id::text id, state, held, held_reasons from onboarding.migration_waves where tenant_id = $1 and domain_id = $2 and wave_key = $3`, [T, SUB.id, WAVE_KEY]);
const mappings = async (w) => q(`select version, state, digest, signature_id::text sig from onboarding.migration_mappings where wave_id = $1 order by version`, [w]);
const rehearsals = async (w) => q(`select rehearsal_id::text id, seq, kind, mapping_version, mapping_state, counts, blocking, plan_digest, input_digest, unmapped_columns, input from onboarding.migration_rehearsals where wave_id = $1 order by seq`, [w]);
const cutovers = async (w) => q(`select cutover_id::text id, rehearsal_id::text rehearsal, state, held, held_reasons, plan_digest, execution, verified_at, activated_at, signature_id::text sig from onboarding.migration_cutovers where wave_id = $1 order by requested_at`, [w]);
const counts = (c) => `rows ${c?.rows} · mapped ${c?.mapped} · would_create ${c?.would_create} · would_match ${c?.would_match} · rejected ${c?.rejected} (missing key ${c?.rejected_missing_key}, formula cell ${c?.rejected_formula_cell}, bad value ${c?.rejected_bad_value ?? 0}) · ambiguous ${c?.ambiguous} · conflict ${c?.conflict} · unmapped columns ${c?.unmapped_columns}`;
const mgd = (s, action, objectType = 'migration_wave', objectId = null) => dm(s, SUB.id, action, objectType, objectId);
let WAVE = null; let CUT = null;
if (SUBSRC && EV.legacy && EV.corrected) {
  WAVE = await waveRow();
  if (WAVE) note(`wave ${WAVE_KEY} (${WAVE.state}${WAVE.held ? ', held' : ''}): stands — an earlier run`);
  else {
    const r = await call(`${MG(SUB.id)}/waves/open`, mgd(lead, 'onboarding.wave.open'), { programmeId: PROG.id, key: WAVE_KEY, title: 'The legacy supplier-risk register of NORDWERK Polska (SYNTHETIC)', sourceId: SUBSRC.id,
      identifierSystem: 'nwp-legacy-supplier', identifierAuthority: 'NORDWERK Polska purchasing register (SYNTHETIC)' }, lead.token);
    if (!r.ok) { fail('R. Costa opens the wave', r); } else ok(`R. Costa OPENED wave ${WAVE_KEY} into the DRAFT domain from the upload source (identifier system nwp-legacy-supplier)`);
    WAVE = await waveRow();
  }
}
if (WAVE) {
  const W = WAVE.id;
  // SUGGESTIONS (automation proposes, never approves)
  const s = await call(`${MG(SUB.id)}/waves/${W}/suggest`, mgd(lead, 'onboarding.read', 'migration_wave', W), { evidenceId: EV.legacy.id }, lead.token);
  if (!s.ok) fail('the mapping suggestions', s);
  else ((s.body.suggestions ?? []).every((x) => x.approved === false) ? ok : bad)(`the SUGGESTIONS from the legacy header (automation proposes, a human adopts): ${(s.body.suggestions ?? []).map((x) => `${x.column} → ${x.field ?? '∅'}`).join(', ')} — none pre-approved`);
  // MAPPING v1
  let ms = await mappings(W);
  if (!ms.some((m) => m.version === 1)) {
    const r = await call(`${MG(SUB.id)}/waves/${W}/mappings/propose`, mgd(lead, 'onboarding.mapping.propose', 'migration_wave', W), { spec: V1, basis: 'adopted_suggestions', rationale: 'the legacy columns mapped to the canonical supplier fields; the buyer note left out (SYNTHETIC)' }, lead.token);
    if (!r.ok) fail('R. Costa proposes mapping v1', r); else ok(`R. Costa PROPOSED mapping v1 (adopting the suggestions; key column "Supplier No") — digest ${dg(r.body.mapping.digest)}`);
    ms = await mappings(W);
  }
  const m1 = ms.find((m) => m.version === 1);
  if (m1?.state === 'proposed') {
    expectRefused('R. Costa (implementation lead) approves mapping v1', await call(`${MG(SUB.id)}/waves/${W}/mappings/1/decide`, mgd(lead, 'onboarding.mapping.approve', 'migration_wave', W), { decision: 'approve', digest: m1.digest, reason: 'the lead approving its own mapping (refused)' }, lead.token), 403);
    const d = await call(`${MG(SUB.id)}/waves/${W}/mappings/1/decide`, mgd(authority, 'onboarding.mapping.approve', 'migration_wave', W), { decision: 'approve', digest: m1.digest, reason: 'mapping v1 reviewed column by column against the register (SYNTHETIC)' }, authority.token);
    if (!d.ok) fail('J. Hartmann approves mapping v1', d); else ok(`J. Hartmann APPROVED mapping v1 ON ITS DIGEST ${dg(m1.digest)} — signed (${short(d.body.mapping.signature_id)})`);
  } else if (m1) note(`mapping v1 is ${m1.state}: stands — an earlier run`);
  await recordStep('mapping', { kind: 'migration_wave', id: W, action: 'onboarding.mapping.approve' });
  // REHEARSAL 1 — the legacy file under mapping v1
  let rs = await rehearsals(W);
  let r1 = rs.find((x) => x.kind === 'rehearsal' && x.mapping_version === 1);
  if (!r1) {
    const r = await call(`${MG(SUB.id)}/waves/${W}/rehearsals/run`, mgd(lead, 'onboarding.rehearsal.run', 'migration_wave', W), { evidenceId: EV.legacy.id, mappingVersion: 1 }, lead.token);
    if (!r.ok) fail('R. Costa runs rehearsal 1', r);
    rs = await rehearsals(W); r1 = rs.find((x) => x.kind === 'rehearsal' && x.mapping_version === 1);
    if (r1) ok(`R. Costa RAN rehearsal 1 (a deterministic dry run of the stored evidence bytes; nothing written to the graph): ${counts(r1.counts)} — ${r1.blocking} blocking; plan digest ${dg(r1.plan_digest)}`);
  } else note(`rehearsal 1 (seq ${r1.seq}): ${counts(r1.counts)}: stands — an earlier run`);
  if (r1) {
    const st = await q(`select row_no, legacy_id, disposition, reasons from onboarding.migration_staging where rehearsal_id = $1 and disposition in ('rejected', 'ambiguous', 'would_match', 'conflict') order by row_no`, [r1.id]);
    note(`THE RECONCILIATION DIFFS of rehearsal 1: ${st.map((x) => `row ${x.row_no} ${x.legacy_id ?? '(no key)'} ${x.disposition} [${(x.reasons ?? []).join('; ').slice(0, 90)}]`).join(' · ')}; unmapped column(s): ${(r1.unmapped_columns ?? []).join(', ') || 'none'}`);
    (Number(r1.blocking) > 0 ? ok : bad)(`rehearsal 1 BLOCKS (${r1.blocking} blocking rows/columns) — the wave is held on reconciliation`);
  }
  // THE CUTOVER REQUESTED ON REHEARSAL 1 — HELD
  let cs = await cutovers(W);
  if (r1 && !cs.some((c) => c.rehearsal === r1.id)) {
    const c = await call(`${MG(SUB.id)}/waves/${W}/cutover/request`, mgd(lead, 'onboarding.cutover.request', 'cutover'), { rehearsalId: r1.id }, lead.token);
    if (!c.ok) fail('R. Costa requests a cutover on rehearsal 1', c);
    else {
      (c.body.held ? ok : bad)(`R. Costa REQUESTED a cutover on rehearsal 1: HELD — ${(c.body.blocking ?? []).map((b) => `${b.kind}${b.state ? ` (${b.state})` : ''}${b.blocking !== undefined ? ` ${b.blocking}` : ''}`).join(', ')}; an onboarding.migration item raised to the subsidiary's administrator`);
      expectRefused('J. Hartmann approves the held cutover', await call(`${MG(SUB.id)}/cutovers/${c.body.cutover.cutover_id}/approve`, mgd(authority, 'onboarding.cutover.approve', 'cutover', c.body.cutover.cutover_id),
        { digest: c.body.cutover.plan_digest, reason: 'approving a held cutover (refused)' }, authority.token), 409, /migration cutover rejected \(held\)/);
      expectRefused('R. Costa executes the cutover before any approval (outside the approved plan)', await call(`${MG(SUB.id)}/cutovers/${c.body.cutover.cutover_id}/execute`, mgd(lead, 'onboarding.cutover.execute', 'cutover', c.body.cutover.cutover_id), {}, lead.token), 409);
    }
    cs = await cutovers(W);
  } else if (r1) note(`the cutover on rehearsal 1: ${cs.filter((c) => c.rehearsal === r1.id).map((c) => `${c.state}${c.held ? ' (held)' : ''}`).join(', ')}: stands — an earlier run`);
  // REMEDIATION — mapping v2 (the buyer note declared ignored); the stale digest refused; approved
  ms = await mappings(W);
  if (!ms.some((m) => m.version === 2)) {
    const r = await call(`${MG(SUB.id)}/waves/${W}/mappings/propose`, mgd(lead, 'onboarding.mapping.propose', 'migration_wave', W), { spec: V2, basis: 'manual', rationale: 'remediation: the Buyer Note column is declared ignored (free text, never migrated) (SYNTHETIC)' }, lead.token);
    if (!r.ok) fail('R. Costa proposes mapping v2', r); else ok(`R. Costa PROPOSED mapping v2 (the Buyer Note column declared IGNORED) — digest ${dg(r.body.mapping.digest)}`);
    ms = await mappings(W);
  }
  const m2 = ms.find((m) => m.version === 2);
  if (m2?.state === 'proposed') {
    expectRefused('J. Hartmann approves mapping v2 on v1\'s digest (stale)', await call(`${MG(SUB.id)}/waves/${W}/mappings/2/decide`, mgd(authority, 'onboarding.mapping.approve', 'migration_wave', W), { decision: 'approve', digest: m1.digest, reason: 'approving on the digest read before the change' }, authority.token), 409, /stale/);
    const d = await call(`${MG(SUB.id)}/waves/${W}/mappings/2/decide`, mgd(authority, 'onboarding.mapping.approve', 'migration_wave', W), { decision: 'approve', digest: m2.digest, reason: 'mapping v2 reviewed: the buyer note stays out of the register (SYNTHETIC)' }, authority.token);
    if (!d.ok) fail('J. Hartmann approves mapping v2', d); else ok(`J. Hartmann APPROVED mapping v2 on its digest ${dg(m2.digest)} — signed; v1 superseded`);
  } else if (m2) note(`mapping v2 is ${m2.state}: stands — an earlier run`);
  // REHEARSAL 2 — the corrected file under the approved v2
  rs = await rehearsals(W);
  let r2 = rs.find((x) => x.kind === 'rehearsal' && x.mapping_version === 2 && x.mapping_state === 'approved' && Number(x.blocking) === 0);
  if (!r2) {
    const r = await call(`${MG(SUB.id)}/waves/${W}/rehearsals/run`, mgd(lead, 'onboarding.rehearsal.run', 'migration_wave', W), { evidenceId: EV.corrected.id, mappingVersion: 2 }, lead.token);
    if (!r.ok) fail('R. Costa runs rehearsal 2', r);
    rs = await rehearsals(W); r2 = rs.find((x) => x.kind === 'rehearsal' && x.mapping_version === 2 && x.mapping_state === 'approved');
    if (r2) (Number(r2.blocking) === 0 ? ok : bad)(`R. Costa RAN rehearsal 2 (the CORRECTED file, mapping v2 approved): ${counts(r2.counts)} — ${r2.blocking} blocking; plan digest ${dg(r2.plan_digest)}`);
  } else note(`rehearsal 2 (seq ${r2.seq}): ${counts(r2.counts)}: stands — an earlier run`);
  await recordStep('rehearsal', { kind: 'migration_wave', id: W, action: 'onboarding.rehearsal.run' });
  await recordStep('reconciliation', { kind: 'migration_wave', id: W, action: 'onboarding.rehearsal.run' });
  // THE CUTOVER ON REHEARSAL 2 — rechecked, released, approved on its digest, executed, reconciled
  cs = await cutovers(W);
  CUT = r2 ? cs.find((c) => c.rehearsal === r2.id) ?? null : null;
  if (r2 && !CUT) {
    const c = await call(`${MG(SUB.id)}/waves/${W}/cutover/request`, mgd(lead, 'onboarding.cutover.request', 'cutover'), { rehearsalId: r2.id }, lead.token);
    if (!c.ok) fail('R. Costa requests the cutover on rehearsal 2', c);
    else ok(`R. Costa REQUESTED the cutover on rehearsal 2: ${c.body.held ? `held — ${(c.body.blocking ?? []).map((b) => b.kind).join(', ')}` : 'NOT held'}; plan digest ${dg(c.body.cutover.plan_digest)} (= rehearsal 2's)`);
    CUT = (await cutovers(W)).find((c2) => c2.rehearsal === r2.id) ?? null;
  }
  if (CUT && CUT.state === 'requested') {
    const rc = await call(`${MG(SUB.id)}/cutovers/${CUT.id}/recheck`, mgd(authority, 'onboarding.cutover.recheck', 'cutover', CUT.id), {}, authority.token);
    if (!rc.ok) fail('J. Hartmann rechecks the cutover', rc);
    else (rc.body.held === false ? ok : bad)(`J. Hartmann RECHECKED the cutover: ${rc.body.held ? `still HELD — ${(rc.body.blocking ?? []).map((b) => `${b.kind} ${b.state ?? ''}`).join(', ')}` : 'RELEASED — the owner of data.migration resolved (J. Hartmann), the mapping approved, the reconciliation clean'}`);
    expectRefused('R. Costa (implementation lead) approves the cutover', await call(`${MG(SUB.id)}/cutovers/${CUT.id}/approve`, mgd(lead, 'onboarding.cutover.approve', 'cutover', CUT.id), { digest: CUT.plan_digest, reason: 'the lead approving (refused)' }, lead.token), 403);
    expectRefused('J. Hartmann approves on rehearsal 1\'s digest (stale)', await call(`${MG(SUB.id)}/cutovers/${CUT.id}/approve`, mgd(authority, 'onboarding.cutover.approve', 'cutover', CUT.id), { digest: r1.plan_digest, reason: 'approving the earlier plan digest' }, authority.token), 409, /stale/);
    const a = await call(`${MG(SUB.id)}/cutovers/${CUT.id}/approve`, mgd(authority, 'onboarding.cutover.approve', 'cutover', CUT.id), { digest: CUT.plan_digest, reason: 'rehearsal 2 reconciles cleanly on the approved mapping; the data transfer is approved (SYNTHETIC)' }, authority.token);
    if (!a.ok) fail('J. Hartmann approves the cutover', a); else ok(`J. Hartmann (onboarding authority) APPROVED the cutover ON REHEARSAL 2's DIGEST ${dg(CUT.plan_digest)} — signed (${short(a.body.cutover?.signature_id)})`);
    CUT = (await cutovers(W)).find((c2) => c2.id === CUT.id);
  }
  if (CUT && CUT.state === 'approved') {
    const x = await call(`${MG(SUB.id)}/cutovers/${CUT.id}/execute`, mgd(lead, 'onboarding.cutover.execute', 'cutover', CUT.id), {}, lead.token);
    if (!x.ok) fail('R. Costa executes the cutover', x);
    else ok(`R. Costa EXECUTED the cutover INSIDE THE APPROVED PLAN (per-row savepoints): ${JSON.stringify(x.body.cutover.execution)}; failures ${(x.body.failures ?? []).length}`);
    expectRefused('R. Costa executes the same cutover again', await call(`${MG(SUB.id)}/cutovers/${CUT.id}/execute`, mgd(lead, 'onboarding.cutover.execute', 'cutover', CUT.id), {}, lead.token), 409, /state/);
    CUT = (await cutovers(W)).find((c2) => c2.id === CUT.id);
  }
  if (CUT && CUT.state === 'executed' && !CUT.verified_at) {
    expectRefused('N. Vogel activates the domain BEFORE the post-cutover reconciliation', await call(`${MGT}/domains/${SUB.id}/activate`, ten(vogel, 'tenancy.domain.activate', 'CID', SUB.id), { cutoverId: CUT.id }, vogel.token), 409, /held/);
    const rc = await call(`${MG(SUB.id)}/cutovers/${CUT.id}/reconcile`, mgd(lead, 'onboarding.cutover.reconcile', 'cutover', CUT.id), {}, lead.token);
    if (!rc.ok) fail('R. Costa reconciles after the cutover', rc);
    else (rc.body.held === false && rc.body.reconciliation?.equal === true ? ok : bad)(`the POST-CUTOVER RECONCILIATION: equal to rehearsal 2 ${rc.body.reconciliation?.equal} — ${JSON.stringify(rc.body.reconciliation?.counts ?? {})}`);
    CUT = (await cutovers(W)).find((c2) => c2.id === CUT.id);
  }
  if (CUT) await recordStep('cutover', { kind: 'cutover', id: CUT.id, action: 'onboarding.cutover.execute' });
  SUB = await subDomain();
  if (CUT && SUB.status === 'draft' && CUT.verified_at) {
    expectRefused('R. Costa (implementation lead) activates the domain', await call(`${MGT}/domains/${SUB.id}/activate`, ten(lead, 'tenancy.domain.activate', 'CID', SUB.id), { cutoverId: CUT.id }, lead.token), 403);
    const a = await call(`${MGT}/domains/${SUB.id}/activate`, ten(vogel, 'tenancy.domain.activate', 'CID', SUB.id), { cutoverId: CUT.id }, vogel.token);
    if (!a.ok) fail('N. Vogel activates the domain', a); else ok(`N. Vogel (tenant administrator) ACTIVATED "${SUB_NAME}": ${a.body.activation.status} — lifecycle domain.activated, bound to cutover ${short(CUT.id)}`);
    SUB = await subDomain();
  }
  {
    const lc = await q(`select event, occurred_at from tenancy.lifecycle_events where domain_id = $1 order by occurred_at`, [SUB.id]).catch(() => []);
    (SUB.status === 'active' ? ok : bad)(`the subsidiary domain is ${SUB.status.toUpperCase()}${SUB.activated_at ? ` since ${iso(SUB.activated_at)}` : ''}; its lifecycle: ${lc.map((e) => e.event).join(' → ') || '—'}`);
  }
  // THE ROLLBACK REHEARSAL (the proof the migration can be undone; nothing retired)
  if (CUT) {
    const rb = await q1(`select rollback_id::text id, plan from onboarding.migration_rollbacks where cutover_id = $1 and kind = 'rehearsal' order by recorded_at limit 1`, [CUT.id]);
    if (rb) note(`the rollback rehearsal ${short(rb.id)} (retire ${(rb.plan?.retire ?? []).length}, keep identifiers ${(rb.plan?.keep_identifiers ?? []).length}): stands — an earlier run`);
    else {
      const r = await call(`${MG(SUB.id)}/cutovers/${CUT.id}/rollback/rehearse`, mgd(lead, 'onboarding.rollback.rehearse', 'cutover', CUT.id), {}, lead.token);
      if (!r.ok) fail('R. Costa rehearses the rollback', r);
      else ok(`R. Costa REHEARSED the rollback: the plan retires ${(r.body.rollback.plan?.retire ?? []).length} migrated entities append-only, keeps ${(r.body.rollback.plan?.keep_identifiers ?? []).length} matched, the domain ${r.body.rollback.plan?.domain?.status} → ${r.body.rollback.plan?.domain?.revert_to} — digest ${dg(r.body.rollback.digest)}; nothing retired (a rehearsal)`);
    }
  }
  // THE HONEST RESIDUAL: the rating rides as provenance; no exposure is proposed at cutover
  {
    const ents = await q1(`select count(*)::int n from graph.entities_current where domain_id = $1 and lifecycle_state = 'active'`, [SUB.id]);
    const ids = await q1(`select count(*)::int n from graph.entity_identifiers where domain_id = $1 and system_key = 'nwp-legacy-supplier'`, [SUB.id]).catch(() => ({ n: '?' }));
    const prov = await q1(`select details -> 'migration' m from graph.entity_events where domain_id = $1 and event = 'entity.identified' and details -> 'migration' is not null limit 1`, [SUB.id]).catch(() => null);
    const exp = await q1(`select count(*)::int n from prediction.exposure_current where domain_id = $1`, [SUB.id]).catch(() => ({ n: '?' }));
    note(`in the subsidiary's graph: ${ents.n} active supplier entities, ${ids.n} legacy identifiers (nwp-legacy-supplier); a provenance sample: ${prov ? `${prov.m?.legacy_id} rating ${prov.m?.values?.risk_rating} (synthetic ${prov.m?.synthetic})` : '—'}`);
    (exp.n === 0 ? ok : bad)(`RESIDUAL (said): exposures are NOT proposed at cutover — each legacy risk rating rides as PROVENANCE on its entity (exposures in the subsidiary: ${exp.n}); the risk owner proposes exposures after go-live (B32's acts), never the migration`);
  }
  // ACCEPTANCE — withheld first, then accepted on the candidate digest (claim: demonstration)
  {
    const JOURNEYS = ['JRN-01', 'JRN-23']; const ROLES = ['collection_manager', 'customer_sponsor', 'domain_admin', 'implementation_lead', 'onboarding_authority'];
    const acc = await q(`select decision, claim, digest, signature_id::text sig from onboarding.migration_acceptances where wave_id = $1 order by decided_at`, [W]);
    const baselineDigest = ENV_OUT.EYE_B94_BASELINE_DIGEST ?? null;
    const cand = async () => call(`${MG(SUB.id)}/waves/${W}/acceptance/candidate`, mgd(authority, 'onboarding.read', 'migration_wave', W), { journeys: JOURNEYS, roles: ROLES, baselineDigest }, authority.token);
    if (!acc.some((a) => a.decision === 'withheld')) {
      const c = await cand();
      if (!c.ok) fail('J. Hartmann reads the acceptance candidate', c);
      else {
        note(`the acceptance CANDIDATE (claim ${c.body.claim}): mapping v${c.body.candidate?.mapping?.version}, rehearsals [${(c.body.candidate?.rehearsals ?? []).map((x) => x.seq).join(', ')}], cutover ${c.body.candidate?.cutover?.state}, licence ${JSON.stringify(c.body.candidate?.licence ?? {}).slice(0, 120)}, journeys ${JOURNEYS.join(', ')} — digest ${dg(c.body.digest)}`);
        const w = await call(`${MG(SUB.id)}/waves/${W}/acceptance/decide`, mgd(authority, 'onboarding.acceptance.decide', 'migration_wave', W), { decision: 'withhold', journeys: JOURNEYS, roles: ROLES, baselineDigest, digest: c.body.digest,
          reason: 'withheld until the subsidiary\'s administrator has walked the migrated register (SYNTHETIC persona — a demonstration)' }, authority.token);
        if (!w.ok) fail('J. Hartmann withholds acceptance', w); else ok(`J. Hartmann WITHHELD acceptance (${w.body.acceptance.decision}, claim ${w.body.acceptance.claim}, unsigned) — the domain keeps its prior safe operation`);
      }
    } else note('acceptance withheld: stands — an earlier run');
    if (!acc.some((a) => a.decision === 'accepted')) {
      const c = await cand();
      if (c.ok) {
        expectRefused('R. Costa (implementation lead) accepts', await call(`${MG(SUB.id)}/waves/${W}/acceptance/decide`, mgd(lead, 'onboarding.acceptance.decide', 'migration_wave', W), { decision: 'accept', journeys: JOURNEYS, roles: ROLES, baselineDigest, digest: c.body.digest, reason: 'the lead accepting (refused)' }, lead.token), 403);
        const a = await call(`${MG(SUB.id)}/waves/${W}/acceptance/decide`, mgd(authority, 'onboarding.acceptance.decide', 'migration_wave', W), { decision: 'accept', journeys: JOURNEYS, roles: ROLES, baselineDigest, digest: c.body.digest,
          reason: 'the migrated register walked with the subsidiary\'s administrator; the onboarding is accepted (SYNTHETIC persona — a DEMONSTRATION of the software, never a customer acceptance)' }, authority.token);
        if (!a.ok) fail('J. Hartmann accepts', a); else ok(`J. Hartmann ACCEPTED on the candidate digest ${dg(c.body.digest)}: claim ${a.body.acceptance.claim.toUpperCase()}, signed (${short(a.body.acceptance.signature_id)}) — the exact versions and digests bound`);
      }
    } else note('acceptance accepted: stands — an earlier run');
    const fin = await q1(`select decision, claim from onboarding.migration_acceptances where wave_id = $1 and decision = 'accepted'`, [W]);
    (fin?.claim === 'demonstration' ? ok : bad)(`the acceptance record's claim is "${fin?.claim}" — a SYNTHETIC persona's acceptance demonstrates the software; real customer acceptance (AT-67, PR-67-006, UX-66-006) is R2`);
    PROG = await progRow();
    (PROG.state === 'accepted' ? ok : bad)(`onboarding programme ${PROG_KEY} v${PROG.version}: ${PROG.state.toUpperCase()}`);
    const steps = await q(`select step_key, state from onboarding.steps where programme_id = $1 order by ordinal`, [PROG.id]);
    note(`its steps: ${steps.map((x) => `${x.step_key}:${x.state}`).join(' · ')}`);
  }
}

/* ── B94-4 SCENE 3 ───────────────────────────────────────────────────────────────────── */
await renewAll();
console.log(`\nB94-4 SCENE 3 (F-P7-F-05 + carryover b) — the implementation programme of "${SUB_NAME}": readiness, the gate held until the risk owner is filled, go-live signed; MET-039 v2 and the adoption measures`);
const imd = (s, action, objectType = 'IMP', objectId = null) => dm(s, SUB.id, action, objectType, objectId, 'implementation');
const imt = (s, action, objectType = 'IMP', objectId = null) => ten(s, action, objectType, objectId, 'implementation');
const impRow = async () => q1(`select programme_id::text id, version, state, digest, created_at from implementation.programmes where tenant_id = $1 and programme_key = $2 and superseded_at is null`, [T, IMP_KEY]);
let IMP = await impRow();
let RISK_OWNER = null; let GOLIVE = null;
if (SUB?.status === 'active') {
  if (IMP) note(`implementation programme ${IMP_KEY} v${IMP.version} (${IMP.state}): stands — an earlier run`);
  else {
    const r = await call(`${IMT}/programmes/open`, imt(lead, 'implementation.programme.open'), { key: IMP_KEY, title: 'NORDWERK Polska — supplier-risk workspace go-live (SYNTHETIC)', targetDomainId: SUB.id, onboardingProgrammeId: PROG.id,
      deploymentProfile: 'local-dev', plan: { objective: 'move the subsidiary\'s supplier-risk review from the spreadsheet to governed operation (SYNTHETIC)', scope: 'the subsidiary\'s supplier-risk workspace' } }, lead.token);
    if (!r.ok) fail('R. Costa opens the implementation programme', r); else ok(`R. Costa OPENED implementation programme ${IMP_KEY} v${r.body.programme.version} on the subsidiary (linked to onboarding programme ${PROG_KEY}) — digest ${dg(r.body.programme.digest)}`);
    IMP = await impRow();
    if (IMP?.state === 'planned') {
      const s = await call(`${IMT}/programmes/${IMP.id}/start`, imt(lead, 'implementation.programme.start', 'IMP', IMP.id), { expectedVersion: IMP.version, reason: 'the rollout starts after the accepted migration (SYNTHETIC)' }, lead.token);
      if (!s.ok) fail('R. Costa starts the programme', s); else ok(`the programme STARTED (v${s.body.programme.version}, ${s.body.programme.state})`);
      IMP = await impRow();
    }
  }
}
if (IMP) {
  // MILESTONES, A PRIORITY JOURNEY, A STAKEHOLDER, THE ROLE REQUIREMENT, A VALUE MEASURE (the lead)
  const ITEMS = [
    { kind: 'milestone', key: 'm-train', title: 'Decision owners trained (SYNTHETIC)', attributes: { due_on: '2026-11-15' } },
    { kind: 'milestone', key: 'm-golive', title: 'Go-live of the supplier-risk workspace (SYNTHETIC)', attributes: { due_on: '2026-12-01' } },
    { kind: 'dependency', key: 'd-train-golive', title: 'Go-live after training', attributes: { from_key: 'm-train', to_key: 'm-golive' } },
    { kind: 'stakeholder', key: 's-sponsor', title: 'The customer sponsor', attributes: { role: 'customer_sponsor', principal_id: sponsor.principalId, interest: 'owns the change' } },
    { kind: 'journey', key: 'j-supplier-review', title: 'Weekly supplier-risk review journey', attributes: { journey_ref: 'JRN-01', priority: true } },
    { kind: 'journey', key: 'j-archive', title: 'Legacy register browsing journey', attributes: { journey_ref: 'JRN-09', priority: false } },
    { kind: 'role_requirement', key: 'rr-risk-owner', title: 'A risk owner in the subsidiary', attributes: { role: 'risk_owner' } },
    { kind: 'value_measure', key: 'vm-adp001', title: 'Training completion (ADP-001)', attributes: { metric_key: 'ADP-001', cited_in_readiness: false } },
  ];
  let added = 0;
  for (const it of ITEMS) {
    if (await q1(`select 1 from implementation.programme_items where programme_id = $1 and item_key = $2 and superseded_at is null`, [IMP.id, it.key])) continue;
    const r = await call(`${IMT}/programmes/${IMP.id}/items/record`, imt(lead, 'implementation.item.record', 'IMP', IMP.id), { ...it, expectedVersion: 0 }, lead.token);
    if (!r.ok) fail(`R. Costa records the item ${it.key}`, r); else added += 1;
  }
  const items = await q(`select kind, item_key, attributes from implementation.programme_items where programme_id = $1 and superseded_at is null order by kind, item_key`, [IMP.id]);
  (items.length >= ITEMS.length ? ok : bad)(`the programme's parts${added ? ` (${added} recorded now)` : ' (stands — an earlier run)'}: ${items.map((i) => `${i.kind}:${i.item_key}${i.attributes?.priority === true ? ' (PRIORITY)' : ''}`).join(', ')}`);
  // CONTRACT v2 — the subsidiary, now ACTIVE, added as a decision cell (after the programme opened: MET-039 reads the contract current at the opening)
  {
    const rows = await contractRows();
    const cur = rows.find((r) => r.superseded_at === null) ?? rows[rows.length - 1];
    if ((cur?.decision_cells ?? []).includes(SUB.id)) note(`contract ${CONTRACT_REF} v${cur.version} names the subsidiary as a decision cell: stands — an earlier run`);
    else if (cur) {
      const r = await call(`/v1/commercial/tenants/${T}/contracts/declare`, plat(vendor, { action: 'commercial.contract.declare', objectType: 'CTR', objectId: CONTRACT_ID }), { contractId: CONTRACT_ID, contractRef: CONTRACT_REF, expectedVersion: cur.version,
        reason: 'B94: the subsidiary NORDWERK Polska, activated by its governed migration, joins the contract as a decision cell (SYNTHETIC vendor record)',
        scope: { decision_cells: [D, SUB.id], sources: [], twins: [], authorities: [{ role: 'tenant_admin', principal_id: vogel.principalId }, { role: 'domain_admin', principal_id: richter.principalId }, { role: 'domain_admin', principal_id: subAdmin.principalId }],
          environments: ['local-dev'], support_boundary: cur.support_boundary } }, vendor.token);
      if (!r.ok) fail('C. Marchetti declares contract v2', r); else ok(`C. Marchetti DECLARED contract ${CONTRACT_REF} v${r.body.contract.version}: decision cells the corridor + the subsidiary (active) — a SYNTHETIC vendor record`);
    }
    const opened = (await q1(`select min(created_at) t from implementation.programmes where programme_id = $1`, [IMP.id])).t;
    const at = await q1(`select x.version, x.effective_from from commercial.contracts x where x.tenant_id = $1 and x.declared_at <= $2 and (x.superseded_at is null or x.superseded_at > $2) order by x.effective_from limit 1`, [T, opened]);
    note(`the contract current at the programme's opening (${iso(opened)}): v${at?.version ?? '—'}, effective ${iso(at?.effective_from)} — MET-039's start`);
  }
  // THE OPERATING CADENCE of the subsidiary (its administrator)
  let CAD = await q1(`select cadence_id::text id, period, sequence from executive.cadences where tenant_id = $1 and domain_id = $2 and closed_at is null order by opened_at desc limit 1`, [T, SUB.id]);
  if (CAD) note(`the subsidiary's ${CAD.period} cadence #${CAD.sequence} is open: stands — an earlier run`);
  else {
    const r = await call(`${HOME(SUB.id)}/cadence/open`, dm(subAdmin, SUB.id, 'executive.cadence.open', 'CAD', null, 'executive'), { period: 'weekly' }, subAdmin.token);
    if (!r.ok) fail('K. Nowak opens the weekly cadence', r); else ok(`K. Nowak OPENED the subsidiary's weekly operating cadence (executive.cadences) — the cadence the go-live will name`);
    CAD = await q1(`select cadence_id::text id, period, sequence from executive.cadences where tenant_id = $1 and domain_id = $2 and closed_at is null order by opened_at desc limit 1`, [T, SUB.id]);
  }
  // THE TRAINING PATH, attested accessible (a named human ≠ the declarer)
  const PATH_KEY = 'decision-owner-onboarding';
  let path = await q1(`select path_id::text id, version, digest from implementation.training_paths where domain_id = $1 and path_key = $2 and superseded_at is null`, [SUB.id, PATH_KEY]);
  if (!path) {
    const r = await call(`${IMD(SUB.id)}/training/paths/declare`, imd(lead, 'implementation.training.path.declare'), { programmeId: IMP.id, key: PATH_KEY, title: 'Decision-owner onboarding — supplier-risk review (SYNTHETIC)', roles: ['decision_owner'],
      contentRef: 'kb://enablement/nordwerk-polska/decision-owner-onboarding/v1' }, lead.token);
    if (!r.ok) fail('R. Costa declares the training path', r); else ok(`R. Costa DECLARED the training path ${PATH_KEY} v${r.body.path.version} for decision_owner — digest ${dg(r.body.path.digest)}`);
    path = await q1(`select path_id::text id, version, digest from implementation.training_paths where domain_id = $1 and path_key = $2 and superseded_at is null`, [SUB.id, PATH_KEY]);
  } else note(`the training path ${PATH_KEY} v${path.version}: stands — an earlier run`);
  if (path) {
    const att = await q1(`select verdict, attested_by::text by from implementation.path_attestations where path_id = $1 and path_version = $2 order by attested_at desc limit 1`, [path.id, path.version]);
    if (att?.verdict === 'accessible') note(`the path is attested ACCESSIBLE by ${nm(att.by)}: stands — an earlier run`);
    else {
      expectRefused('R. Costa (the declarer, an implementation lead) attests the path', await call(`${IMD(SUB.id)}/training/paths/${path.id}/attest`, imd(lead, 'implementation.training.path.attest', 'IMP', path.id),
        { version: path.version, digest: path.digest, verdict: 'accessible', statement: 'the lead attesting its own path' }, lead.token), 403);
      const r = await call(`${IMD(SUB.id)}/training/paths/${path.id}/attest`, imd(subAdmin, 'implementation.training.path.attest', 'IMP', path.id), { version: path.version, digest: path.digest, verdict: 'accessible',
        statement: 'captioned video, keyboard-navigable slides, contrast checked; the screen-reader walk passed (SYNTHETIC)' }, subAdmin.token);
      if (!r.ok) fail('K. Nowak attests the path accessible', r); else ok(`K. Nowak ATTESTED the path ACCESSIBLE at its digest (a named human ≠ the declarer)`);
    }
    // TRAINING RECORDS for the decision owners (the lead records completion; the subject sees it)
    for (const o of [owner1, owner2]) {
      const t = await q1(`select state from implementation.training_records where path_id = $1 and path_version = $2 and subject_principal_id = $3 order by recorded_at desc limit 1`, [path.id, path.version, o.principalId]);
      if (t?.state === 'complete') { note(`${nm(o.principalId)}: training complete: stands — an earlier run`); continue; }
      const r = await call(`${IMD(SUB.id)}/training/records/record`, imd(lead, 'implementation.training.record'), { pathId: path.id, version: path.version, subject: o.principalId, state: 'complete' }, lead.token);
      if (!r.ok) fail(`R. Costa records ${nm(o.principalId)}'s training`, r); else ok(`R. Costa RECORDED ${nm(o.principalId)}'s training COMPLETE (purpose ${r.body.record.purpose}; complete | not_yet — never a score)`);
    }
    const mine = await call(`${IMD(SUB.id)}/my-records`, imd(owner1, 'implementation.self.read', 'IMP', owner1.principalId), {}, owner1.token);
    (mine.ok ? ok : bad)(`SUBJECT-VISIBLE: M. Kowalczyk reads her OWN records — training ${(mine.body?.training ?? []).map((x) => x.state).join(', ') || '—'}; competence ${(mine.body?.competence ?? []).map((x) => x.outcome).join(', ') || '—'}${mine.ok ? '' : ` (${refusalLine(mine)})`}`);
  }
  // COMPETENCE (a named enablement assessor ≠ subject)
  for (const o of [owner1, owner2]) {
    const c = await q1(`select outcome from implementation.competence_records where domain_id = $1 and competence_key = 'supplier-risk-review' and subject_principal_id = $2 order by recorded_at desc limit 1`, [SUB.id, o.principalId]);
    if (c?.outcome === 'complete') { note(`${nm(o.principalId)}: competence complete: stands — an earlier run`); continue; }
    if (o === owner1) expectRefused('R. Costa (implementation lead) records competence', await call(`${IMD(SUB.id)}/competence/record`, imd(lead, 'implementation.competence.record'), { competenceKey: 'supplier-risk-review', role: 'decision_owner', subject: o.principalId, outcome: 'complete' }, lead.token), 403);
    const r = await call(`${IMD(SUB.id)}/competence/record`, imd(assessor, 'implementation.competence.record'), { competenceKey: 'supplier-risk-review', role: 'decision_owner', subject: o.principalId, outcome: 'complete',
      note: 'ran the weekly supplier-risk review on the governed register (SYNTHETIC)' }, assessor.token);
    if (!r.ok) fail(`E. Sandberg records ${nm(o.principalId)}'s competence`, r); else ok(`E. Sandberg (enablement assessor; a named human ≠ subject) RECORDED ${nm(o.principalId)} competent in supplier-risk-review: ${r.body.record.outcome}`);
  }
  // READINESS ITEMS (the lead declares them; each is evaluated LIVE)
  const READY = [
    { key: 'role-risk-owner', kind: 'role_filled', title: 'A risk owner holds the subsidiary', spec: { role: 'risk_owner' } },
    { key: 'owner-risk', kind: 'owner_resolved', title: 'Risk ownership resolves', spec: { responsibility: 'risk.ownership' } },
    { key: 'do-training', kind: 'training_coverage', title: 'Decision owners trained', spec: { path_key: PATH_KEY, roles: ['decision_owner'] } },
    { key: 'do-access', kind: 'accessibility_attested', title: 'The decision-owner path is accessible', spec: { path_key: PATH_KEY } },
    { key: 'do-competence', kind: 'competence_coverage', title: 'Decision owners competent in the supplier-risk review', spec: { competence_key: 'supplier-risk-review', roles: ['decision_owner'] } },
  ];
  for (const it of READY) {
    if (await q1(`select 1 from implementation.readiness_items where programme_id = $1 and item_key = $2 and superseded_at is null`, [IMP.id, it.key])) continue;
    const r = await call(`${IMD(SUB.id)}/programmes/${IMP.id}/readiness/declare`, imd(lead, 'implementation.readiness.declare', 'IMP', IMP.id), it, lead.token);
    if (!r.ok) fail(`R. Costa declares the readiness item ${it.key}`, r);
  }
  note(`the readiness items: ${(await q(`select item_key, kind, blocking from implementation.readiness_items where programme_id = $1 and superseded_at is null order by declared_at`, [IMP.id])).map((i) => `${i.item_key} (${i.kind}${i.blocking ? ', blocking' : ''})`).join(', ')}`);
  const gate = async (s) => { const r = await call(`${IMD(SUB.id)}/programmes/${IMP.id}/gate/evaluate`, imd(s, 'implementation.gate.evaluate', 'IMP', IMP.id), {}, s.token); if (!r.ok) { fail(`${nm(s.principalId)} evaluates the gate`, r); return null; } return r.body.gate; };
  const priority = await q1(`select item_id::text id from implementation.programme_items where programme_id = $1 and item_key = 'j-supplier-review' and superseded_at is null`, [IMP.id]);
  IMP = await impRow();
  if (IMP.state !== 'accepted') {
    RISK_OWNER = await q1(`select p.id::text, p.login_name from identity.principals p join identity.role_bindings b on b.principal_id = p.id where b.role_code = 'risk_owner' and b.domain_id = $1 and b.revoked_at is null limit 1`, [SUB.id]);
    if (!RISK_OWNER) {
      const g = await gate(lead);
      if (g) {
        (g.state === 'held' ? ok : bad)(`THE GATE is ${String(g.state).toUpperCase()} (evaluated live, digest ${dg(g.digest)}): blocking ${(g.blocking ?? []).map((b) => `${b.kind}:${b.item_key} — ${String(b.reason ?? '').slice(0, 110)}`).join(' · ')}; raised ${(g.raised ?? []).map((x) => `${x.class} (${x.state})`).join(', ') || '—'}`);
        const body = { decision: 'approve', gateDigest: g.digest, cadenceId: CAD?.id, journeys: priority ? [priority.id] : [], reason: 'the sponsor accepts go-live' };
        expectRefused('W. Zielińska (customer sponsor) approves go-live while the gate is held', await call(`${IMD(SUB.id)}/programmes/${IMP.id}/golive/decide`, imd(sponsor, 'implementation.golive.approve', 'IMP', IMP.id), body, sponsor.token), 409, /go-live gate rejected \(held\)/);
        expectRefused('R. Costa (implementation lead) approves go-live', await call(`${IMD(SUB.id)}/programmes/${IMP.id}/golive/decide`, imd(lead, 'implementation.golive.approve', 'IMP', IMP.id), body, lead.token), 403);
      }
    }
    // THE RISK OWNER (N. Vogel creates the subsidiary's risk owner — the gap filled, never waived)
    const ro = await cast({ key: 'risk_owner', login: 'b.lewandowski', name: 'B. Lewandowski — risk owner, NORDWERK Polska (SYNTHETIC)', short: 'B. Lewandowski', role: 'risk_owner', domainId: SUB.id, where: 'the subsidiary' });
    RISK_OWNER = { id: ro.principalId, login_name: 'b.lewandowski' };
    const g2 = await gate(sponsor);
    if (g2) {
      const its = await q(`select signal_class, state from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class in ('implementation.readiness', 'responsibility.gap') order by created_at`, [T, SUB.id]);
      (g2.state === 'ready' ? ok : bad)(`THE GATE re-evaluated by the sponsor: ${String(g2.state).toUpperCase()} — ${(g2.blocking ?? []).length} blocking; risk.ownership ${(g2.items ?? []).find((i) => i.item_key === 'owner-risk')?.facts?.state ?? '—'} (B. Lewandowski); the subsidiary's readiness and gap items: ${its.map((i) => `${i.signal_class} ${i.state}`).join(', ') || '—'}`);
      if (g2.state === 'ready') {
        const d = await call(`${IMD(SUB.id)}/programmes/${IMP.id}/golive/decide`, imd(sponsor, 'implementation.golive.approve', 'IMP', IMP.id), { decision: 'approve', gateDigest: g2.digest, cadenceId: CAD?.id, journeys: priority ? [priority.id] : [],
          reason: 'the subsidiary\'s supplier-risk workspace is ready: the weekly cadence and the supplier-review journey are accepted (SYNTHETIC persona — a demonstration)' }, sponsor.token);
        if (!d.ok) fail('W. Zielińska approves go-live', d);
        else ok(`W. Zielińska (customer sponsor) APPROVED GO-LIVE at the gate digest ${dg(g2.digest)} — SIGNED (${short(d.body.decision.signature_id)}), claim ${d.body.decision.claim}; the accepted cadence ${CAD?.period} #${CAD?.sequence} and the priority journey j-supplier-review (JRN-01)`);
      }
    }
  } else {
    note(`implementation programme ${IMP_KEY} is ACCEPTED: stands — an earlier run`);
    const ro = await q1(`select p.id::text, p.login_name, p.display_name from identity.principals p join identity.role_bindings b on b.principal_id = p.id where b.role_code = 'risk_owner' and b.domain_id = $1 and b.revoked_at is null limit 1`, [SUB.id]);
    if (ro) { RISK_OWNER = ro; NAME[ro.id] = ro.display_name.split(' — ')[0]; ENV_OUT.EYE_B94_RISK_OWNER = ro.login_name; note(`the subsidiary's risk owner ${ro.display_name} (${ro.login_name}): stands — an earlier run`); }
  }
  GOLIVE = await q1(`select decision_id::text id, decided_at, claim, signature_id::text sig, acceptance from implementation.golive_decisions where programme_id = $1 and decision = 'approve'`, [IMP.id]);
  IMP = await impRow();
  (IMP.state === 'accepted' && GOLIVE?.sig ? ok : bad)(`implementation programme ${IMP_KEY} v${IMP.version}: ${IMP.state.toUpperCase()}; go-live ${short(GOLIVE?.id)} signed ${short(GOLIVE?.sig)}, claim ${GOLIVE?.claim}, ${iso(GOLIVE?.decided_at)} — boundary: ${String(GOLIVE?.acceptance?.boundary ?? '').slice(0, 160)}`);
  // the configuration baseline, read again: the subsidiary moved since its signed baseline (a drift is SHOWN, never silently absorbed)
  {
    const r = await call(`${BL(SUB.id)}/read`, dm(subAdmin, SUB.id, 'onboarding.read', 'OCB'), {}, subAdmin.token);
    if (!r.ok) fail('K. Nowak reads the configuration baseline and its drift', r);
    else note(`K. Nowak reads the subsidiary's baseline against the live configuration: ${String(r.body.drift?.state ?? '—').toUpperCase()}${(r.body.drift?.changes ?? []).length ? ` — ${(r.body.drift.changes).map((c) => `${c.section}${c.key ? `.${c.key}` : ''} ${c.change}`).join(', ')}` : ''}; the rollback plan names ${(r.body.rollback_plan ?? []).length} restoring act(s) (none performed); promoting a new baseline version is the lead's proposal and the authority's signature — not done by this act`);
  }
  // the cohort (role × wave — never a person)
  {
    let co = await q1(`select role_code, wave_key from implementation.cohorts where programme_id = $1 limit 1`, [IMP.id]);
    if (!co) {
      const r = await call(`${IMD(SUB.id)}/programmes/${IMP.id}/cohorts/declare`, imd(lead, 'implementation.cohort.declare', 'IMP', IMP.id), { dimensions: { role: 'decision_owner', wave: 'wave-1' } }, lead.token);
      if (!r.ok) fail('R. Costa declares the cohort', r); else ok('R. Costa DECLARED the cohort decision_owner × wave-1 (role × wave — never a person)');
      co = await q1(`select role_code, wave_key from implementation.cohorts where programme_id = $1 limit 1`, [IMP.id]);
    }
    const holders = await q1(`select count(distinct b.principal_id)::int n from identity.role_bindings b join identity.principals p on p.id = b.principal_id where b.role_code = 'decision_owner' and b.domain_id = $1 and b.revoked_at is null and p.status = 'active'`, [SUB.id]);
    note(`the cohort ${co?.role_code} × ${co?.wave_key}: ${holders.n} holder(s) — BELOW k = 5: an adoption share of this cohort is INDETERMINATE and is never shown (the subsidiary's adoption is not computed: the B92 definitions live in the corridor domain, where the product analytics roles are)`);
  }
}
// MET-039 v2 AND THE ADOPTION MEASURES — proposed by J. Satō, approved by M. Okonkwo (B92's routes, the corridor domain)
const an = (s, action, objectType = 'AMD', objectId = null) => dm(s, D, action, objectType, objectId, 'intelligence');
const defRows = async (key) => q(`select definition_id::text id, version, state, digest, supported, computation_key from analytics.metric_definitions where tenant_id = $1 and domain_id = $2 and metric_key = $3 order by version`, [T, D, key]);
async function defineOnce(contract, label) {
  const rows = await defRows(contract.metricKey);
  const want = rows.find((x) => x.computation_key === contract.computationKey && (x.state === 'approved' || x.state === 'proposed'));
  if (want?.state === 'approved') { note(`${label}: v${want.version} APPROVED (supported ${want.supported}): stands — an earlier run`); return want; }
  let row = want ?? null;
  if (!row) {
    const r = await call(`${A}/definitions/propose`, an(analyst, 'analytics.definition.propose'), { contract, ownerPrincipalId: owner.principalId }, analyst.token);
    if (!r.ok) { fail(`J. Satō proposes ${label}`, r); return null; }
    row = { id: r.body.definition.definition_id, version: r.body.definition.version, digest: r.body.definition.digest };
    ok(`J. Satō (product analyst) PROPOSED ${label} v${row.version} (computation ${contract.computationKey}) — digest ${dg(row.digest)}`);
  }
  const d = await call(`${A}/definitions/${row.id}/decide`, an(owner, 'analytics.definition.decide', 'AMD', row.id), { decision: 'approve', digest: row.digest,
    reason: `${label} read whole: its population, window, floor and k, its computation (SYNTHETIC demonstration)` }, owner.token);
  if (!d.ok) { fail(`M. Okonkwo approves ${label}`, d); return null; }
  ok(`M. Okonkwo (product analytics owner) APPROVED ${label} v${d.body.definition.version} at its digest${d.body.definition.superseded ? ` — v${rows.find((x) => x.state === 'approved')?.version ?? 1} SUPERSEDED` : ''}`);
  return (await defRows(contract.metricKey)).find((x) => x.version === row.version);
}
{
  const met039 = definitionsB.find((c) => c.metricKey === 'MET-039');
  const v1 = (await defRows('MET-039')).find((x) => x.version === 1);
  note(`MET-039 v1: ${v1 ? `${v1.state}, supported ${v1.supported} (its carrier was B94)` : 'absent'}`);
  await defineOnce(met039, 'MET-039 (customer time to accepted operation)');
  for (const c of ADOPTION_CONTRACTS) await defineOnce(c, `${c.metricKey} (${c.title})`);
  const after = await defRows('MET-039');
  (after.some((x) => x.state === 'approved' && x.supported === true) ? ok : bad)(`MET-039 versions: ${after.map((x) => `v${x.version} ${x.state}${x.supported ? ' supported' : ' unsupported'}`).join(', ')}`);
}
const QUARTER = (await q1(`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY') || '-Q' || to_char(clock_timestamp() at time zone 'UTC', 'Q') q`)).q;
const MONTH = (await q1(`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM') m`)).m;
const firstResult = async (key, period, since) => (await q1(`select r.result_id::text id from analytics.metric_results r join analytics.metric_definitions d on d.definition_id = r.definition_id
    where r.tenant_id = $1 and r.domain_id = $2 and r.metric_key = $3 and r.period_key = $4 and not r.preview and r.replay_of is null and r.cohort = '{}'::jsonb and d.supported
      and ($5::timestamptz is null or r.computed_at > $5) order by r.computed_at limit 1`, [T, D, key, period, since]))?.id ?? null;
async function computeOnce(key, period, since, label) {
  let id = await firstResult(key, period, since);
  if (id) note(`${label}: result ${short(id)} stands — an earlier run`);
  else {
    const r = await call(`${A}/metrics/compute`, an(analyst, 'analytics.metric.compute', 'AMR'), { metricKey: key, period }, analyst.token);
    if (!r.ok) { fail(`${label}: the computation`, r); return null; }
    id = r.body.result.result_id; ok(`${label}: J. Satō COMPUTED result ${short(id)} on definition v${r.body.result.definition_version}`);
  }
  const rd = await call(`${A}/results/${id}/read`, an(analyst, 'analytics.read', 'AMR', id), { recordsLimit: 500 }, analyst.token);
  return rd.ok ? rd.body.result : null;
}
{
  const r = await computeOnce('MET-039', QUARTER, GOLIVE?.decided_at ?? null, `MET-039 ${QUARTER} (the open quarter)`);
  if (r) {
    const inc = (r.records ?? []).filter((x) => x.role === 'included');
    const mine = (r.records ?? []).find((x) => x.record_id === IMP?.id);
    (r.state !== 'determinate' || r.value !== null ? ok : bad)(`MET-039 ${QUARTER}: ${String(r.state).toUpperCase()}${r.value !== null && r.value !== undefined ? ` ${num(r.value, 3)} ${r.unit}` : ''}, n ${r.n ?? '—'} — ${(r.reasons ?? []).join(' | ').slice(0, 300) || 'no reason'}`);
    note(`the programme's own record in the result: ${mine ? `${mine.role}${mine.reason ? ` (${mine.reason})` : ''}${mine.detail?.value !== undefined ? ` — ${num(mine.detail.value, 3)} ${mine.detail.unit} from contract v${mine.detail.contract_version} effective ${iso(mine.detail.effective_from)} to the signed go-live ${iso(mine.detail.accepted_at)}` : ''}` : 'not listed'}; included ${inc.length}`);
    note(`HONEST: ${QUARTER} is OPEN — the quarter's MET-039 is not a closed period's value; the per-programme duration above is SYNTHETIC (a demonstration contract declared minutes before the programme opened), never a customer's time to operation`);
  }
  for (const c of ADOPTION_CONTRACTS) {
    const x = await computeOnce(c.metricKey, MONTH, null, `${c.metricKey} ${MONTH} (the corridor domain)`);
    if (x) (x.state !== 'determinate' ? ok : bad)(`${c.metricKey} ${MONTH}: ${String(x.state).toUpperCase()} — ${(x.reasons ?? []).join(' | ').slice(0, 260)} (k = ${c.kMin}: below k or without a cohort, never a share)`);
  }
}

/* ── B94-3 SCENE 2, PART II ──────────────────────────────────────────────────────────── */
await renewAll();
console.log(`\nB94-3 SCENE 2, PART II — the short grant lapses on the database clock; the 4-hour grant; the diagnosis; the customer's workaround; closure confirmed by the customer`);
const sv = (s, action, objectType = 'SVC', objectId = null) => dm(s, D, action, objectType, objectId, 'service');
let GA = null;
if (CASE) {
  // THE LAPSE of the short-window grant (layer 2: the live-grant test on the database clock; layer 3: the tick's sweep)
  G1 = await grantByPurpose(G1_PURPOSE);
  if (G1 && G1.state === 'approved') {
    let waited = 0;
    for (;;) {
      const t = await q1(`select clock_timestamp() >= expires_at past, extract(epoch from expires_at - clock_timestamp())::int left from service.support_grants where grant_id = $1`, [G1.id]);
      if (t.past) break;
      if (waited === 0) note(`waiting ${Math.ceil(t.left / 60)} min for the short-window grant to reach its expiry on the database clock (${iso(G1.expires_at)}) — no clock is moved`);
      await sleep(Math.min(15_000, (t.left + 2) * 1000)); waited += 1;
    }
    await renew(engineer);
    const st = (await grantByPurpose(G1_PURPOSE)).state;
    expectRefused(`D. Brooks reads the source health after the expiry (the grant reads ${st} — ${st === 'approved' ? 'BEFORE the sweep: the live-grant test refuses it on the database clock' : 'already swept'})`, await diagnose('health'), 403, /support access rejected \(access\): grant .* (expired at|is lapsed)/);
    for (let i = 0; i < 40 && (await grantByPurpose(G1_PURPOSE)).state === 'approved'; i += 1) await sleep(15_000);
  }
  await renewAll();   // the waits outlast an access token's lifetime: every persona signs in again (the credentials are never printed)
  G1 = await grantByPurpose(G1_PURPOSE);
  (G1?.state === 'lapsed' ? ok : bad)(`the short-window grant ${short(G1?.id)}: ${String(G1?.state).toUpperCase()} at ${iso(G1?.ended_at)} — ${G1?.end_reason ?? '—'} (the attention tick's sweep / support_access.expiry timer; the engineer's sessions revoked by the after-tick hook)`);
  if (G1?.state === 'lapsed' && !(await q1(`select 1 from service.control_drills where grant_id = $1 and kind = 'expired_grant_refused'`, [G1.id]))) {
    const dr = await call(`${SA(D)}/drills/run`, dm(richter, D, 'service.drill.run', 'SDR', G1.id, 'service'), { kind: 'expired_grant_refused', grantId: G1.id, reason: 'the customer checks that a lapsed vendor grant reads nothing (SYNTHETIC drill)' }, richter.token);
    if (!dr.ok) fail('T. Richter runs the expired_grant_refused drill', dr); else ok(`T. Richter RAN the drill expired_grant_refused on ${short(G1.id)}: ${String(dr.body.drill.outcome).toUpperCase()} — probes ${(dr.body.drill.probes ?? []).map((x) => `${x.action}: ${x.live_grant === null ? 'refused' : 'LIVE'}`).join(', ')}`);
  } else if (G1) note('the expired_grant_refused drill on the lapsed grant: stands — an earlier run');
  CASE = await caseRow();
  // THE 4-HOUR GRANT
  if (CASE.state !== 'closed') {
    await renew(engineer);
    const ga = await requestAndApprove(GA_PURPOSE, ['diagnose.source', 'diagnose.runs', 'diagnose.health', 'diagnose.schedule', 'case.note', 'case.bundle', 'case.workaround'], 240, 'the 4-hour grant (diagnose.*, case acts)');
    GA = ga.g;
    await renew(engineer);
    const sr = await call(`${SV(D)}/cases/${CASE.id}/support-read`, sv(engineer, 'service.case.support_read', 'SVC', CASE.id), {}, engineer.token);
    (sr.ok ? ok : bad)(`D. Brooks READ the case under grant ${short(sr.body?.grant_id)}: ${sr.ok ? `${sr.body.case?.case_ref} ${sr.body.case?.state} (the opener's identity withheld from support)` : refusalLine(sr)}`);
    for (const what of ['source', 'runs', 'health', 'schedule']) {
      const r = await diagnose(what);
      const data = r.body?.diagnosis?.data;
      const said = what === 'source' ? `${data?.source_key} ${data?.lifecycle_state}, cadence ${data?.cadence_seconds} s`
        : what === 'runs' ? `${(data ?? []).length} run(s): ${(data ?? []).slice(0, 4).map((x) => `${iso(x.started_at).slice(0, 16)} ${x.state}${x.failure_reason ? ` (${x.failure_reason})` : ''}`).join(', ')}`
          : what === 'health' ? `${(data ?? []).length} health event(s)` : `${(data?.entries ?? []).length} scheduler entr(ies) (${(data?.entries ?? []).map((e) => e.status).join(', ')}), ${(data?.attempts ?? []).length} attempt(s)`;
      (r.ok && r.body.diagnosis?.refused === false ? ok : bad)(`support.diagnose.${what} under grant ${short(r.body?.diagnosis?.grant_id)} — logged ${short(r.body?.diagnosis?.log_id)}: ${r.ok ? said : refusalLine(r)}`);
    }
    // the engineer cannot write the customer's source state — refused by the PDP
    expectRefused('D. Brooks (support engineer) suspends the corridor source', await call(`${OBS(D)}/sources/${SRC.id}/transition`, dm(engineer, D, 'observation.source.transition', 'SRC', SRC.id, 'observation'),
      { contractVersion: SRC.v, target: 'suspended', reason: 'a support engineer trying to write the customer\'s source state' }, engineer.token), 403, /no qualifying role binding/);
    // diagnosis, a note, a redacted bundle, the workaround proposal
    let v = await caseVersion();
    if ((await caseRow()).state === 'awaiting_access') {
      const p = await call(`${SV(D)}/cases/${CASE.id}/progress`, sv(engineer, 'service.case.progress', 'SVC', CASE.id), { expectedVersion: v, to: 'diagnosing', statement: 'diagnosing the source, its runs and its scheduler under the grant (SYNTHETIC)' }, engineer.token);
      if (!p.ok) fail('D. Brooks moves the case to diagnosing', p); else ok(`${CASE.case_ref} → diagnosing (v${p.body.case.version}), under grant ${short(p.body.grant_id)}`);
    }
    const failedRun = (CASE.object_refs ?? []).find((o) => o.kind === 'run');
    const n = await call(`${SV(D)}/cases/${CASE.id}/notes`, sv(engineer, 'service.case.note', 'SVC', CASE.id), { kind: 'diagnosis',
      body: failedRun ? 'The failed run was refused at admission ("header semantics: recorded_at is in the future"); the runs since delivered. The scheduler entry is active. Proposed: the collection manager resets the schedule (suspend and re-activate) and triggers a run to confirm delivery (SYNTHETIC).'
        : 'The runs deliver on schedule; the scheduler entry is active. Proposed: the collection manager resets the schedule and triggers a run to confirm delivery (SYNTHETIC).' }, engineer.token);
    if (!n.ok) fail('D. Brooks notes the diagnosis', n); else ok(`D. Brooks NOTED the diagnosis on the case (support side, grant ${short(n.body.grant_id)})`);
    const b = await call(`${SV(D)}/cases/${CASE.id}/bundles/assemble`, sv(engineer, 'service.case.bundle', 'SVC', CASE.id), {}, engineer.token);
    if (!b.ok) fail('D. Brooks assembles the evidence bundle', b);
    else ok(`D. Brooks ASSEMBLED the evidence bundle (side ${b.body.bundle.side}, grant ${short(b.body.bundle.grant_id)}): ${(b.body.bundle.items ?? []).map((i) => `${i.kind}:${i.disposition}`).join(', ')} — digest ${dg(b.body.bundle.digest)}; ${JSON.stringify(b.body.bundle.counts ?? {})} (evidence content withheld, persons and endpoints redacted)`);
    v = await caseVersion();
    const w = await call(`${SV(D)}/cases/${CASE.id}/workaround/propose`, sv(engineer, 'service.case.workaround.propose', 'SVC', CASE.id), { expectedVersion: v,
      steps: 'The collection manager suspends and re-activates red-sea-corridor-stream (its scheduler entry re-registered), then triggers a collection to confirm delivery (SYNTHETIC)',
      act: { action: 'observation.source.transition', object_type: 'SRC', object_id: SRC.id }, risk: 'collection pauses for a moment between the two transitions' }, engineer.token);
    if (!w.ok) fail('D. Brooks proposes the workaround', w); else ok(`D. Brooks PROPOSED the workaround (${w.body.case.state}): the CUSTOMER's act observation.source.transition on ${SRC_KEY} — executed by the customer's own role, never by support`);
    // the CUSTOMER performs the governed act and links its receipt
    const tr = async (target) => { const r = await call(`${OBS(D)}/sources/${SRC.id}/transition`, dm(dvorak, D, 'observation.source.transition', 'SRC', SRC.id, 'observation'), { contractVersion: SRC.v, target, reason: `the case's workaround: ${target === 'suspended' ? 'suspend' : 're-activate'} to reset the schedule (SYNTHETIC)` }, dvorak.token); return r; };
    const s1 = await tr('suspended');
    if (!s1.ok) fail('M. Dvořák suspends the source', s1);
    const s2 = await tr('active');
    if (!s2.ok) fail('M. Dvořák re-activates the source', s2);
    const dec = await q1(`select id::text from policy.policy_decisions where correlation_id = $1 and action = 'observation.source.transition' and principal_id = $2 and decision like 'allow%' order by created_at desc limit 1`, [s2.correlationId, `principal:${dvorak.principalId}`]);
    ok(`M. Dvořák (collection manager) SUSPENDED and RE-ACTIVATED ${SRC_KEY} through the real source route (the re-activation's policy decision ${short(dec?.id)}); the source is ${(await q1(`select lifecycle_state from observation.source_contracts_current where source_id = $1 order by contract_version desc limit 1`, [SRC.id])).lifecycle_state}`);
    // the confirming run: the re-activation re-registers the scheduler entry, which starts a run at once (a manual trigger meanwhile is refused 409 — one attempt per source)
    const reactivatedAt = (await q1(`select created_at from policy.policy_decisions where id = $1`, [dec?.id ?? '00000000-0000-0000-0000-000000000000']))?.created_at ?? new Date();
    let run = null;
    for (let i = 0; i < 24; i += 1) {
      run = await q1(`select run_id::text id, state, items_admitted, items_noop, failure_reason, started_at from observation.collection_runs_current where source_id = $1 and started_at >= $2 order by started_at desc limit 1`, [SRC.id, reactivatedAt]);
      if (run && run.state !== 'running' && run.state !== 'started') break;
      await sleep(5000);
    }
    const col = { ok: run !== null, body: { run: run ? { state: run.state } : null } };
    (run && run.state === 'finished' ? ok : bad)(`the CONFIRMING RUN after the re-activation (the scheduler entry re-registered): ${run ? `${short(run.id)} ${run.state} at ${iso(run.started_at)} — ${run.items_admitted ?? 0} admitted, ${run.items_noop ?? 0} no-op${run.failure_reason ? `, ${run.failure_reason}` : ''}` : 'no run started within two minutes'}`);
    if (dec) {
      v = await caseVersion();
      const x = await call(`${SV(D)}/cases/${CASE.id}/workaround/execute`, sv(dvorak, 'service.case.workaround.execute', 'SVC', CASE.id), { expectedVersion: v, policyDecisionId: dec.id,
        note: `the schedule was reset and the confirming run ${col.ok ? col.body.run?.state : 'was refused'} (SYNTHETIC)` }, dvorak.token);
      if (!x.ok) fail('M. Dvořák records the workaround\'s execution', x); else ok(`M. Dvořák RECORDED the workaround EXECUTED — linked to her policy decision ${short(dec.id)} (${x.body.case.workaround_executed?.action})`);
    }
    v = await caseVersion();
    const rs = await call(`${SV(D)}/cases/${CASE.id}/progress`, sv(engineer, 'service.case.progress', 'SVC', CASE.id), { expectedVersion: v, to: 'resolved', statement: 'the schedule was reset by the customer and the feed delivered; no recurrence of the admission failure (SYNTHETIC)' }, engineer.token);
    if (!rs.ok) fail('D. Brooks resolves the case', rs); else ok(`${CASE.case_ref} RESOLVED by support (v${rs.body.case.version}); the closure-confirmation task opened for the customer`);
    v = await caseVersion();
    expectRefused('D. Brooks (support) closes the case', await call(`${SV(D)}/cases/${CASE.id}/close`, sv(engineer, 'service.case.close', 'SVC', CASE.id), { expectedVersion: v, outcome: 'resolved', note: 'support closing the case (refused)' }, engineer.token), 403);
    const c = await call(`${SV(D)}/cases/${CASE.id}/close`, sv(dvorak, 'service.case.close', 'SVC', CASE.id), { expectedVersion: v, outcome: 'resolved', note: 'verified: the confirming run finished and the morning review read the feed (SYNTHETIC)' }, dvorak.token);
    if (!c.ok) fail('M. Dvořák confirms the closure', c); else ok(`M. Dvořák CONFIRMED the CLOSURE (${c.body.case.state}; resolution met ${c.body.case.closure?.resolution_met}) — the customer's confirmation, never support's`);
  } else note(`case ${CASE.case_ref} is CLOSED (${CASE.version}): stands — an earlier run`);
  // THE ACCESS LOG, read back by the customer in the control center
  const cc = await call(`${SA(D)}/control-center/read`, dm(richter, D, 'service.read', 'RSM', null, 'service'), {}, richter.token);
  if (!cc.ok) fail('T. Richter reads the control center', cc);
  else ok(`THE CONTROL CENTER (T. Richter): grants ${(cc.body.grants ?? []).map((g) => `${short(g.grant_id)} ${g.status ?? g.state}`).join(', ')}; access-log rows ${(cc.body.access_log ?? []).length}; drills ${(cc.body.drills ?? []).map((d) => `${d.kind}:${d.outcome}`).join(', ')}`);
  const log = await q(`select coalesce(grant_id::text, '—') g, action, outcome, count(*)::int n from service.access_log where tenant_id = $1 and domain_id = $2 and principal_id = $3 group by 1, 2, 3 order by 1, 2, 3`, [T, D, engineer.principalId]);
  note(`the access log of D. Brooks (every act under or refused for want of a grant): ${log.map((l) => `${short(l.g)} ${l.action} ${l.outcome}×${l.n}`).join(' · ')}`);
  GA = await grantByPurpose(GA_PURPOSE);
  CASE = await caseRow();
  (CASE.state === 'closed' ? ok : bad)(`case ${CASE.case_ref}: ${CASE.state.toUpperCase()} (v${CASE.version})`);
  if (GA) note(`the 4-hour grant ${short(GA.id)} is ${GA.state}; it ${GA.state === 'approved' ? `stays live until ${iso(GA.expires_at)} and then LAPSES BY ITSELF (the sweep / the support_access.expiry timer) — nothing is revoked by this act` : `ended ${iso(GA.ended_at)} (${GA.end_reason})`}`);
  ENV_OUT.EYE_B94_CASE = CASE.case_ref;
}

/* ── B94-5 REGRESSIONS ───────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB94-5 REGRESSIONS — B92\'s operating review read back; the B33 package paths read (list, gate, health)');
{
  const rv = await q1(`select review_id::text id from analytics.operating_reviews where tenant_id = $1 and domain_id = $2 and title = 'NORDWERK corridor operating review — 2026-Q3 (SYNTHETIC)'`, [T, D]);
  if (!rv) bad('B92\'s operating review is absent');
  else {
    const r = await call(`${A}/reviews/${rv.id}/read`, dm(analyst, D, 'analytics.read', 'AOR', rv.id, 'intelligence'), {}, analyst.token);
    (r.ok && r.body.review?.state === 'closed' ? ok : bad)(`B92's operating review ${short(rv.id)}: ${r.ok ? `${r.body.review.state}, closed ${iso(r.body.review.closed_at)}, close digest ${dg(r.body.review.close_digest)}, metrics ${(r.body.review.metric_keys ?? []).join(', ')}` : refusalLine(r)}`);
  }
  const pk = (action) => dm(ivanova, D, action, 'DPK', null, 'intelligence');
  const l = await call(`/v1/tenants/${T}/domains/${D}/domain-packages/list`, pk('domain.package.read'), {}, ivanova.token);
  if (!l.ok) fail('D. Ivanova lists the domain packages', l);
  else {
    const pkgs = l.body.packages ?? [];
    ok(`D. Ivanova (domain specialist) LISTED the packages: ${pkgs.map((p) => `${p.package_key} ${p.state}${p.active_version ? ` (active v${p.active_version})` : ''}`).join(', ')}`);
    for (const p of pkgs) {
      const g = await call(`/v1/tenants/${T}/domains/${D}/domain-packages/gate`, pk('domain.package.read'), { packageKey: p.package_key }, ivanova.token);
      const state = g.body?.gate?.state ?? g.body?.state;
      const said = `the gate of ${p.package_key}: ${g.ok ? `${state}${g.body?.gate?.reason ?? g.body?.reason ? ` — ${String(g.body?.gate?.reason ?? g.body?.reason).slice(0, 160)}` : ''}` : refusalLine(g)}`;
      const exposed = await q1(`select occurred_at, coalesce(details -> 'conflict' ->> 'reason', details ->> 'reason') reason from domain.package_events where package_id = $1 and event = 'conflict.exposed' order by occurred_at desc limit 1`, [p.package_id]);
      const taxonomy = await q1(`select count(*)::int n from prediction.risk_taxonomy_activations where tenant_id = $1 and domain_id = $2`, [T, D]);
      if (!g.ok) bad(said);
      else if (state !== 'conflicted') ok(`${said} — no conflict`);
      else if (exposed && new Date(exposed.occurred_at) < new Date(tStart) && /no risk taxonomy in force|no contract in this domain/.test(String(exposed.reason)) && taxonomy.n > 0) {
        note(`FOUND (a state that PRE-DATES this act, not a B94 regression): ${said}. The conflict was exposed at ${iso(exposed.occurred_at)} by a health read that saw "no risk taxonomy in force" while ${taxonomy.n} risk-taxonomy activation(s) exist in the corridor — the known FALSE conflict of the intermittent health read (B33-H's fix, #88, landed after it). Recovery is the runbook's (§24): D. Ivanova re-runs health and re-enables through domain.package.enable — not performed by this act`);
      } else bad(`${said} — a conflict this act did not expect`);
      const fresh = await q1(`select count(*)::int n from domain.package_events where package_id = $1 and event = 'conflict.exposed' and occurred_at >= $2`, [p.package_id, new Date(tStart)]);
      (fresh.n === 0 ? ok : bad)(`${p.package_key}: no conflict exposed DURING this act (the after-tick health re-check raised ${fresh.n})`);
      const h = await q1(`select r.passed, r.ran_at, r.run_by_kind, (select string_agg(distinct f::text, '; ') from jsonb_array_elements(r.checks) c, jsonb_array_elements(coalesce(c -> 'findings', '[]'::jsonb)) f where f::text ilike '%unavailable%') unavailable
                          from domain.package_conformance_runs r where r.package_id = $1 and r.mode = 'health' order by r.ran_at desc limit 1`, [p.package_id]);
      note(`${p.package_key}: the latest health run ${h ? `${iso(h.ran_at)} by ${h.run_by_kind} — passed ${h.passed}${h.unavailable ? `; UNAVAILABLE finding(s): ${h.unavailable.slice(0, 200)}` : '; no `unavailable` finding'}` : 'none recorded'}`);
    }
  }
  note('NOT RERUN (state, not a regression): B33\'s twin scenario-element walk WRITES — a rerun answers 409 on its one-shot form (grounded 2026-10-09); B33\'s writing walk is not repeated here');
}

/* ── B94-6 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB94-6 THE STATE and the LIMITS');
{
  const n = await q1(`select (select count(*) from onboarding.programmes where tenant_id = $1)::int ob_versions, (select count(*) from onboarding.steps where tenant_id = $1)::int steps,
     (select count(*) from onboarding.migration_rehearsals where tenant_id = $1)::int rehearsals, (select count(*) from onboarding.migration_cutovers where tenant_id = $1)::int cutovers,
     (select count(*) from onboarding.migration_acceptances where tenant_id = $1)::int acceptances, (select count(*) from implementation.programmes where tenant_id = $1)::int imp_versions,
     (select count(*) from implementation.readiness_items where tenant_id = $1)::int readiness, (select count(*) from implementation.golive_decisions where tenant_id = $1)::int golive,
     (select count(*) from service.cases where tenant_id = $1)::int cases, (select count(*) from service.support_grants where tenant_id = $1)::int grants,
     (select count(*) from service.access_log where tenant_id = $1)::int access_log, (select count(*) from service.control_drills where tenant_id = $1)::int drills,
     (select count(*) from service.responsibility_matrices where tenant_id = $1)::int matrices, (select count(*) from onboarding.events where tenant_id = $1)::int ob_events,
     (select count(*) from implementation.events where tenant_id = $1)::int im_events, (select count(*) from service.events where tenant_id = $1)::int sv_events`, [T]);
  note(`in the ledgers: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const cs = await call(`${SV(D)}/customer-success/read`, dm(richter, D, 'service.read', 'SVC', null, 'service'), {}, richter.token);
  if (cs.ok) {
    const val = cs.body.success?.value ?? cs.body.success?.outcomes?.value;
    (JSON.stringify(cs.body.success ?? {}).includes('MET-040') ? ok : bad)(`customer success (the corridor): MET-040 ${JSON.stringify(val ?? cs.body.success?.met040 ?? '').slice(0, 200)} — unsupported (B76), never a value`);
  } else fail('T. Richter reads customer success', cs);
  ENV_OUT.EYE_B94_SUBSIDIARY = SUB_NAME; ENV_OUT.EYE_B94_PROGRAMME = PROG_KEY; ENV_OUT.EYE_B94_IMPLEMENTATION = IMP_KEY; ENV_OUT.EYE_B94_WAVE = WAVE_KEY;
  ENV_OUT.EYE_B94_DOMAIN_ADMIN = 't.richter'; ENV_OUT.EYE_B94_COLLECTION_MANAGER = 'm.dvorak';
  console.log('  the env lines for the walk (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${/[\s()|—]/.test(String(v)) ? `'${v}'` : v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — the software and its harnesses (phase6-{prelude,onboarding,migration,implementation,service,support}-b94). (2) DEMONSTRATED OPERATION — what RAN here through the governed routes: the premium-support licence and NORDWERK\'s first contract (SYNTHETIC vendor records by C. Marchetti); the subsidiary onboarded from a SYNTHETIC legacy spreadsheet (48 rows) through a draft domain, a signed responsibility matrix and configuration baseline, two rehearsals, a held and a released cutover, an execution inside the approved plan, the post-cutover reconciliation, the activation, a rollback rehearsal and an acceptance withheld then accepted; the implementation programme with its accessible training path, training and competence records, the gate held until the risk owner was filled, and the signed go-live naming the cadence and the priority journey; MET-039 v2 and ADP-001/-002 approved through B92\'s routes; the premium-routed case on the corridor feed\'s RECORDED condition (no stall was staged), the drilled, lapsed and 4-hour grants, the diagnosis, the refused write, the redacted bundle, the customer\'s workaround and confirmed closure. Every person here is SYNTHETIC — W. Zielińska, J. Hartmann, R. Costa, D. Brooks, K. Nowak, A. Wiśniewska, E. Sandberg, M. Kowalczyk, T. Wójcik and B. Lewandowski were created by the tenant administrator for this act; every approval, acceptance and go-live they gave DEMONSTRATES the software (claim: demonstration). (3) REAL CUSTOMER ACCEPTANCE — never claimed: AT-67/68/69, PR-67/68/69-006 and UX-66-006 need a real customer\'s signed acceptance → R2. Production admission and deployment-profile parity (IA-04-004/-006) → R1/B111 (no admission record is signed here). MET-040 stays unsupported (B76). MET-039 for the open quarter is not a closed period\'s value, and the duration it lists is a SYNTHETIC demonstration. ADP-001/-002 are INDETERMINATE (no cohort in the corridor; the subsidiary\'s cohort is below k = 5). HARNESS-PROVEN ONLY (not staged here): execution refusing a row or column outside the approved mapping (contract_changed — phase6-migration-b94; the HTTP route executes only the approved plan from the stored evidence), the xlsx refusal, the real rollback of an activated domain, the SLA breach drill and real breach escalation, known-error reuse and changes, the value review, the drift tick, the admission record (phase6-service-b94, phase6-support-b94, phase6-onboarding-b94).');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
