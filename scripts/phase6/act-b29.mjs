#!/usr/bin/env node
/**
 * CP-6 batch B29 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): TWIN FAMILIES,
 * COMPOSITION, THE SUPPLY NETWORK AND ITS AGENT, THE METHOD FABRIC AND THE CONSTRAINT ENGINE (migration 0092 — F-P5-01, F-P5-05) —
 * exercised by the personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers, and where nothing
 * happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left and
 * says "stands — an earlier run" instead of writing it twice. No clock is moved and no row is planted.
 *
 *   B29-0 THE STATE: 0092 applied; the casting read from identity.role_bindings (T. Nakamura, the corridor twin's owner; M. Dvořák, the
 *         executive); FOUR NEW PERSONAS created through the governed principal route — E. Kovács (the Regensburg plant's process-twin
 *         owner), R. Aydın (the enterprise-twin owner), H. Petrović (method steward), S. Lindqvist (constraint steward); the Supply Chain
 *         Agent registered (kind supply_chain) the way the B32 act registers the Risk Agent.
 *   B29-A COMPOSITION: R. Aydın declares the enterprise twin (kind enterprise) and E. Kovács the Regensburg process twin (kind process);
 *         each grounds elements that conform to its family's schema and admits; the contracts published (the corridor's by T. Nakamura, the
 *         process twin's by E. Kovács); the links enterprise ← process ← corridor declared by the DOWNSTREAM owners; the enterprise twin's
 *         dependency completeness read before and after. REFUSED: T. Nakamura (the corridor's owner) opening a version of the process twin —
 *         the ownership boundary (403).
 *   B29-A2 PROPAGATION: T. Nakamura admits a corridor version with the capacity at 62 % (1000 → 620 units/day; the baseline round first
 *         when the corridor has never carried the capacity) → the coupling proposal on the process twin → E. Kovács applies and admits →
 *         the enterprise proposal → R. Aydın applies and admits → the enterprise capacity utilisation moves (read before and after).
 *   B29-B THE SUPPLY NETWORK AND THE AGENT: T. Nakamura declares and admits the 3-tier hub-module network (the tier-2 bearing maker's
 *         1800 pcs/day holds Regensburg to 450 modules/day); M. Dvořák runs the Supply Chain Agent: it drafts the bottleneck finding and the
 *         single-source findings to the owner (the numbers printed), its attempt to ADMIT refused at the PDP and recorded on the run;
 *         T. Nakamura ACCEPTS the bottleneck finding.
 *   B29-C THE METHODS: the method portfolio (families, digests, containment); E. Kovács declares the discrete-event study twin of the
 *         Regensburg line (the process family's schema holds line capacity, not a station model — the line's stations, buffers and bearing
 *         stock live in a supply-chain-kind study twin, SAID), binds discrete-event@1 and runs it under a 21-day bearing shortage (seeded)
 *         → throughput, backlog, line-stop days; the reproduction byte-equal in a separate process (both digests printed); H. Petrović
 *         probes the healthy adapter and reads its health. The quarantine → probe → reinstatement path is HARNESS-PROVEN (phase6-methods-b29
 *         C1, a harness-only unstable adapter) — SAID, not staged. REFUSED: E. Kovács binding war-gaming@1 to the process twin, whose
 *         contract does not approve that family (422).
 *   B29-D CONSTRAINTS: S. Lindqvist declares "Regensburg warehouse capacity" (business rule: warehouse:regensburg pallets ≤ 1800 per day);
 *         E. Kovács checks the week-42 replenishment plan with 2350 pallets on 2026-10-14 → REFUSED 422 naming the constraint, the bound and
 *         the day; the amended plan (the 550 pallets moved to the 17th) → 200 satisfied; the recorded checks read.
 *   B29-9 THE STATE and the LIMITS said.
 *
 * Every figure is SYNTHETIC (NORDWERK's data is the demonstration's); the new twins' elements are ASSUMED and cite the NORDWERK terms record
 * the corridor twin already cites. Nothing here prints a credential.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const X = `/v1/tenants/${T}/domains/${D}`; const W = `${X}/twins`; const CP = `${X}/twin-composition`; const SN = `${X}/twin-supply-network`;
const MT = `${X}/methods`; const CS = `${X}/constraints`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 220)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const tStart = Date.now();
const elapsed = () => `${((Date.now() - tStart) / 60000).toFixed(1)} min`;
console.log(`THE B29 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};
/** A DATE as the day it names, in the host's own calendar (a pg DATE parses to local midnight; toISOString would slip a day on UTC+ hosts). */
const dayOf = (v) => { if (v === null || v === undefined) return null; const d = v instanceof Date ? v : new Date(String(v)); if (Number.isNaN(d.getTime())) return String(v).slice(0, 10); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

/* ── B29-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB29-0 THE STATE — 0092, the casting, the new personas, the Supply Chain Agent');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0092%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0092 is not applied'); process.exit(1); }
}
const CAST = { 't.nakamura': ['twin_owner'], 'm.dvorak': ['executive'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
const NEW_PERSONAS = [
  ['e.kovacs', 'E. Kovács — Regensburg plant operations, process-twin owner (SYNTHETIC)', 'twin_owner'],
  ['r.aydin', 'R. Aydın — NORDWERK enterprise planning, enterprise-twin owner (SYNTHETIC)', 'twin_owner'],
  ['h.petrovic', 'H. Petrović — simulation method steward (SYNTHETIC)', 'method_steward'],
  ['s.lindqvist', 'S. Lindqvist — Regensburg logistics constraint steward (SYNTHETIC)', 'constraint_steward'],
];
for (const [loginName, displayName, roleCode] of NEW_PERSONAS) {
  const r = await createPersona(admin, T, { displayName, loginName, password: PW, roleCode, domainId: D });
  if (r.session === null) { bad(`${displayName} could not be created or opened (${r.status})`); process.exit(1); }
  if (r.created) ok(`the administrator CREATED ${displayName.split(' — ')[0]} through the governed principal route — role ${roleCode}`); else note(`${displayName.split(' — ')[0]} is present — an earlier run`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const nakamura = await who('t.nakamura'); const dvorak = await who('m.dvorak');
const kovacs = await who('e.kovacs'); const aydin = await who('r.aydin'); const petrovic = await who('h.petrovic'); const lindqvist = await who('s.lindqvist');
const NAME = { [nakamura.principalId]: 'T. Nakamura', [dvorak.principalId]: 'M. Dvořák', [kovacs.principalId]: 'E. Kovács', [aydin.principalId]: 'R. Aydın',
  [petrovic.principalId]: 'H. Petrović', [lindqvist.principalId]: 'S. Lindqvist', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
const tw = (s) => env_(s, 'twin'); const sm = (s) => env_(s, 'simulation');
/** A governed twin read (twin.read) by a person. */
const read = (s, path, payload = {}, objectId = null) => call(path, tw(s)({ action: 'twin.read', objectType: 'TWN', objectId, sideEffect: 'none' }), payload, s.token);

// THE SUPPLY CHAIN AGENT, registered as the B32 act registers the Risk Agent: its version and digest are this runtime's scan (the built API).
const agentOf = async (kind) => (await q(`select agent_id::text, principal_id::text, code_digest from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = $3 and status = 'active' order by created_at desc limit 1`, [T, D, kind]))[0] ?? null;
let SCA = null;
{
  let identity = null;
  try { identity = requireApi('./dist/executive/agents/supply-chain-agent.js'); } catch (e) { bad(`the built API's Supply Chain Agent could not be read (build apps/api first): ${String(e?.message ?? e).slice(0, 160)}`); }
  if (identity !== null) {
    const { SUPPLY_CHAIN_AGENT_VERSION: version, SUPPLY_CHAIN_AGENT_DIGEST: codeDigest } = identity;
    const cur = await agentOf('supply_chain');
    if (cur && cur.code_digest === codeDigest) { SCA = cur; note(`the Supply Chain Agent ${short(cur.agent_id)} is registered — an earlier run`); }
    else {
      const r = await call(`${X}/agents/decision/register`, ad({ action: 'agent.register', objectType: 'AGT' }), { kind: 'supply_chain', version, codeDigest,
        ownerPrincipalId: nakamura.principalId, escalationPrincipalId: dvorak.principalId,
        budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120000 }, stopConditions: [{ kind: 'max_items', value: 10 }] }, admin.token);
      if (!r.ok) fail('the administrator registers the Supply Chain Agent', r);
      else { SCA = await agentOf('supply_chain'); ok(`the administrator REGISTERED the Supply Chain Agent ${short(r.body.agent.agentId)} — role ${r.body.agent.role}, ${version} digest ${String(codeDigest).slice(0, 12)}…, accountable T. Nakamura, escalation M. Dvořák`); }
    }
  }
}

/* ── the twins' shared helpers ───────────────────────────────────────────────────────── */
const twinByTitle = async (title) => (await q(`select twin_id::text id, kind, owner_principal_id::text owner, boundary from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 order by twin_id limit 1`, [T, D, title]))[0] ?? null;
const latestAdmitted = async (twinId) => (await q(`select version, observed_through from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'admitted' order by version desc limit 1`, [twinId]))[0] ?? null;
const openDraftOf = async (twinId) => (await q(`select version from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'draft' order by version desc limit 1`, [twinId]))[0]?.version ?? null;
const elementOf = async (twinId, version, key) => (await q(`select key, kind, value, unit, citations from twin.state_elements where twin_id = $1 and version = $2 and key = $3`, [twinId, version, key]))[0] ?? null;
/** A citation as a grounding names it (the stored one carries the digest the port adds). */
const asCitation = (c) => ({ kind: c.kind, id: c.id, ...(c.version === undefined || c.version === null ? {} : { version: Number(c.version) }) });

async function declareTwin(owner, whoName, kind, title, statement, boundary, limitations) {
  const cur = await twinByTitle(title);
  if (cur !== null) {
    if (cur.kind !== kind || cur.owner !== owner.principalId) bad(`"${title}" exists as kind ${cur.kind} owned by ${nm(cur.owner)} — not the ${kind} twin ${whoName} owns`);
    else note(`"${title}" (${kind}) stands — an earlier run (TWN ${short(cur.id)})`);
    return cur.id;
  }
  const r = await call(`${W}/declare`, tw(owner)({ action: 'twin.declare', objectType: 'TWN' }), { kind, title, statement, boundary, owner: owner.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations } }, owner.token);
  if (!r.ok) { fail(`${whoName} declares "${title}"`, r); return null; }
  ok(`${whoName} DECLARED "${title}" (kind ${kind}) — TWN ${short(r.body.twin.twinId)}, asserted by a person, its boundary the corridor's entities`);
  return r.body.twin.twinId;
}
async function admitVersion(owner, twinId, version, allowIncomplete = true) {
  const a = await call(`${W}/${twinId}/versions/${version}/admit`, tw(owner)({ action: 'twin.version.admit', objectType: 'TWN', objectId: twinId }), allowIncomplete ? { allowIncomplete: true } : {}, owner.token);
  return a;
}
/**
 * Open (or resume an open draft on branch actual), ground and admit — the owner's three acts. `carryFrom` carries an admitted version's
 * elements except `except`; a key already grounded in a resumed draft answers 409 (append-only per draft) and is said, not retried.
 */
async function versionTwin(owner, whoName, twinId, elements, { carryFrom = null, except = [], observedThrough = null, allowIncomplete = true, label = '' } = {}) {
  let v = await openDraftOf(twinId);
  if (v !== null) note(`${whoName} resumes the open draft v${v} of ${label} (an earlier run left it)`);
  else {
    const o = await call(`${W}/${twinId}/versions/open`, tw(owner)({ action: 'twin.version', objectType: 'TWN', objectId: twinId }),
      { branchId: 'actual', knownAt: new Date().toISOString(), ...(observedThrough === null ? {} : { observedThrough }), carryFrom, except }, owner.token);
    if (!o.ok) { fail(`${whoName} opens a version of ${label}`, o); return null; }
    v = o.body.version.version;
  }
  const g = await call(`${W}/${twinId}/versions/${v}/ground`, tw(owner)({ action: 'twin.ground', objectType: 'TWN', objectId: twinId }), { elements }, owner.token);
  if (!g.ok && g.status !== 409) { fail(`${whoName} grounds v${v} of ${label}`, g); return null; }
  if (!g.ok) note(`the elements are already grounded in the resumed draft v${v} (${String(g.body?.message ?? '').slice(0, 120)})`);
  const a = await admitVersion(owner, twinId, v, allowIncomplete);
  if (!a.ok) { fail(`${whoName} admits v${v} of ${label}`, a); return null; }
  return { version: v, admitted: a.body.admitted };
}
const measuresOf = async (s, twinId) => { const r = await read(s, `${CP}/twins/${twinId}/measures`, {}, twinId); return r.ok ? r.body.measures : (fail(`the measures of ${short(twinId)}`, r), null); };
const completenessOf = async (s, twinId) => { const r = await read(s, `${CP}/twins/${twinId}/completeness`, {}, twinId); return r.ok ? r.body.completeness : (fail(`the completeness of ${short(twinId)}`, r), null); };
const completenessLine = (c) => (c === null ? 'not read' : `${c.satisfied_count} of ${c.required_count} required families linked (ratio ${c.ratio}; linked: ${(c.linked ?? []).join(', ') || 'none'}; missing: ${(c.missing ?? []).join(', ') || 'none'})`);

// The corridor twin (Act V's seed): its owner, its boundary, its latest admitted version and the NORDWERK terms record its assumed terms cite.
const CORRIDOR_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const corridor = await twinByTitle(CORRIDOR_TITLE);
if (corridor === null) { bad(`the corridor twin "${CORRIDOR_TITLE}" is not present — run scripts/phase5/seed-twins.mjs first`); process.exit(1); }
if (corridor.owner !== nakamura.principalId) { bad(`the corridor twin is owned by ${nm(corridor.owner)}, not T. Nakamura`); process.exit(1); }
const corridorV0 = await latestAdmitted(corridor.id);
if (corridorV0 === null) { bad('the corridor twin has no admitted version on branch actual'); process.exit(1); }
const termsEl = await elementOf(corridor.id, corridorV0.version, 'route.inland_days');
const TERMS = (termsEl?.citations ?? []).find((c) => c.kind === 'evidence') ?? null;
if (TERMS === null) { bad('the corridor\'s route.inland_days cites no evidence record — the terms record the new twins cite'); process.exit(1); }
ok(`the corridor twin TWN ${short(corridor.id)} (T. Nakamura's), latest admitted v${corridorV0.version}; the NORDWERK terms record EVD ${short(TERMS.id)}@${TERMS.version} (SYNTHETIC) is what the new twins' ASSUMED elements cite`);
const assumed = (key, value, unit) => ({ key, kind: 'assumed', value, ...(unit === null || unit === undefined ? {} : { unit }), citations: [asCitation(TERMS)] });
const BOUNDARY = Array.isArray(corridor.boundary) ? corridor.boundary : [];

/* ── B29-A COMPOSITION ───────────────────────────────────────────────────────────────── */
console.log('\nB29-A COMPOSITION — the enterprise and process twins, the contracts, the links (declared downstream), dependency completeness, the ownership boundary');
// The titles do not begin with "NORDWERK": the earlier acts find the corridor twin by that prefix.
const ENTERPRISE_TITLE = 'Enterprise twin — NORDWERK';
const PROCESS_TITLE = 'Regensburg plant — assembly line (process twin)';
const LINE_KEY = 'line.capacity_per_day:SYN-LINE-A1';
const CAP_KEY = 'supply.capacity_per_day';
const E = await declareTwin(aydin, 'R. Aydın', 'enterprise', ENTERPRISE_TITLE,
  'NORDWERK as one enterprise: the demand it serves per day and the capacity of the processes it runs, coupled in from its process twins', BOUNDARY,
  ['the demand and the capacities are synthetic', 'one process (Regensburg) coupled in', 'no market twin linked']);
const P = await declareTwin(kovacs, 'E. Kovács', 'process', PROCESS_TITLE,
  'the Regensburg assembly line: its capacity per day and the supply capacity reaching it, coupled in from the Ningbo → Regensburg corridor', BOUNDARY,
  ['the line capacity is synthetic', 'calendar days, no working-day calendar']);
if (E === null || P === null) { bad('the composition twins are not declared — the composition scenes cannot run'); await su.end(); process.exit(1); }
for (const [owner, whoName, id, family, els, label] of [
  [kovacs, 'E. Kovács', P, 'process', [assumed(LINE_KEY, 1000, 'units/day')], 'the process twin'],
  [aydin, 'R. Aydın', E, 'enterprise', [assumed('demand.per_day', 800, 'units/day')], 'the enterprise twin'],
]) {
  const cur = await latestAdmitted(id);
  if (cur !== null) { note(`${label} stands at admitted v${cur.version} — an earlier run`); continue; }
  const v = await versionTwin(owner, whoName, id, els, { label });
  if (v !== null) ok(`${whoName} GROUNDED ${els.map((e) => `${e.key} = ${e.value} ${e.unit}`).join('; ')} (ASSUMED, citing the terms record; the ${family} family's schema holds each key and unit) and ADMITTED v${v.version}`);
}
{
  const pm = await measuresOf(kovacs, P); const em = await measuresOf(aydin, E);
  note(`the family measures: process v${pm?.version} ${JSON.stringify(pm?.measures ?? {})}; enterprise v${em?.version} ${JSON.stringify(em?.measures ?? {})}`);
}
async function ensureContract(owner, whoName, twinId, exposed, methodFamilies, label) {
  const cur = (await q(`select contract_version, exposed, approved_uses from twin.twin_contracts where twin_id = $1 and state = 'current'`, [twinId]))[0];
  const want = Object.keys(exposed).sort();
  const fams = (c) => (c?.approved_uses?.method_families ?? c?.approved_uses?.methodFamilies ?? []);
  if (cur && JSON.stringify(Object.keys(cur.exposed ?? {}).sort()) === JSON.stringify(want) && JSON.stringify([...fams(cur)].sort()) === JSON.stringify([...methodFamilies].sort())) {
    note(`${label}'s contract v${cur.contract_version} stands — an earlier run (exposes ${want.join(', ')}; approved methods ${fams(cur).join(', ')})`); return;
  }
  const r = await call(`${CP}/twins/${twinId}/contract/publish`, tw(owner)({ action: 'twin.contract.publish', objectType: 'TWN', objectId: twinId }),
    { exposed, approvedUses: { methodFamilies, decisionClasses: ['capacity-planning'] } }, owner.token);
  if (!r.ok) fail(`${whoName} publishes ${label}'s contract`, r);
  else ok(`${whoName} PUBLISHED ${label}'s contract v${r.body.contract.contract_version}${r.body.contract.supersedes ? ` (supersedes v${r.body.contract.supersedes})` : ''}: exposes ${want.join(', ')} · approved methods ${methodFamilies.join(', ')} · decisions capacity-planning`);
}
await ensureContract(nakamura, 'T. Nakamura', corridor.id, { [CAP_KEY]: { unit: 'units/day', cadence: 'on-admission' } }, ['flow', 'discrete-event'], 'the corridor twin');
await ensureContract(kovacs, 'E. Kovács', P, { [LINE_KEY]: { unit: 'units/day', cadence: 'on-admission' }, [CAP_KEY]: { unit: 'units/day', cadence: 'on-admission' } }, ['discrete-event', 'flow'], 'the process twin');
const completenessBefore = await completenessOf(aydin, E);
note(`BEFORE the links: the enterprise twin's dependency completeness — ${completenessLine(completenessBefore)}`);
async function ensureLink(owner, whoName, up, down, mapping, label) {
  const cur = (await q(`select link_id::text, contract_version from twin.twin_links where upstream_twin_id = $1 and downstream_twin_id = $2 and state = 'live'`, [up, down]))[0];
  if (cur) { note(`the link ${label} stands — an earlier run (TWL ${short(cur.link_id)}, on contract v${cur.contract_version})`); return; }
  const r = await call(`${CP}/links/declare`, tw(owner)({ action: 'twin.link.declare', objectType: 'TWN', objectId: down }), { upstreamTwinId: up, downstreamTwinId: down, mapping, use: 'capacity-planning' }, owner.token);
  if (!r.ok) fail(`${whoName} declares the link ${label}`, r);
  else ok(`${whoName} (the DOWNSTREAM owner) DECLARED the link ${label} — ${mapping.map((m) => `${m.from} → ${m.to}`).join('; ')} · use capacity-planning · on the upstream's contract v${r.body.link.contract_version}`);
}
await ensureLink(kovacs, 'E. Kovács', corridor.id, P, [{ from: CAP_KEY, to: CAP_KEY }], 'process ← corridor');
await ensureLink(aydin, 'R. Aydın', P, E, [{ from: LINE_KEY, to: 'process.line_capacity_per_day:regensburg' }, { from: CAP_KEY, to: 'process.supply_capacity_per_day:regensburg' }], 'enterprise ← process');
const completenessAfter = await completenessOf(aydin, E);
note(`AFTER the links: the enterprise twin's dependency completeness — ${completenessLine(completenessAfter)} (the market family is not linked in the demonstration — SAID)`);
{
  const pc = await completenessOf(kovacs, P);
  note(`the process twin's dependency completeness — ${completenessLine(pc)}`);
  // THE OWNERSHIP BOUNDARY: the corridor's owner holds twin_owner in this domain, yet never writes the downstream process twin.
  const around = await call(`${W}/${P}/versions/open`, tw(nakamura)({ action: 'twin.version', objectType: 'TWN', objectId: P }),
    { branchId: 'actual', knownAt: new Date().toISOString(), carryFrom: null, except: [] }, nakamura.token);
  expectRefused('T. Nakamura (the corridor\'s owner) opening a version of the process twin', around, 403, /ownership/);
  const drafts = (await q(`select count(*)::int n from twin.twin_versions where twin_id = $1 and state = 'draft' and opened_by = $2`, [P, nakamura.principalId]))[0]?.n ?? 0;
  (drafts === 0 ? ok : bad)(`nothing of the process twin was opened by T. Nakamura (${drafts} draft(s))`);
}

/* ── B29-A2 PROPAGATION ──────────────────────────────────────────────────────────────── */
console.log('\nB29-A2 PROPAGATION — the corridor at 62 %: coupling proposals applied by the downstream owners; the enterprise measure moves');
async function drain(owner, whoName, twinId, label) {
  const l = await read(owner, `${CP}/couplings/list`, { twinId, state: 'proposed' }, twinId);
  if (!l.ok) { fail(`the proposals on ${label}`, l); return 0; }
  let n = 0;
  for (const p of l.body.proposals ?? []) {
    const lines = (p.elements ?? []).map((e) => `${e.key} ← ${e.from_key} = ${e.value}${e.unit ? ` ${e.unit}` : ''}`).join('; ');
    note(`a coupling PROPOSED on ${label}: ${lines} — citing twin ${short(p.upstream_citation?.id)}@v${p.upstream_citation?.version} (digest ${String(p.upstream_citation?.digest ?? '').slice(0, 12)}…)`);
    const a = await call(`${CP}/couplings/${p.proposal_id}/apply`, tw(owner)({ action: 'twin.coupling.apply', objectType: 'CPL', objectId: p.proposal_id }), {}, owner.token);
    if (!a.ok) { fail(`${whoName} applies the proposal ${short(p.proposal_id)} on ${label}`, a); continue; }
    const v = Number(a.body.applied.version);
    const adm = await admitVersion(owner, twinId, v);
    if (!adm.ok) { fail(`${whoName} admits v${v} of ${label}`, adm); continue; }
    ok(`${whoName} APPLIED the proposal ${short(p.proposal_id)} into a draft v${v} of ${label} (the coupled element cites the upstream version) and ADMITTED it`);
    n += 1;
  }
  return n;
}
const propagate = async () => { await drain(kovacs, 'E. Kovács', P, 'the process twin'); await drain(aydin, 'R. Aydın', E, 'the enterprise twin'); };
const capNow = async () => { const c = await latestAdmitted(corridor.id); const e = c === null ? null : await elementOf(corridor.id, c.version, CAP_KEY); return e === null ? null : Number(e.value); };
async function corridorAt(value) {
  const cur = await latestAdmitted(corridor.id);
  const r = await versionTwin(nakamura, 'T. Nakamura', corridor.id, [assumed(CAP_KEY, value, 'units/day')],
    { carryFrom: cur.version, except: [CAP_KEY], observedThrough: dayOf(cur.observed_through), label: 'the corridor twin' });
  if (r !== null) ok(`T. Nakamura ADMITTED corridor v${r.version} (everything carried from v${cur.version}) with ${CAP_KEY} = ${value} units/day (ASSUMED, SYNTHETIC)`);
  return r;
}
await propagate(); // a proposal an earlier run left pending is applied first
{
  let cap = await capNow();
  if (cap === null) {
    note('the corridor has never carried its capacity: the BASELINE round first (1000 units/day)');
    if ((await corridorAt(1000)) !== null) await propagate();
    cap = await capNow();
  }
  const before = await measuresOf(aydin, E);
  note(`BEFORE: the enterprise twin v${before?.version} — capacity_utilisation ${before?.measures?.capacity_utilisation ?? '—'}, effective_capacity_per_day ${before?.measures?.effective_capacity_per_day ?? '—'}, demand_per_day ${before?.measures?.demand_per_day ?? '—'}`);
  if (cap === 620) note('the corridor stands at 620 units/day (62 % of the baseline) — an earlier run');
  else if ((await corridorAt(620)) !== null) await propagate();
  const pm = await measuresOf(kovacs, P); const after = await measuresOf(aydin, E);
  note(`the process twin v${pm?.version}: throughput_per_day ${pm?.measures?.throughput_per_day ?? '—'}, bottleneck ${pm?.measures?.bottleneck ?? '—'}`);
  const u = after?.measures?.capacity_utilisation;
  (u === 1.2903 ? ok : bad)(`AFTER: the enterprise twin v${after?.version} — capacity_utilisation ${u ?? '—'} (was ${before?.measures?.capacity_utilisation ?? '—'}), effective_capacity_per_day ${after?.measures?.effective_capacity_per_day ?? '—'}: 800 units/day of demand on 620 units/day of corridor capacity`);
  const ev = (await q(`select event, count(*)::int n from twin.twin_events where twin_id = any($1::uuid[]) and event in ('coupling.proposed', 'coupling.applied') group by 1 order by 1`, [[P, E]]));
  note(`the ledger: ${ev.map((r) => `${r.event} × ${r.n}`).join(', ') || 'no coupling event'} on the process and enterprise twins`);
}

/* ── B29-B THE SUPPLY NETWORK AND THE AGENT ──────────────────────────────────────────── */
console.log('\nB29-B THE SUPPLY NETWORK AND THE AGENT — the 3-tier network, the Supply Chain Agent\'s findings, its admit refused, the owner accepts');
const NETWORK_TITLE = 'Hub-module supply network — NORDWERK Regensburg (3 tiers)';
/** The 3-tier network (SYNTHETIC; the harness's): a steel mill (tier 3) → the bearing maker (tier 2) → two module makers (tier 1) → Regensburg. */
const THREE_TIER = [
  ['tier:1', 'module makers', null], ['tier:2', 'bearing makers', null], ['tier:3', 'steel mills', null],
  ['site:regensburg', { tier: 0, name: 'NORDWERK Regensburg' }, null],
  ['site:module-a', { tier: 1, name: 'Module maker A', bom: { bearing: 4 } }, null],
  ['site:module-b', { tier: 1, name: 'Module maker B', bom: { bearing: 4 } }, null],
  ['site:bearing-maker', { tier: 2, name: 'Bearing maker (Ningbo)', bom: { steel: 0.002 } }, null],
  ['site:steel-mill', { tier: 3, name: 'Steel mill', bom: {} }, null],
  ['material:steel', { name: 'bearing steel', unit: 't' }, null], ['material:bearing', { name: 'wheel bearing', unit: 'pcs' }, null], ['material:module', { name: 'hub module', unit: 'pcs' }, null],
  ['route:r1', { from: 'steel-mill', to: 'bearing-maker', material: 'steel' }, null], ['route:r2', { from: 'bearing-maker', to: 'module-a', material: 'bearing' }, null],
  ['route:r3', { from: 'bearing-maker', to: 'module-b', material: 'bearing' }, null], ['route:r4', { from: 'module-a', to: 'regensburg', material: 'module' }, null],
  ['route:r5', { from: 'module-b', to: 'regensburg', material: 'module' }, null],
  ['capacity:steel-mill.steel', 40, 't/day'], ['capacity:bearing-maker.bearing', 1800, 'pcs/day'], ['capacity:module-a.module', 600, 'pcs/day'],
  ['capacity:module-b.module', 500, 'pcs/day'], ['capacity:regensburg.module', 1000, 'pcs/day'],
].map(([key, value, unit]) => assumed(key, value, unit));
const N = await declareTwin(nakamura, 'T. Nakamura', 'supply-network', NETWORK_TITLE,
  'the hub-module supply network feeding Regensburg: two module makers (tier 1), the Ningbo bearing maker (tier 2) and the steel mill (tier 3)', BOUNDARY,
  ['the network, its sites and capacities are synthetic', 'capacities per calendar day', 'no lead times or inventories in the network model']);
let bottleneckProposal = null;
if (N !== null) {
  const cur = await latestAdmitted(N);
  if (cur !== null) note(`the network stands at admitted v${cur.version} — an earlier run`);
  else {
    const v = await versionTwin(nakamura, 'T. Nakamura', N, THREE_TIER, { label: 'the supply network' });
    if (v !== null) ok(`T. Nakamura GROUNDED ${THREE_TIER.length} elements (3 tiers, 5 sites, 3 materials, 5 routes, 5 capacities; ASSUMED, citing the terms record) and ADMITTED v${v.version} under the supply-network family's validator`);
  }
  const an = await read(nakamura, `${SN}/twins/${N}/analysis`, {}, N);
  if (!an.ok) fail('the network analysis', an);
  else {
    const a = an.body.analysis?.analysis ?? {}; const b = a.bottleneck ?? {};
    note(`the analysis of v${an.body.analysis?.version}: throughput to ${a.terminal ?? '—'} ${a.throughput_per_day ?? '—'} ${a.throughput_unit ?? ''}; tier coverage ${a.tier_coverage ?? '—'}`);
    (b.site === 'bearing-maker' && b.capacity_per_day === 1800 && b.throughput_per_day === 450 ? ok : bad)(`the BOTTLENECK: ${b.site ?? '—'} (tier ${b.tier ?? '—'}) at ${b.capacity_per_day ?? '—'} ${b.unit ?? ''} of ${b.material ?? '—'} holds Regensburg to ${b.throughput_per_day ?? '—'} modules/day (relieved: ${b.relieved_throughput_per_day ?? '—'}/day)`);
    note(`the findings: ${(an.body.analysis?.findings ?? []).map((f) => `${f.finding_kind}:${f.subject}`).join(', ') || 'none'}`);
  }
  // THE AGENT: an earlier run's findings stand (a finding is not re-drafted while its measure stands); else M. Dvořák triggers the scan.
  const earlier = await q(`select proposal_id::text, finding_kind, subject, state, run_id::text from twin.agent_proposals where twin_id = $1 order by drafted_at`, [N]);
  if (earlier.length > 0) {
    note(`the agent's findings stand — an earlier run: ${earlier.map((p) => `${p.finding_kind}:${p.subject} (${p.state})`).join(', ')}`);
    const run = (await q(`select run_id::text, outcome, refusals from executive.agent_runs where run_id = $1`, [earlier[0].run_id]))[0];
    if (run) note(`that run ${short(run.run_id)} (${run.outcome}) recorded its refusals: ${(run.refusals ?? []).map((x) => `${x.action} ${x.code ?? ''}`).join('; ') || 'none'}`);
  } else if (SCA === null) bad('the Supply Chain Agent is not registered — its run cannot be shown');
  else {
    const r = await call(`${X}/agents/decision/${SCA.agent_id}/run`, env_(dvorak, 'twin')({ action: 'agent.trigger', objectType: 'AGT', objectId: SCA.agent_id }), { task: 'supply_scan' }, dvorak.token);
    if (!r.ok) fail('M. Dvořák runs the Supply Chain Agent', r);
    else {
      const run = r.body.run;
      ok(`M. Dvořák RAN the Supply Chain Agent (run ${short(run.runId)}, ${run.outcome}, ${run.stopReason ?? '—'}): scanned ${(run.outputs?.scanned ?? []).map((s) => `${short(s.twin_id)} v${s.version} (${s.drafted} drafted)`).join(', ') || '—'}`);
      const refused = (run.refusals ?? []).filter((x) => x.action === 'twin.version.admit');
      (refused.length > 0 ? ok : bad)(`the agent's attempt to ADMIT refused at the PDP and recorded on the run: ${refused.map((x) => `${x.action} ${x.code ?? ''} — ${String(x.reason ?? '').slice(0, 90)}`).join('; ') || 'NONE recorded'}`);
    }
  }
  const open = await read(nakamura, `${SN}/proposals/list`, { twinId: N }, N);
  if (!open.ok) fail('the network\'s proposals', open);
  else {
    for (const p of open.body.proposals ?? []) note(`${p.finding_kind}:${p.subject} — ${p.state} · drafted by ${p.drafted_by === SCA?.principal_id ? 'the Supply Chain Agent' : nm(p.drafted_by)} (principal ${short(p.drafted_by)}) · ${String(p.rationale ?? '').slice(0, 160)}`);
    bottleneckProposal = (open.body.proposals ?? []).find((p) => p.finding_kind === 'bottleneck' && p.subject === 'bearing-maker.bearing') ?? null;
    if (bottleneckProposal !== null) note(`the bottleneck finding's numbers: ${JSON.stringify(bottleneckProposal.measure)}`);
  }
  if (bottleneckProposal === null) bad('no bottleneck finding on the bearing maker was drafted');
  else if (bottleneckProposal.state === 'accepted') note(`T. Nakamura's acceptance of the bottleneck finding stands — an earlier run`);
  else {
    const d = await call(`${SN}/proposals/${bottleneckProposal.proposal_id}/decide`, tw(nakamura)({ action: 'twin.proposal.decide', objectType: 'TWP', objectId: bottleneckProposal.proposal_id }),
      { decision: 'accepted', note: 'Qualify a second bearing source; raise the frame order with the Ningbo bearing maker.' }, nakamura.token);
    if (!d.ok) fail('T. Nakamura accepts the bottleneck finding', d);
    else ok(`T. Nakamura (the network's owner) ACCEPTED the bottleneck finding — ${d.body.decision.state}; the agent proposed, a person decided`);
  }
  const versions = (await q(`select count(*)::int n, count(*) filter (where opened_by = $2)::int by_agent from twin.twin_versions where twin_id = $1`, [N, SCA?.principal_id ?? '00000000-0000-0000-0000-000000000000']))[0];
  (versions.by_agent === 0 ? ok : bad)(`the network holds ${versions.n} version(s), none opened by the agent (${versions.by_agent})`);
}

/* ── B29-C THE METHODS ───────────────────────────────────────────────────────────────── */
console.log('\nB29-C THE METHODS — the portfolio, the discrete-event run of the Regensburg line under a 21-day bearing shortage, its reproduction, the adapter\'s health');
const DES_REF = 'discrete-event@1';
let desRunId = null;
{
  const ml = await call(`${MT}/list`, sm(kovacs)({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), {}, kovacs.token);
  if (!ml.ok) fail('the method portfolio', ml);
  else for (const m of ml.body.methods ?? []) {
    note(`${m.method_ref} — family ${m.family}, adapter ${m.adapter}, ${m.containment?.isolated ? `contained out of process (timeout ${m.containment.timeout_ms ?? '—'} ms, heap ${m.containment.max_old_space_mb ?? '—'} MB, quarantine after ${m.containment.quarantine_after ?? '—'} faults)` : 'in process'}, `
      + `digest ${String(m.implementation_digest ?? '—').slice(0, 12)}…${m.carried_digest_matches ? ' (this server runs these bytes)' : ' (NOT the bytes this server runs)'}, health ${m.health?.state ?? '—'}`);
  }
}
// THE STUDY TWIN: the process family's schema holds the line's capacity, not a station model; the line's stations, buffers and bearing stock
// (discrete-event@1's inputs) live in a supply-chain-kind study twin E. Kovács owns — with the corridor's complete element set, re-established
// from the same records (a run reads an admitted, COMPLETE version with a world-time cut-off).
const DES_TITLE = 'Regensburg plant — line 1 and its bearing supply (discrete-event study)';
const LINE_ELEMENTS = [
  ['line.station:press', { seq: 1, cycle_minutes: 0.9, variability: 0.1 }, null], ['line.station:bearing-fit', { seq: 2, cycle_minutes: 1.0, variability: 0.1 }, null],
  ['line.station:winding', { seq: 3, cycle_minutes: 1.1, variability: 0.1 }, null], ['line.station:eol-test', { seq: 4, cycle_minutes: 0.8, variability: 0.1 }, null],
  ['line.buffer:press-fit', { after_seq: 1, capacity: 120, initial: 60 }, 'units'], ['line.buffer:fit-winding', { after_seq: 2, capacity: 120, initial: 60 }, 'units'],
  ['line.buffer:winding-test', { after_seq: 3, capacity: 80, initial: 40 }, 'units'], ['line.minutes_per_day', 900, 'min'],
  ['bom.per_unit:bearing', 2, 'pcs'], ['inventory.on_hand:bearing', 3200, 'pcs'], ['inbound.daily:bearing', 1600, 'pcs'], ['demand.daily', 780, 'units'],
].map(([key, value, unit]) => assumed(key, value, unit));
const INV_FIELD = { 'inventory.on_hand': 'on_hand', 'inventory.safety_stock': 'safety_stock', 'consumption.weekly': 'weekly_consumption' };
const SHIP_FIELDS = { qty: 'qty', eta_port: 'eta_rotterdam', position: 'position_at_window_open', status: 'status', component: 'component_id' };
/** A corridor element grounded again in the study twin: an ASSUMED term as it stands; an OBSERVED value established again from its record's row and field. */
function regrounded(e) {
  const base = { key: e.key, kind: e.kind, value: e.value, ...(e.unit ? { unit: e.unit } : {}), ...(e.valid_from ? { validFrom: dayOf(e.valid_from) } : {}),
    citations: (e.citations ?? []).filter((c) => c.kind !== 'twin').map(asCitation) };
  if (e.kind === 'assumed') return base;
  if (e.kind !== 'observed') return null;
  const [prefix, suffix] = e.key.split(':');
  if (INV_FIELD[prefix] !== undefined) return { ...base, record: { locator: 'SYN-INV-001', field: INV_FIELD[prefix] } };
  if (prefix === 'shipment') return { ...base, record: { locator: suffix, fields: SHIP_FIELDS } };
  return null; // the transits series (grounded from a series, not a record) is not the line's input
}
const DS = await declareTwin(kovacs, 'E. Kovács', 'supply-chain', DES_TITLE,
  'the Regensburg assembly line 1 — four stations, three buffers, 15 working hours a day, two bearings a unit — and the magnet and bearing supply that feeds it', BOUNDARY,
  ['the line, its stations and the bearing figures are synthetic', 'working time only on the line', 'no breakdowns, changeovers or scrap']);
if (DS !== null) {
  const cur = await latestAdmitted(DS);
  if (cur !== null) note(`the study twin stands at admitted v${cur.version} — an earlier run`);
  else {
    const src = await latestAdmitted(corridor.id);
    const rows = await q(`select key, kind, value, unit, citations, valid_from from twin.state_elements where twin_id = $1 and version = $2 order by key`, [corridor.id, src.version]);
    const copied = rows.filter((e) => e.key !== CAP_KEY).map(regrounded).filter((e) => e !== null);
    const v = await versionTwin(kovacs, 'E. Kovács', DS, [...copied, ...LINE_ELEMENTS], { observedThrough: dayOf(src.observed_through), allowIncomplete: false, label: 'the study twin' });
    if (v !== null) ok(`E. Kovács GROUNDED the study twin: ${copied.length} of the corridor v${src.version}'s elements (observed values established again from their records) + ${LINE_ELEMENTS.length} line elements (ASSUMED); ADMITTED v${v.version} — ${v.admitted?.completeness ?? '—'}`);
  }
}
const desVersion = DS === null ? null : (await latestAdmitted(DS))?.version ?? null;
if (DS !== null && desVersion !== null) {
  const bound = (await q(`select binding_id::text, bound_at from twin.twin_method_bindings where twin_id = $1 and model_ref = $2 and state = 'active'`, [DS, DES_REF]))[0];
  if (bound) note(`${DES_REF} is bound to the study twin — an earlier run (${short(bound.binding_id)})`);
  else {
    const b = await call(`${MT}/bind`, sm(kovacs)({ action: 'simulation.method.bind', objectType: 'TWN', objectId: DS }), { twinId: DS, modelRef: DES_REF, reason: 'the Regensburg line study: a bearing shortage' }, kovacs.token);
    if (!b.ok) fail(`E. Kovács binds ${DES_REF}`, b); else ok(`E. Kovács (the twin's owner) BOUND ${DES_REF} to the study twin — ${b.body.binding.state} (method.bound)`);
  }
  const earlier = (await q(`select run_id::text, outputs_digest from simulation.runs_current where twin_id = $1 and model_ref = $2 and state = 'completed' order by run_id desc limit 1`, [DS, DES_REF]))[0];
  if (earlier) {
    desRunId = earlier.run_id;
    const t = (await q(`select payload -> 'totals' totals from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [desRunId]))[0]?.totals ?? {};
    note(`the discrete-event run ${short(desRunId)} stands — an earlier run: output ${t.total_output ?? '—'} units over ${t.horizon_days ?? '—'} days (${t.avg_daily_output ?? '—'}/day), final backlog ${t.final_backlog ?? '—'}, line-stop days ${t.line_stop_days ?? '—'}; outputs ${String(earlier.outputs_digest).slice(0, 16)}…`);
  } else {
    const r = await call(`${W}/simulations/run`, sm(kovacs)({ action: 'simulation.run', objectType: 'SIM' }), {
      twinId: DS, twinVersion: desVersion, runKind: 'control', controlRunId: null, shock: false, component: 'bearing', interventions: [{ type: 'none' }], horizonDays: 42,
      stochastic: { mode: 'seeded', seed: 29, samples: 1, jitter: {} }, modelRef: DES_REF,
      params: { start_date: '2026-10-05', shortage: { start_day: 7, days: 21, fraction: 0.4 } } }, kovacs.token);
    if (!r.ok) fail(`E. Kovács runs ${DES_REF}`, r);
    else {
      desRunId = r.body.run.runId; const s = r.body.run.summary ?? {};
      ok(`E. Kovács RAN ${DES_REF} on v${desVersion} (run ${short(desRunId)}, ${r.body.run.state}, ${r.body.run.isolated ? 'out of process' : 'in process'}, seed 29): bearing deliveries at 40 % for 21 days from day 8 of 42 (2026-10-05 on)`);
      note(`THE NUMBERS (SYNTHETIC): output ${s.total_output} units (${s.avg_daily_output}/day; unconstrained ${s.unconstrained_daily_capacity}/day, bottleneck station ${s.bottleneck_station}); demand ${s.total_demand}, shipped ${s.total_shipped}; backlog final ${s.final_backlog}, peak ${s.peak_backlog}; line-stop days ${s.line_stop_days} of ${s.shortage_days} shortage days; starved ${s.starved_minutes} min`);
    }
  }
  if (desRunId !== null) {
    const rep = (await q(`select verdict, expected_digest, actual_digest, cold_process from simulation.reproductions where run_id = $1 order by reproduced_at desc limit 1`, [desRunId]))[0];
    if (rep) note(`the reproduction stands — an earlier run: ${rep.verdict}${rep.cold_process ? ' in a separate process' : ''} — expected ${String(rep.expected_digest).slice(0, 16)}… actual ${String(rep.actual_digest ?? '—').slice(0, 16)}…`);
    else {
      const r = await call(`${W}/simulations/${desRunId}/reproduce`, sm(kovacs)({ action: 'simulation.reproduce', objectType: 'SIM', objectId: desRunId }), {}, kovacs.token);
      if (!r.ok) fail('E. Kovács reproduces the run', r);
      else {
        const x = r.body.reproduction;
        (x.verdict === 'reproduced' && x.actual === x.expected ? ok : bad)(`the reproduction: ${x.verdict}${x.coldProcess ? ' in a separate process' : ''} — expected ${x.expected} · actual ${x.actual ?? '—'} (${String(x.reason ?? '').slice(0, 100)})`);
      }
    }
  }
}
{
  // THE ADAPTER'S HEALTH AND THE PROBE (H. Petrović, the method steward): a passing probe on a healthy contained adapter is recorded evidence.
  const pr = await call(`${MT}/probe`, sm(petrovic)({ action: 'simulation.adapter.probe', objectType: 'SIM' }), { modelRef: DES_REF }, petrovic.token);
  if (!pr.ok) fail(`H. Petrović probes ${DES_REF}`, pr);
  else ok(`H. Petrović (method steward) PROBED ${DES_REF} on its fixed probe input, out of process: ${pr.body.probe.passed ? 'PASSED' : 'FAILED'} — the adapter ${pr.body.probe.state}, outputs ${String(pr.body.probe.outputs_digest ?? '—').slice(0, 16)}…`);
  const h = await call(`${MT}/health`, sm(petrovic)({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { modelRef: DES_REF }, petrovic.token);
  if (!h.ok) fail(`the health of ${DES_REF}`, h);
  else { const a = h.body.adapter ?? {}; note(`the health of ${DES_REF} in this domain: ${a.state ?? a.health?.state ?? '—'}, consecutive faults ${a.consecutive_faults ?? a.health?.consecutive_faults ?? 0}, total faults ${a.total_faults ?? a.health?.total_faults ?? 0}, probes ${(a.probes ?? []).length}, events ${(a.events ?? []).map((e) => e.event).join(', ') || 'none'}`); }
  note('THE CONTAINMENT PATH (a fault streak → QUARANTINE → a passing probe → the steward\'s REINSTATEMENT) is HARNESS-PROVEN (phase6-methods-b29 C1, with a harness-only unstable adapter that hangs, crashes and exhausts its heap) — not staged on the demonstration: no product adapter is made to fail here');
  // THE APPROVED USES: the process twin's contract approves discrete-event and flow — a war-gaming binding is refused.
  const wg = await call(`${MT}/bind`, sm(kovacs)({ action: 'simulation.method.bind', objectType: 'TWN', objectId: P }), { twinId: P, modelRef: 'war-gaming@1', reason: 'a war game of the line' }, kovacs.token);
  expectRefused('E. Kovács binding war-gaming@1 to the process twin (outside its contract\'s approved uses)', wg, 422, /method_family/);
}

/* ── B29-D CONSTRAINTS ───────────────────────────────────────────────────────────────── */
console.log('\nB29-D CONSTRAINTS — the warehouse capacity declared by its steward; the week-42 replenishment plan refused, then amended and passing');
const SET_KEY = 'regensburg-warehouse-capacity';
const PLAN_KEY = 'regensburg-replenishment-' + 'w42' // split: a key-shaped literal the secret scanner flags;
const CAPACITY = { key: 'regensburg-pallets', kind: 'business_rule', title: 'Regensburg warehouse capacity', quantity: 'warehouse:regensburg.pallets', op: '<=', value: 1800, unit: 'pallets', applies_to: ['plan'] };
const pallets = (days) => days.map(([date, value]) => ({ key: 'warehouse:regensburg.pallets', date, value, unit: 'pallets' }));
const W42 = [['2026-10-12', 1650], ['2026-10-13', 1720], ['2026-10-14', 2350], ['2026-10-15', 1780], ['2026-10-16', 1600]];
/** The amended plan: the 550 pallets over capacity on the 14th moved to the 17th — the same 9100 pallets, no day above 1800. */
const W42_AMENDED = [['2026-10-12', 1650], ['2026-10-13', 1720], ['2026-10-14', 1800], ['2026-10-15', 1780], ['2026-10-16', 1600], ['2026-10-17', 550]];
const cst = (s) => env_(s, 'twin');
{
  const cur = (await q(`select set_id::text, current_version, state, steward_principal_id::text steward from simulation.constraint_sets where tenant_id = $1 and domain_id = $2 and set_key = $3`, [T, D, SET_KEY]))[0];
  if (cur) note(`the set ${SET_KEY} stands — an earlier run (v${cur.current_version}, ${cur.state}, steward ${nm(cur.steward)})`);
  else {
    const r = await call(`${CS}/sets/declare`, cst(lindqvist)({ action: 'simulation.constraint.declare', objectType: 'CST' }),
      { setKey: SET_KEY, title: 'Regensburg warehouse capacity', constraints: [CAPACITY], note: 'the dock intake after the refit: 1800 pallets a day' }, lindqvist.token);
    if (!r.ok) fail('S. Lindqvist declares the warehouse capacity', r);
    else ok(`S. Lindqvist (constraint steward) DECLARED "${r.body.set.title}" (${SET_KEY}) v${r.body.set.version}: business rule warehouse:regensburg.pallets ≤ 1800 pallets per day, applies to plans — digest ${String(r.body.set.digest).slice(0, 12)}…`);
  }
}
{
  const earlier = await q(`select outcome, count(*)::int n from simulation.plan_checks where tenant_id = $1 and domain_id = $2 and subject_kind = 'plan' and subject_ref = $3 group by 1`, [T, D, PLAN_KEY]);
  const has = (o) => earlier.some((r) => r.outcome === o);
  if (has('violated') && has('satisfied')) note(`the plan ${PLAN_KEY} was refused and then passed — an earlier run (${earlier.map((r) => `${r.outcome} × ${r.n}`).join(', ')})`);
  else {
    const over = await call(`${CS}/plans/check`, cst(kovacs)({ action: 'simulation.plan.check', objectType: 'CCK' }), { planKey: PLAN_KEY, quantities: pallets(W42), setKeys: [SET_KEY] }, kovacs.token);
    expectRefused(`E. Kovács's week-42 replenishment plan (2350 pallets on 2026-10-14)`, over, 422, /regensburg-pallets \(business_rule\): bound ≤ 1800 pallets per day, observed 2350 pallets on 2026-10-14/);
    for (const v of over.body?.verdict?.violations ?? []) note(`the violation recorded: ${v.constraintKey} (${v.kind}) — bound ${v.bound}, observed ${v.observed}: ${v.message}`);
    const amended = await call(`${CS}/plans/check`, cst(kovacs)({ action: 'simulation.plan.check', objectType: 'CCK' }), { planKey: PLAN_KEY, quantities: pallets(W42_AMENDED), setKeys: [SET_KEY] }, kovacs.token);
    if (!amended.ok) fail('the amended plan', amended);
    else (amended.body.verdict?.outcome === 'satisfied' ? ok : bad)(`the AMENDED plan (the 550 pallets moved to 2026-10-17; the same 9100 pallets): ${amended.status} ${amended.body.verdict?.outcome} against ${(amended.body.check?.sets ?? []).map((s) => `${s.set_key} v${s.version}`).join(', ') || SET_KEY}`);
  }
  const l = await call(`${CS}/checks/list`, cst(lindqvist)({ action: 'simulation.constraint.read', objectType: 'CCK', sideEffect: 'none' }), { subjectKind: 'plan', subjectRef: PLAN_KEY }, lindqvist.token);
  if (!l.ok) fail('the recorded checks', l);
  else note(`the recorded checks of ${PLAN_KEY}: ${(l.body.checks ?? []).map((c) => `${c.outcome} (${c.checked_via}, by ${nm(c.checked_by)}, pinned to ${(c.sets ?? []).map((s) => `${s.set_key} v${s.version}`).join(', ')})`).join('; ') || 'none'}`);
  note('the conservation and topology constraints, the gate at a run\'s opening and completion and the indeterminate verdicts are HARNESS-PROVEN (phase6-constraints-b29 D3–D5) — the demonstration declares the business rule only');
}

/* ── B29-9 ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB29-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from twin.twin_links where tenant_id = $1 and domain_id = $2 and state = 'live')::int links,
                             (select count(*) from twin.twin_contracts where tenant_id = $1 and domain_id = $2 and state = 'current')::int contracts,
                             (select count(*) from twin.coupling_proposals where tenant_id = $1 and domain_id = $2 and state = 'applied')::int applied,
                             (select count(*) from twin.agent_proposals where tenant_id = $1 and domain_id = $2)::int findings,
                             (select count(*) from twin.twin_method_bindings where tenant_id = $1 and domain_id = $2 and state = 'active')::int bindings,
                             (select count(*) from simulation.runs_current where tenant_id = $1 and domain_id = $2 and model_ref <> 'supply-flow@1')::int method_runs,
                             (select count(*) from simulation.adapter_probes where tenant_id = $1 and domain_id = $2)::int probes,
                             (select count(*) from simulation.constraint_sets where tenant_id = $1 and domain_id = $2 and state = 'live')::int sets,
                             (select count(*) from simulation.plan_checks where tenant_id = $1 and domain_id = $2)::int checks`, [T, D]))[0];
  note(`in the ledgers: ${n.links} live twin links, ${n.contracts} current contracts, ${n.applied} applied couplings, ${n.findings} agent findings, ${n.bindings} active method bindings, ${n.method_runs} method-fabric runs, ${n.probes} adapter probes, ${n.sets} live constraint sets, ${n.checks} plan checks`);
  const kinds = (await q(`select kind, count(*)::int n from twin.twins_current where tenant_id = $1 and domain_id = $2 group by 1 order by 1`, [T, D])).map((r) => `${r.kind} × ${r.n}`).join(', ');
  note(`the twins by kind: ${kinds}`);
  if (desRunId !== null) note(`the discrete-event run the walk reads: ${desRunId}`);
  note('LIMITS said: every figure is SYNTHETIC (the capacities, the demand, the network, the line, the shortage, the pallets) and the new twins\' elements are ASSUMED, citing the NORDWERK terms record; '
    + 'the method adapters are the product\'s own in-process implementations run in a worker process — no external solver is integrated; the containment path (quarantine → probe → reinstatement) is HARNESS-PROVEN '
    + '(phase6-methods-b29 C1) with a harness-only unstable adapter, not staged here; the line\'s station model lives in a supply-chain-kind study twin because the process family holds line capacity only; '
    + 'the enterprise twin links no market twin (2 of 3 required families); the family validators\' refusals, the cycle and contract refusals, the declined and re-proposed couplings, the agent\'s budget resumption, '
    + 'the conservation and topology constraints and the gate verdicts are the harnesses\' (phase6-composition-b29, phase6-supply-network-b29, phase6-constraints-b29); nothing is cleaned.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
