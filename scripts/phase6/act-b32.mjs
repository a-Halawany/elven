#!/usr/bin/env node
/**
 * CP-6 batch B32 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE STRATEGY GRAPH'S
 * CAPABILITIES, INITIATIVES, RESOURCES, MEASURES AND STAKEHOLDERS WITH ALIGNMENT (F-P6-09), RISK AND OPPORTUNITY INTELLIGENCE (F-P4-13) and
 * THE DECOMPOSABLE STRATEGIC HEALTH SCORE (F-P6-08) — migration 0089 — exercised by the personas through the REAL HTTP path, each scene
 * stating the effect it produced in the ledgers, and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME by SQL against
 * the database the act is pointed at: no id is hard-coded. No clock is moved, no reading planted and no test hook used: the measure reading is
 * A. Hoffmann's, entered now for the day it was taken (nine days ago); the corridor indicator's evaluations are the ones the demonstration's
 * PortWatch series already produced.
 *
 *   B32-0 THE STATE: 0089 applied; the register (50 / 0 / 0 — B32 adds no interface); the casting read from identity.role_bindings; the RISK
 *         OWNER C. Brenner created through the governed principal route (risk_owner); ONE act outside the governed routes, DISCLOSED (as
 *         seed-decisions.mjs did for Phase 6): Phase 0 offers no governed route that binds a SECOND role to an existing human (and Phase 0 is
 *         frozen, C14) — C. Brenner's strategy_owner and decision_owner (the mitigation decision is two further governed writes under their
 *         session) and L. Brandt's opportunity_sponsor and strategy_owner (the sponsorship opens the evaluation the same way) are bound by the
 *         administrator through the database controller (identity.role_bindings), exactly as the harness fixtures bind them.
 *   B32-G F-P6-09: J. Weber declares "On-time delivery 95%" and links it to the Regensburg assembly CAPABILITY, the dual-sourcing INITIATIVE
 *         (built on the capability, resourced by the bearings budget), the Regensburg line workforce (a STAKEHOLDER) and the on-time delivery
 *         MEASURE — each resting on claims the NORDWERK records' extraction admitted; A. Hoffmann enters the measure's reading of nine days ago;
 *         M. Dvořák, the executive, sets the objective, approves the measure and allocates the resource (J. Weber's own act refused — the
 *         declarer); the GAP VIEW shows the capability UNDER-EVIDENCED and the measure STALE; the DETECTIONS route the stale measure.
 *   B32-R F-P4-13 (risk): M. Dvořák publishes the risk taxonomy and approves the supply-chain APPETITE (EUR 250k residual); C. Brenner
 *         declares "Corridor closure — Regensburg line" (driven by the Bab el-Mandeb transit the shipment record gives); A. Hoffmann registers
 *         and assesses it; the consequence PREVIEWED; J. Weber's acceptance refused (not the risk owner); C. Brenner ACCEPTS — the residual
 *         breaches the appetite → a warning candidate; N. Eriksen processes the candidates → ONE warning of origin `exposure`, routed to
 *         C. Brenner, who acknowledges it; a control lowers the residual; C. Brenner OPENS THE MITIGATION DECISION (a DEC and its package).
 *   B32-O F-P4-13 (opportunity): L. Brandt declares "Alternative supplier in Morocco" (the SAME corridor driver), registers it with C. Brenner
 *         as its owner, states its hypothesis (value range, falsifier, the capability it needs); A. Hoffmann assesses; L. Brandt SPONSORS it —
 *         the evaluation opened (a DEC and its package); C. Brenner accepts the assessment.
 *   B32-A THE AGENTS: the administrator registers the Risk and the Opportunity Agents; M. Dvořák runs them — they ESTIMATE (a proposed
 *         version) and never decide: their acceptance / sponsorship attempts refused at the PDP and recorded on the run. A second risk on the
 *         same driver ("Magnet price spike") → the AGGREGATION counts the shared driver once (the max), the naive sum said beside it.
 *   B32-H F-P6-08: J. Weber proposes the NORDWERK health definition (supply resilience: the corridor transits indicator, the corridor risk, the
 *         on-time measure; sourcing: the Morocco opportunity); S. Okafor APPROVES (the proposer's own approval refused). A. Hoffmann computes
 *         S1; C. Brenner accepts the Risk Agent's re-estimate of the corridor (probability up); A. Hoffmann computes S2 — the supply-resilience
 *         dimension FALLS; the drill-down shows the corridor risk component with its evidence, and the measure N days STALE (declared, not
 *         averaged away); the change raised; C. Brenner acknowledges it, L. Brandt challenges it, M. Dvořák decides (neither the challenger
 *         nor the approver); the comparison S2 against S1; peer: no input, declared.
 *   B32-9 THE STATE and the LIMITS said.
 *
 * CASTING (the seed's personas; C. Brenner created here): M. Dvořák (executive), N. Eriksen (forecast_owner), J. Weber (strategy_owner),
 * L. Brandt (decision_owner, decision_authority), A. Hoffmann (domain_analyst), S. Okafor (decision_approver, executive); the administrator =
 * the platform-admin session. Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const { RISK_AGENT_VERSION, RISK_AGENT_DIGEST, OPPORTUNITY_AGENT_VERSION, OPPORTUNITY_AGENT_DIGEST } = requireApi('./dist/prediction/exposures/exposure-agent-identity.js');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const P = `${X}/prediction`; const XP = `${P}/exposures`; const H = `${X}/executive/health`;
// UUIDv7 ids share their time prefix within a run: the id is shown by its head and its tail
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const DAY = 86_400_000;
const future = (days) => new Date(Date.now() + days * DAY).toISOString();
const iso = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 240)}`;
const eur = (n) => (n === null || n === undefined ? '—' : `EUR ${Math.round(Number(n)).toLocaleString('en-US')}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const tStart = Date.now();
console.log(`THE B32 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};

/* ── B32-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB32-0 THE STATE — 0089, the register, the casting, the risk owner, the disclosed bindings');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0089%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0089 is not applied'); process.exit(1); }
}
const CAST = { 'm.dvorak': ['executive'], 'n.eriksen': ['forecast_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_owner', 'decision_authority'],
  'a.hoffmann': ['domain_analyst'], 's.okafor': ['decision_approver', 'executive'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
{
  const r = await createPersona(admin, T, { displayName: 'C. Brenner — supply risk owner (Regensburg)', loginName: 'c.brenner', password: PW, roleCode: 'risk_owner', domainId: D });
  if (r.session === null) { bad(`C. Brenner could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (r.created) ok('the administrator CREATED C. Brenner through the governed principal route (identity.principal.create) — role risk_owner in NORDWERK'); else note('C. Brenner is present — an earlier run');
}
const DISCLOSED = [['c.brenner', 'strategy_owner'], ['c.brenner', 'decision_owner'], ['l.brandt', 'opportunity_sponsor'], ['l.brandt', 'strategy_owner']];
{
  const bound = [];
  for (const [l, role] of DISCLOSED) {
    const r = await su.query(`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
                               select gen_random_uuid(), p.id, $2, 'DOMAIN', $3::uuid, $4::uuid from identity.principals p where p.login_name = $1
                                and not exists (select 1 from identity.role_bindings b where b.principal_id = p.id and b.role_code = $2 and b.domain_id = $4::uuid and b.revoked_at is null)`, [l, role, T, D]);
    if (r.rowCount > 0) bound.push(`${l} ${role}`);
  }
  note(`DISCLOSED — outside the governed routes (Phase 0 offers no route binding a SECOND role to an existing human; C14 freezes it): ${bound.length > 0 ? `bound now: ${bound.join(', ')}` : 'the four bindings are present — an earlier run'} (identity.role_bindings, the administrator, as seed-decisions.mjs did)`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const weber = await who('j.weber'); const brandt = await who('l.brandt');
const hoffmann = await who('a.hoffmann'); const okafor = await who('s.okafor'); const brenner = await who('c.brenner');
const NAME = { [dvorak.principalId]: 'M. Dvořák', [eriksen.principalId]: 'N. Eriksen', [weber.principalId]: 'J. Weber', [brandt.principalId]: 'L. Brandt',
  [hoffmann.principalId]: 'A. Hoffmann', [okafor.principalId]: 'S. Okafor', [brenner.principalId]: 'C. Brenner', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
{
  const r = await call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (r.ok) { const all = r.body.interfaces ?? []; const c = (s) => all.filter((i) => i.binding_state === s).length; (c('bound') === 50 && c('partial') === 0 ? ok : bad)(`the register: ${c('bound')} bound / ${c('partial')} partial / ${c('unbound')} unbound (B32 adds no interface)`); }
  else fail('the register', r);
}

/* ── the real inputs: claims the NORDWERK records' extraction admitted, the shipment record, the corridor objective and indicator ─────── */
const SRC_NW = (await q(`select source_id::text from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-internal' order by contract_version desc limit 1`, [T, D]))[0]?.source_id ?? null;
const claimsNW = SRC_NW === null ? [] : await q(`select distinct on (l.claim_object_id) l.claim_object_id::text id, o.payload ->> 'subject' s, o.payload ->> 'predicate' p, o.payload ->> 'object_value' v, l.evidence_object_id::text evd
    from intelligence.claim_lineage l join objects.canonical_objects e on e.object_id = l.evidence_object_id and e.object_type = 'EVD' and e.provenance_ref like 'SRC:' || $3 || '@%'
    join objects.canonical_objects o on o.object_id = l.claim_object_id and o.lifecycle_state = 'active'
   where l.tenant_id = $1 and l.domain_id = $2 order by l.claim_object_id, o.object_version desc`, [T, D, SRC_NW]);
const claim = (s, p, v) => claimsNW.find((c) => c.s === s && c.p === p && (v === undefined || c.v === v)) ?? null;
const C_DEP_BRG = claim('NORDWERK ANTRIEBSTECHNIK GmbH', 'depends_on', 'SYN-PART-BRG'); const C_MANUF = claim('NORDWERK ANTRIEBSTECHNIK GmbH', 'is_a', 'manufacturer');
const C_STOCK_MAG = claim('NORDWERK ANTRIEBSTECHNIK GmbH', 'stocks', 'SYN-PART-MAG'); const C_SHIP_BRG = claim('SYN-SHIP-4481', 'carries', 'SYN-PART-BRG');
const C_TRANSIT = claim('MV Hanse Meridian', 'transits', 'Bab el-Mandeb');
const needClaims = { C_DEP_BRG, C_MANUF, C_STOCK_MAG, C_SHIP_BRG, C_TRANSIT };
if (Object.values(needClaims).some((c) => c === null)) { bad(`a claim the act rests on is absent: ${Object.entries(needClaims).filter(([, c]) => c === null).map(([k]) => k).join(', ')}`); process.exit(1); }
const EVD_SHIP = (await q(`select object_id::text id, max(object_version)::int v from objects.canonical_objects where object_id = $1 group by 1`, [C_SHIP_BRG.evd]))[0];
ok(`the inputs: ${claimsNW.length} claims the NORDWERK records' extraction admitted (source ${short(SRC_NW)}); the shipment record ${short(EVD_SHIP.id)} v${EVD_SHIP.v} ("SYN-SHIP-4481 carries SYN-PART-BRG", "MV Hanse Meridian transits Bab el-Mandeb")`);
const OBJ_REG = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const IND = (await q(`select i.indicator_id::text id, i.description, i.threshold, (select count(*)::int from prediction.indicator_evaluations e where e.indicator_id = i.indicator_id) n,
                            (select e.value from prediction.indicator_evaluations e where e.indicator_id = i.indicator_id order by e.observation_at desc, e.known_at desc limit 1) latest,
                            (select e.observation_at from prediction.indicator_evaluations e where e.indicator_id = i.indicator_id order by e.observation_at desc, e.known_at desc limit 1) latest_at
                       from prediction.indicators_current i where i.tenant_id = $1 and i.domain_id = $2 and i.state = 'active' and i.description like 'Bab el-Mandeb Strait transits below 41%' order by n desc limit 1`, [T, D]))[0] ?? null;
if (OBJ_REG === null || IND === null) { bad(`the Regensburg objective (${OBJ_REG ? 'present' : 'ABSENT'}) or the corridor indicator (${IND ? 'present' : 'ABSENT'}) is missing`); process.exit(1); }
ok(`the Regensburg objective ${short(OBJ_REG.id)} "${OBJ_REG.title}"; the corridor indicator ${short(IND.id)} "${IND.description.slice(0, 60)}…" — ${IND.n} evaluations from the PortWatch series, the latest ${IND.latest} transits on ${String(iso(IND.latest_at)).slice(0, 10)}`);

/* ── helpers ─────────────────────────────────────────────────────────────────────────── */
const strategyByTitle = async (type, title) => (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = $3 and title = $4 and status = 'active' limit 1`, [T, D, type, title]))[0]?.id ?? null;
async function declare(s, who_, type, title, statement, restsOn) {
  const had = await strategyByTitle(type, title);
  if (had !== null) { note(`${type} ${short(had)} "${title}" is declared — an earlier run`); return had; }
  const r = await call(`${G}/strategy/declare`, env_(s, 'graph')({ action: 'graph.strategy.declare', objectType: type }), { objectType: type, title, statement, restsOn }, s.token);
  if (!r.ok) { fail(`${who_} declares ${type} "${title}"`, r); return null; }
  ok(`${who_} DECLARED ${type} ${short(r.body.strategy.objectId)} "${title}" resting on ${restsOn.map((x) => `${x.kind} ${short(x.id)}`).join(', ')}`);
  return r.body.strategy.objectId;
}
const onClaim = (c, why) => ({ kind: 'claim', id: c.id, rationale: why ?? `the NORDWERK records say ${c.s} ${c.p} ${c.v}` });
const gRead = (s, path, payload = {}, type = 'OBJ') => call(`${G}/strategy/${path}`, env_(s, 'graph')({ action: 'graph.strategy.alignment.read', objectType: type, sideEffect: 'none' }), payload, s.token);
const xp = (s, path, action, payload = {}, objectId = null, sideEffect) => call(`${XP}/${path}`, env_(s, 'prediction')({ action, objectType: 'RSK', objectId, ...(sideEffect ? { sideEffect } : {}) }), payload, s.token);
const hx = (s, path, action, objectType, payload = {}, objectId = null) => call(`${H}/${path}`, env_(s, 'executive')({ action, objectType, objectId }), payload, s.token);

/* ── B32-G ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-G F-P6-09 — "On-time delivery 95%" linked to the Regensburg assembly capability and the dual-sourcing initiative; the gap view');
const OBJ = await declare(weber, 'J. Weber', 'OBJ', 'On-time delivery 95%', 'Deliver 95% of Regensburg drive-train orders on the committed date through 2027 (SYNTHETIC target)', [onClaim(C_DEP_BRG)]);
const CAP = await declare(weber, 'J. Weber', 'CAP', 'Regensburg assembly', 'The Regensburg line\'s capability to assemble the drive trains from bearings, magnets and housings', [onClaim(C_MANUF)]);
const INI = await declare(weber, 'J. Weber', 'INI', 'Dual-sourcing initiative', 'Qualify a second source for the magnet and bearing sets the line depends on', [onClaim(C_STOCK_MAG)]);
const RSC = await declare(weber, 'J. Weber', 'RSC', 'Bearings procurement budget', 'The 2027 budget for qualifying and buying a second bearing source (SYNTHETIC)', [onClaim(C_DEP_BRG)]);
const MSR = await declare(weber, 'J. Weber', 'MSR', 'On-time delivery rate', 'The share of drive-train orders delivered on the committed date, from the shipment records', [onClaim(C_SHIP_BRG)]);
const STK = await declare(weber, 'J. Weber', 'STK', 'Regensburg line workforce', 'The line\'s workforce, whose shifts follow the parts supply', [onClaim(C_MANUF)]);
if ([OBJ, CAP, INI, RSC, MSR, STK].some((x) => x === null)) { bad('a Strategy Graph object was not declared; B32-G stops'); }
let RES_ALN = null;
if ([OBJ, CAP, INI, RSC, MSR, STK].every((x) => x !== null)) {
  const list = await gRead(weber, 'alignments/list', {}, 'ALN');
  const have = list.ok ? (list.body.alignments ?? []) : [];
  for (const [kind, from, to, why] of [['supports', OBJ, CAP, 'on-time delivery rests on the Regensburg assembly capability'], ['builds', INI, CAP, 'the dual-sourcing initiative builds the capability\'s supply side'],
    ['resources', RSC, INI, 'the bearings budget resources the initiative'], ['affects', STK, OBJ, 'the line workforce is affected by the delivery objective']]) {
    const found = have.find((a) => a.kind === kind && a.from_id === from && a.to_id === to && a.state === 'active');
    if (found) { note(`the ${kind} alignment ${short(found.alignment_id)} stands — an earlier run`); if (kind === 'resources') RES_ALN = found; continue; }
    const r = await call(`${G}/strategy/alignments/declare`, env_(weber, 'graph')({ action: 'graph.alignment.declare', objectType: 'ALN' }), { kind, from, to, strength: 'strong', rationale: why }, weber.token);
    if (!r.ok) fail(`J. Weber declares the ${kind} alignment`, r);
    else { const a = r.body.alignment; ok(`J. Weber DECLARED ${kind} ${short(from)} → ${short(to)} (${short(a.alignment_id)}; ${a.dependency ? `mirrored into the dependencies: ${short(a.dependency.dependent)} rests on ${short(a.dependency.depends_on)}` : 'no dependency mirror'})`); if (kind === 'resources') RES_ALN = a; }
  }
  const def = await call(`${G}/strategy/measures/${MSR}/define`, env_(weber, 'graph')({ action: 'graph.measure.define', objectType: 'MSR', objectId: MSR }),
    { objectiveId: OBJ, unit: 'percent', direction: 'higher_better', targetValue: 95, targetDate: '2027-12-31', freshnessDays: 7 }, weber.token);
  if (!def.ok) fail('J. Weber defines the measure', def);
  else ok(`J. Weber DEFINED the measure ${short(MSR)} on "On-time delivery 95%": percent, higher is better, target 95 by 2027-12-31, fresh for 7 days — definition v${def.body.measure.definition_version}, ${def.body.measure.approval_state}${def.body.measure.repeated ? ' (repeated)' : ''}`);
  const nine = new Date(Date.now() - 9 * DAY - 5 * 60_000);
  const obs = await call(`${G}/strategy/measures/${MSR}/observe`, env_(hoffmann, 'graph')({ action: 'graph.measure.observe', objectType: 'MSR', objectId: MSR }),
    { value: 91, observedAt: nine.toISOString(), source: { kind: 'evidence', id: EVD_SHIP.id }, note: 'read off the shipment records for that day' }, hoffmann.token);
  if (!obs.ok) fail('A. Hoffmann enters the measure reading', obs);
  else { const o = obs.body.observation; ok(`A. Hoffmann ENTERED the reading 91% observed ${nine.toISOString().slice(0, 10)} from the shipment record ${short(EVD_SHIP.id)} v${o.source?.version ?? '?'}${o.repeated ? ' (repeated)' : ''} — freshness ${o.freshness?.state} (${o.freshness?.age_days} days against ${o.freshness?.freshness_days})`); }
  const gaps0 = await gRead(dvorak, 'gaps', { objectiveId: OBJ });
  const row0 = gaps0.ok ? (gaps0.body.gaps.rows ?? []).find((x) => x.capability_id === CAP) : null;
  if (row0 === null || row0 === undefined) fail('the gap view (the executive)', gaps0);
  else {
    const self = await call(`${G}/strategy/${OBJ}/authority`, env_(weber, 'graph')({ action: 'graph.strategy.authority.act', objectType: 'OBJ', objectId: OBJ }),
      { actKind: 'set_objective', subjectDigest: row0.objective_subject.digest, decision: 'approve', rationale: 'setting my own objective for the 2027 plan', expiresAt: future(180) }, weber.token);
    expectRefused('J. Weber setting their own objective', self, 403, /separation/);
    const acts = [['OBJ', OBJ, `${G}/strategy/${OBJ}/authority`, { actKind: 'set_objective', subjectDigest: row0.objective_subject.digest }],
      ['MSR', MSR, `${G}/strategy/measures/${MSR}/approve`, { subjectDigest: def.ok ? def.body.measure.definition_digest : '' }],
      ['ALN', RES_ALN?.alignment_id, `${G}/strategy/${RES_ALN?.alignment_id}/authority`, { actKind: 'allocate_resource', subjectDigest: RES_ALN?.digest }]];
    for (const [type, id, path, body] of acts) {
      if (!id || !body.subjectDigest) { bad(`the ${type} authority act has no subject`); continue; }
      const r = await call(path, env_(dvorak, 'graph')({ action: 'graph.strategy.authority.act', objectType: type, objectId: id }),
        { ...body, decision: 'approve', rationale: 'approved by the executive for the 2027 plan (B32)', expiresAt: future(180) }, dvorak.token);
      if (!r.ok) fail(`M. Dvořák's ${type} authority act`, r);
      else ok(`M. Dvořák RECORDED ${r.body.act.act_kind} on ${type} ${short(id)} v${r.body.act.subject_version} — eligible by ${r.body.act.eligible_by}, declarer ${nm(r.body.act.declarer)}, act ${short(r.body.act.act_id)}`);
    }
  }
  const gaps = await gRead(dvorak, 'gaps', { objectiveId: OBJ });
  const row = gaps.ok ? (gaps.body.gaps.rows ?? []).find((x) => x.capability_id === CAP) : null;
  if (!row) fail('the gap view', gaps);
  else {
    (row.gap_reasons.includes('capability_under_evidenced') ? ok : bad)(`THE GAP VIEW (${gaps.body.gaps.rule}): "On-time delivery 95%" × "Regensburg assembly" — ${row.alignment_claim.toUpperCase()}, ${row.criteria_met}/${row.criteria_total} criteria met; gap reasons ${row.gap_reasons.join(', ')}; evidence ${row.evidence_count} (strongest ${row.strongest_truth}); initiatives active ${row.initiatives_active}, resourced ${row.initiatives_resourced}; measures ${(row.measures ?? []).map((m2) => `${short(m2.measure_id)} ${m2.approved ? 'approved' : 'unapproved'} ${m2.state} ${m2.age_days ?? '—'} d`).join(', ')}`);
    for (const c of row.criteria ?? []) note(`  criterion ${c.criterion}: ${c.met ? 'met' : 'NOT met'} — ${c.basis}`);
  }
  const det = await gRead(dvorak, 'detections');
  if (!det.ok) fail('the detections', det);
  else {
    const st = (det.body.detections.detections ?? []).find((d2) => d2.detection_key === `stale_measure:${MSR}`);
    (st ? ok : bad)(`THE DETECTIONS: ${JSON.stringify(det.body.detections.counts.open_by_kind ?? det.body.detections.counts)} open — ${st ? `stale_measure on ${short(MSR)}: continuity ${st.continuity}, routed to ${(st.routed_to ?? []).map(nm).join(', ')}, affected ${(st.affected_ids ?? []).map(short).join(', ')} — ${st.detail}` : 'the stale measure is NOT detected'}`);
  }
}

/* ── B32-R ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-R F-P4-13 — the corridor closure registered as a risk to the Regensburg line; the owner accepts; the appetite breached; the mitigation decision');
{
  const cur = await xp(dvorak, 'taxonomy/get', 'prediction.exposure.read', {}, null, 'none');
  const tv = cur.ok ? (cur.body.taxonomy.current?.version ?? 0) : 0;
  if (tv > 0) note(`the risk taxonomy is at version ${tv} — an earlier run`);
  else {
    const r = await xp(dvorak, 'taxonomy/publish', 'prediction.exposure.taxonomy.publish', { expectedVersion: 0, reason: 'NORDWERK\'s first risk and opportunity taxonomy (B32)',
      categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }, { key: 'market', label: 'Market', polarity: 'both' }] });
    if (!r.ok) fail('M. Dvořák publishes the taxonomy', r); else ok(`M. Dvořák PUBLISHED the risk taxonomy version ${r.body.taxonomy.version}: supply_chain (risk), sourcing (opportunity), market (both)`);
  }
  const appNow = cur.ok ? (cur.body.taxonomy.appetites ?? []).find((a) => a.category_key === 'supply_chain') : null;
  if (appNow) note(`the supply_chain appetite stands at version ${appNow.version} (${eur(appNow.threshold)}) — an earlier run`);
  else {
    const r = await xp(dvorak, 'appetites/approve', 'prediction.exposure.appetite.approve', { category: 'supply_chain', expectedVersion: 0, threshold: 250000, unit: 'EUR',
      statement: 'no single supply-chain exposure above EUR 250k residual (SYNTHETIC)', reason: 'the board\'s appetite for the Regensburg supply chain (SYNTHETIC)' });
    if (!r.ok) fail('M. Dvořák approves the appetite', r); else ok(`M. Dvořák APPROVED the supply_chain APPETITE v${r.body.appetite.version}: ${eur(r.body.appetite.threshold)} residual, approved by ${nm(r.body.appetite.approved_by)}`);
  }
}
const riskAssessment = () => ({
  mechanism: 'A closure of the Bab el-Mandeb corridor holds the bearing and magnet shipments at the Cape detour; the Regensburg line stops when the four-week buffer runs out',
  probability: { low: 0.3, high: 0.6 }, impact: { low: 400000, high: 900000, unit: 'EUR' }, horizon: '2027-Q1', response_window_hours: 72, velocity: 'weeks',
  reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
  options: [{ key: 'dual-source', label: 'Qualify a second bearing and magnet source', kind: 'mitigate', cost: 120000 }, { key: 'insure', label: 'Contingent business-interruption cover', kind: 'transfer' },
    { key: 'hold', label: 'Accept and watch the corridor', kind: 'accept' }],
  evidence: [{ object_id: EVD_SHIP.id, version: EVD_SHIP.v }], basis: 'SYNTHETIC amounts; the mechanism from the shipment record and the corridor indicator' });
const exposureOf = async (id) => (await q(`select exposure_id::text, state, owner_principal_id::text owner, current_version, polarity, category_key from prediction.exposure_current where exposure_id = $1`, [id]))[0] ?? null;
async function registerExposure(s, who_, id, polarity, category, reviewEveryDays) {
  const had = await exposureOf(id);
  if (had) { note(`${short(id)} is registered (${had.polarity}, ${had.state}) — an earlier run`); return had; }
  const r = await xp(s, 'register', 'prediction.exposure.register', { strategyObjectId: id, polarity, category, owner: brenner.principalId, reviewEveryDays }, id);
  if (!r.ok) { fail(`${who_} registers ${short(id)}`, r); return null; }
  ok(`${who_} REGISTERED ${short(id)} as a ${polarity} in ${category} (taxonomy v${r.body.exposure.taxonomy_version}), owner ${nm(r.body.exposure.owner)} — ${r.body.exposure.drivers?.length ?? r.body.exposure.drivers} driver(s) from its rests_on`);
  return exposureOf(id);
}
const CORRIDOR = await declare(brenner, 'C. Brenner', 'RSK', 'Corridor closure — Regensburg line', 'A Bab el-Mandeb closure stops the bearing and magnet supply to the Regensburg line',
  [onClaim(C_TRANSIT, 'the shipment record routes the bearings through Bab el-Mandeb — the corridor drives this exposure'), { kind: 'strategy', id: OBJ_REG.id, rationale: 'the exposure threatens the Regensburg supply objective' }]);
let v1 = null; let WARNING = null;
if (CORRIDOR !== null && (await registerExposure(hoffmann, 'A. Hoffmann', CORRIDOR, 'risk', 'supply_chain', 30)) !== null) {
  const e0 = await exposureOf(CORRIDOR);
  if ((e0.current_version ?? 0) > 0) note(`the corridor is assessed to version ${e0.current_version} — an earlier run`);
  else {
    const a = await xp(hoffmann, `${CORRIDOR}/assess`, 'prediction.exposure.assess', { expectedVersion: 0, assessment: riskAssessment() }, CORRIDOR);
    if (!a.ok) fail('A. Hoffmann assesses the corridor', a);
    else { v1 = a.body.assessment; ok(`A. Hoffmann ASSESSED the corridor: version ${v1.version} ${v1.state} (${v1.assessed_kind}), probability 0.3–0.6, impact ${eur(400000)}–${eur(900000)}, horizon 2027-Q1, digest ${v1.digest.slice(0, 12)}…`); }
  }
  if (v1 !== null) {
    const pv = await xp(brenner, `${CORRIDOR}/versions/${v1.version}/preview`, 'prediction.exposure.read', {}, CORRIDOR, 'none');
    if (!pv.ok) fail('C. Brenner previews the acceptance', pv);
    else { const p = pv.body.preview; ok(`C. Brenner PREVIEWED accepting v${p.version}: residual ${eur(p.residual.residual_low)}–${eur(p.residual.residual_high)}, breach ${p.residual.breach}; ${p.consequence}`); }
    const wrong = await xp(weber, `${CORRIDOR}/versions/${v1.version}/accept`, 'prediction.exposure.accept', { digest: v1.digest, rationale: 'the planning lead accepts it' }, CORRIDOR);
    expectRefused('J. Weber accepting the corridor assessment (not the risk owner)', wrong, 403);
    const acc = await xp(brenner, `${CORRIDOR}/versions/${v1.version}/accept`, 'prediction.exposure.accept', { digest: v1.digest, rationale: 'The assessment matches the shipment record and the corridor indicator; accepted as the current exposure model.' }, CORRIDOR);
    if (!acc.ok) fail('C. Brenner accepts the assessment', acc);
    else {
      const x = acc.body.acceptance; const rt = acc.body.routing;
      ok(`C. Brenner ACCEPTED v${x.version}: residual ${eur(x.residual.residual_low)}–${eur(x.residual.residual_high)} — ${x.residual.breach ? 'OUTSIDE the EUR 250k appetite' : 'within appetite'}; routing ${rt.state}${rt.candidate ? ` → candidate ${short(rt.candidate.candidate_id)} ${rt.candidate.state}` : ''}${rt.routed_to ? `, routed to ${nm(rt.routed_to)}` : ''}`);
    }
    const proc = await call(`${P}/warnings/candidates/process`, env_(eriksen, 'prediction')({ action: 'prediction.warning.candidates.process', objectType: 'WRN' }), {}, eriksen.token);
    if (!proc.ok) fail('N. Eriksen processes the warning candidates', proc);
    else {
      const raised = (proc.body.processing.raised ?? []);
      const row = (await q(`select w.warning_id::text, w.origin_kind, w.routed_to::text, w.state from prediction.warning_candidates c join prediction.warnings_current w on w.warning_id = c.warning_id
                              where c.origin_kind = 'exposure' and c.origin_ref ->> 'exposure_id' = $1 and c.warning_id is not null order by c.submitted_at desc limit 1`, [CORRIDOR]))[0] ?? null;
      WARNING = row;
      (row && row.origin_kind === 'exposure' && row.routed_to === brenner.principalId ? ok : bad)(`N. Eriksen PROCESSED the candidates: ${raised.length} raised in this pass — the corridor's warning ${row ? `${short(row.warning_id)} origin ${row.origin_kind}, ${row.state}, routed to ${nm(row.routed_to)} (the exposure's owner, not the objective's)` : 'NOT raised'}`);
    }
    if (WARNING) {
      const ack = await call(`${P}/warnings/${WARNING.warning_id}/acknowledge`, env_(brenner, 'prediction')({ action: 'prediction.warning.acknowledge', objectType: 'WRN', objectId: WARNING.warning_id }), { note: 'seen: the corridor exposure is outside appetite; the mitigation decision follows' }, brenner.token);
      if (!ack.ok) fail('C. Brenner acknowledges the warning', ack); else ok(`C. Brenner ACKNOWLEDGED the warning ${short(WARNING.warning_id)} → ${JSON.stringify(ack.body.warning.state).slice(0, 120)}`);
    }
    const ctl = await xp(brenner, `${CORRIDOR}/controls`, 'prediction.exposure.control.add', { title: 'Dual-sourcing framework contract (bearings)', kind: 'preventive', effectiveness: { low: 0.5, high: 0.7 }, owner: brenner.principalId }, CORRIDOR);
    if (!ctl.ok) fail('C. Brenner adds a control', ctl);
    else { const c = ctl.body.control; ok(`C. Brenner ADDED the control "Dual-sourcing framework contract (bearings)" ${short(c.control_id)} (preventive, effectiveness 0.5–0.7): residual now ${eur(c.residual?.residual_low)}–${eur(c.residual?.residual_high)}, ${c.residual?.breach ? 'still outside appetite' : 'within appetite'}; routing ${ctl.body.routing?.state}`); }
    const dec = await xp(brenner, `${CORRIDOR}/decisions/open`, 'prediction.exposure.respond', { kind: 'mitigate', decision: { title: 'Mitigate the corridor closure — Regensburg line', statement: 'dual-source the bearings and magnets, or buffer the line through Q1' } }, CORRIDOR);
    if (!dec.ok) fail('C. Brenner opens the mitigation decision', dec);
    else { const d2 = dec.body.response; ok(`C. Brenner OPENED THE MITIGATION DECISION: DEC ${short(d2.decision_object_id)} and its package ${short(d2.package_id)} (draft) linked as the ${d2.kind} response${d2.repeated ? ' (repeated)' : ''}`); }
  }
}

/* ── B32-O ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-O F-P4-13 — the same change surfaces an opportunity: an alternative supplier in Morocco, sponsored by L. Brandt');
const MOROCCO = await declare(brandt, 'L. Brandt', 'RSK', 'Alternative supplier in Morocco', 'The corridor change opens a qualified bearing and magnet supplier in Morocco',
  [onClaim(C_TRANSIT, 'the same corridor change drives the opportunity'), { kind: 'strategy', id: OBJ_REG.id, rationale: 'the supplier serves the Regensburg supply objective' }]);
let oppV1 = null;
if (MOROCCO !== null && (await registerExposure(brandt, 'L. Brandt', MOROCCO, 'opportunity', 'sourcing', 60)) !== null) {
  const hy = await xp(brandt, `${MOROCCO}/hypotheses`, 'prediction.exposure.hypothesis.declare', { statement: 'A Moroccan bearing and magnet supplier can be qualified before Q2 and shortens the chain by three weeks',
    falsifier: 'The supplier fails the grade test or cannot ship 20 t per month', value: { low: 150000, high: 400000, unit: 'EUR' }, timing: { window: '2027-Q2', from: '2027-04-01', to: '2027-06-30' },
    options: [{ key: 'qualify', label: 'Qualify the supplier' }], capabilities: CAP ? [CAP] : [] }, MOROCCO);
  if (!hy.ok) fail('L. Brandt states the hypothesis', hy); else ok(`L. Brandt STATED the hypothesis v${hy.body.hypothesis.version}: value ${eur(150000)}–${eur(400000)} in 2027-Q2, falsified if the grade test fails or 20 t/month is not shipped; needs the capability ${short(CAP)}`);
  const e0 = await exposureOf(MOROCCO);
  if ((e0.current_version ?? 0) === 0) {
    const a = await xp(hoffmann, `${MOROCCO}/assess`, 'prediction.exposure.assess', { expectedVersion: 0, assessment: { mechanism: 'The corridor change makes the Moroccan route faster than the Cape detour; qualifying the supplier captures the saving',
      plausibility: 'medium', impact: { low: 150000, high: 400000, unit: 'EUR' }, horizon: '2027-Q2', response_window_hours: 336, reversibility: 'reversible', controllability: 'high',
      options: [{ key: 'qualify', label: 'Qualify the Moroccan supplier', kind: 'exploit', cost: 60000 }, { key: 'wait', label: 'Wait a quarter', kind: 'defer' }], confidence: 0.4,
      evidence: [{ object_id: EVD_SHIP.id, version: EVD_SHIP.v }] } }, MOROCCO);
    if (!a.ok) fail('A. Hoffmann assesses the opportunity', a); else { oppV1 = a.body.assessment; ok(`A. Hoffmann ASSESSED the opportunity: version ${oppV1.version} (plausibility medium, value ${eur(150000)}–${eur(400000)})`); }
  } else note(`the opportunity is assessed to version ${e0.current_version} — an earlier run`);
  if (oppV1 !== null) {
    const sp = await xp(brandt, `${MOROCCO}/versions/${oppV1.version}/sponsor`, 'prediction.exposure.sponsor', { digest: oppV1.digest,
      terms: { option_key: 'qualify', rationale: 'The saving and the shorter chain justify a qualification budget this quarter', conditions: ['the grade test passes', 'the supplier signs a 20 t/month frame'], budget: { amount: 60000, unit: 'EUR' }, objective_id: OBJ_REG.id },
      decision: { title: 'Evaluate the Moroccan supplier', statement: 'qualify, defer or abandon the Moroccan supplier' } }, MOROCCO);
    if (!sp.ok) fail('L. Brandt sponsors the opportunity', sp);
    else { const s2 = sp.body.sponsorship; const ev = sp.body.evaluation; ok(`L. Brandt SPONSORED v${s2.version} (${s2.state}; option qualify, EUR 60k, two conditions) — the evaluation ${ev.state}: DEC ${short(ev.decision_object_id)}, package ${short(ev.package_id)} (${ev.kind})`); }
    const acc = await xp(brenner, `${MOROCCO}/versions/${oppV1.version}/accept`, 'prediction.exposure.accept', { digest: oppV1.digest, rationale: 'The assessment is the analyst\'s and matches the hypothesis; accepted as the current model of the opportunity.' }, MOROCCO);
    if (!acc.ok) fail('C. Brenner accepts the opportunity\'s assessment', acc); else ok(`C. Brenner (its owner) ACCEPTED the opportunity's v${acc.body.acceptance.version} — its value now enters the health inputs`);
  }
}

/* ── B32-A ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-A the Risk and Opportunity Agents estimate and never decide; the aggregation counts a shared driver once');
const agentOf = async (kind) => (await q(`select agent_id::text, principal_id::text, code_digest from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = $3 and status = 'active' order by created_at desc limit 1`, [T, D, kind]))[0] ?? null;
const AG = {};
for (const [kind, version, codeDigest] of [['risk', RISK_AGENT_VERSION, RISK_AGENT_DIGEST], ['opportunity', OPPORTUNITY_AGENT_VERSION, OPPORTUNITY_AGENT_DIGEST]]) {
  const cur = await agentOf(kind);
  if (cur && cur.code_digest === codeDigest) { AG[kind] = cur; note(`the ${kind} agent ${short(cur.agent_id)} is registered — an earlier run`); continue; }
  const r = await call(`${X}/agents/decision/register`, ad({ action: 'agent.register', objectType: 'AGT' }), { kind, version, codeDigest, ownerPrincipalId: brenner.principalId, escalationPrincipalId: dvorak.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 60000 }, stopConditions: [{ kind: 'max_items', value: 5 }] }, admin.token);
  if (!r.ok) fail(`the administrator registers the ${kind} agent`, r);
  else { AG[kind] = await agentOf(kind); ok(`the administrator REGISTERED the ${kind === 'risk' ? 'Risk' : 'Opportunity'} Agent ${short(r.body.agent.agentId)} — role ${r.body.agent.role}, ${version} digest ${codeDigest.slice(0, 12)}…, accountable C. Brenner, escalation M. Dvořák`); }
}
const runAgent = async (kind, task) => call(`${X}/agents/decision/${AG[kind].agent_id}/run`, env_(dvorak, 'prediction')({ action: 'agent.trigger', objectType: 'AGT', objectId: AG[kind].agent_id }), { task }, dvorak.token);
let corridorV2 = null;
if (AG.risk) {
  const r = await runAgent('risk', 'risk_assess');
  if (!r.ok) fail('M. Dvořák runs the Risk Agent', r);
  else {
    const run = r.body.run; const est = run.outputs?.estimated ?? [];
    corridorV2 = est.find((e) => e.exposure_id === CORRIDOR) ?? null;
    ok(`M. Dvořák RAN the Risk Agent (run ${short(run.runId)}, ${run.outcome}, ${run.stopReason ?? '—'}): estimated ${est.length} (${est.map((e) => `${short(e.exposure_id)} v${e.version}`).join(', ') || 'none'}), waiting ${(run.outputs?.waiting ?? []).length}, correlations ${(run.outputs?.correlations ?? []).length}`);
    const refused = (run.refusals ?? []).filter((x) => x.action === 'prediction.exposure.accept');
    (refused.length > 0 ? ok : bad)(`the agent's attempt to ACCEPT refused at the PDP and recorded on the run: ${refused.map((x) => `${x.action} ${x.code} — ${String(x.reason).slice(0, 90)}`).join('; ') || 'NONE recorded'}`);
  }
}
if (AG.opportunity) {
  const r = await runAgent('opportunity', 'opportunity_assess');
  if (!r.ok) fail('M. Dvořák runs the Opportunity Agent', r);
  else {
    const run = r.body.run; const refused = (run.refusals ?? []).filter((x) => x.action === 'prediction.exposure.sponsor');
    ok(`M. Dvořák RAN the Opportunity Agent (run ${short(run.runId)}): estimated ${(run.outputs?.estimated ?? []).map((e) => `${short(e.exposure_id)} v${e.version}`).join(', ') || 'none'}`);
    (refused.length > 0 ? ok : bad)(`the agent's attempt to SPONSOR refused and recorded: ${refused.map((x) => `${x.code} — ${String(x.reason).slice(0, 90)}`).join('; ') || 'NONE recorded'}`);
  }
}
const PRICE = await declare(brenner, 'C. Brenner', 'RSK', 'Magnet price spike', 'The Cape detour raises the magnet price for the Regensburg line',
  [onClaim(C_TRANSIT, 'the same corridor change drives the price'), { kind: 'strategy', id: OBJ_REG.id, rationale: 'the price threatens the Regensburg supply objective' }]);
if (PRICE !== null && CORRIDOR !== null && (await registerExposure(hoffmann, 'A. Hoffmann', PRICE, 'risk', 'supply_chain', 30)) !== null) {
  const e0 = await exposureOf(PRICE);
  let pv1 = null;
  if ((e0.current_version ?? 0) === 0) {
    const a = await xp(hoffmann, `${PRICE}/assess`, 'prediction.exposure.assess', { expectedVersion: 0, assessment: { mechanism: 'The Cape detour adds ten days and the magnet suppliers pass the freight on; the line pays the spot price for two months',
      probability: { low: 0.4, high: 0.7 }, impact: { low: 100000, high: 300000, unit: 'EUR' }, horizon: '2027-Q1', reversibility: 'reversible', controllability: 'medium', confidence: 0.5 } }, PRICE);
    if (!a.ok) fail('A. Hoffmann assesses the price risk', a); else pv1 = a.body.assessment;
  }
  if (pv1) {
    const acc = await xp(brenner, `${PRICE}/versions/${pv1.version}/accept`, 'prediction.exposure.accept', { digest: pv1.digest, rationale: 'The price exposure is as the analyst gives it; accepted.' }, PRICE);
    if (!acc.ok) fail('C. Brenner accepts the price risk', acc); else ok(`C. Brenner ACCEPTED "Magnet price spike" v${pv1.version}: residual ${eur(acc.body.acceptance.residual.residual_low)}–${eur(acc.body.acceptance.residual.residual_high)}`);
  }
  const ag = await xp(hoffmann, 'aggregate', 'prediction.exposure.aggregate', { members: [CORRIDOR, PRICE] });
  if (!ag.ok) note(`the aggregation of the corridor and the price risk is REFUSED — ${refusalLine(ag)} (an unaccepted agent estimate or a stale member is never summed; said)`);
  else { const g = ag.body.aggregation; ok(`A. Hoffmann AGGREGATED the corridor and the price risk: method ${g.method}, total ${eur(g.total.low)}–${eur(g.total.high)} against a naive sum of ${eur(g.naive_sum_high)} — the shared driver counted ONCE (${(g.clusters ?? []).map((c) => (c.shared_drivers ?? []).map((x) => short(x.id ?? x)).join('+')).join('; ')}); agent estimates not used: ${(g.agent_estimates_not_used ?? []).length}`); }
}

/* ── B32-H ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-H F-P6-08 — the decomposable Strategic Health Score: supply resilience falls; the drill-down; the change acknowledged, challenged and decided');
const BANDS = [{ key: 'healthy', min: 70 }, { key: 'watch', min: 50 }, { key: 'critical', min: 0 }];
let DEF = null;
if (CORRIDOR && MOROCCO && MSR && OBJ) {
  const model = { min_coverage: 0.6, change_points: 5, min_confidence: 0.3,
    dimensions: [{ key: 'supply_resilience', label: 'Supply resilience', weight: 0.7, objective_ids: [OBJ_REG.id], bands: BANDS },
      { key: 'sourcing', label: 'Sourcing options', weight: 0.3, objective_ids: [OBJ], bands: BANDS }],
    components: [
      { key: 'corridor_transits', label: 'Bab el-Mandeb transits (PortWatch)', dimension: 'supply_resilience', input_kind: 'indicator', input_id: IND.id, weight: 0.4, direction: 'higher_better', normalisation: { worst: 0, best: 60 }, stale_after_days: 3650 },
      { key: 'corridor_risk', label: 'Corridor closure — residual exposure', dimension: 'supply_resilience', input_kind: 'risk', input_id: CORRIDOR, weight: 0.4, direction: 'lower_better', normalisation: { worst: 600000, best: 0 }, stale_after_days: 30, critical: true, critical_below: 10 },
      { key: 'on_time_delivery', label: 'On-time delivery rate', dimension: 'supply_resilience', input_kind: 'measure', input_id: MSR, weight: 0.2, direction: 'higher_better', normalisation: { worst: 70, best: 100 }, stale_after_days: 7 },
      { key: 'morocco_supplier', label: 'Alternative supplier in Morocco — value', dimension: 'sourcing', input_kind: 'opportunity', input_id: MOROCCO, weight: 1, direction: 'higher_better', normalisation: { worst: 0, best: 400000 }, stale_after_days: 90 }] };
  const listed = await hx(weber, 'definitions/list', 'executive.health.read', 'HSD');
  if (listed.ok && listed.body.active) { DEF = listed.body.active; note(`a health definition is active (v${DEF.version}) — an earlier run`); }
  else {
    const pr = await hx(weber, 'definitions/propose', 'executive.health.definition.propose', 'HSD', { model, reason: 'NORDWERK\'s first health model: supply resilience (the corridor, its risk, on-time delivery) and sourcing options' });
    if (!pr.ok) fail('J. Weber proposes the health definition', pr);
    else {
      const d0 = pr.body.definition;
      ok(`J. Weber PROPOSED health definition v${d0.version} (${d0.formula_version}, digest ${d0.model_digest.slice(0, 12)}…): 2 dimensions, 4 components (indicator, risk, measure, opportunity)${d0.gaming_review_required ? ' — FLAGGED for gaming review' : ''}`);
      const selfA = await hx(weber, `definitions/${d0.definition_id}/approve`, 'executive.health.definition.approve', 'HSD', { note: 'approving my own model' }, d0.definition_id);
      expectRefused('J. Weber approving their own definition (no executive role, and the proposer)', selfA, 403);
      const ap = await hx(okafor, `definitions/${d0.definition_id}/approve`, 'executive.health.definition.approve', 'HSD', { note: 'reviewed with the supply chain lead: the weights and bands stand' }, d0.definition_id);
      if (!ap.ok) fail('S. Okafor approves the definition', ap); else { DEF = { ...d0, ...ap.body.definition }; ok(`S. Okafor APPROVED it — ${ap.body.definition.state}, approved by ${nm(ap.body.definition.approved_by)} (the second person)`); }
    }
  }
}
const compute = async (s) => hx(s, 'compute', 'executive.health.compute', 'HSS', {});
const dimOf = (snap, key) => (snap.result?.dimensions ?? []).find((d2) => d2.key === key) ?? null;
const snapLine = (snap) => `status ${snap.status}, coverage ${snap.coverage}, aggregate ${snap.aggregate ?? 'WITHHELD (null)'}; ${(snap.result?.dimensions ?? []).map((d2) => `${d2.key} ${d2.value ?? '—'} ${d2.band ?? ''} (${d2.status})`).join(', ')}`;
let S1 = null; let S2 = null;
if (DEF) {
  const c1 = await compute(hoffmann);
  if (!c1.ok) fail('A. Hoffmann computes S1', c1); else { S1 = c1.body.snapshot; ok(`A. Hoffmann COMPUTED S1 ${short(S1.snapshot_id)}: ${snapLine(S1)}`); }
  // the Risk Agent's re-estimate (probability up) accepted by the owner — the corridor's residual rises
  const agentV = corridorV2 ?? (await q(`select version, digest from prediction.exposure_versions where exposure_id = $1 and assessed_kind = 'agent' and state = 'proposed' order by version desc limit 1`, [CORRIDOR]))[0] ?? null;
  if (agentV) {
    const dg = agentV.digest ?? (await q(`select digest from prediction.exposure_versions where exposure_id = $1 and version = $2`, [CORRIDOR, agentV.version]))[0]?.digest;
    const acc = await xp(brenner, `${CORRIDOR}/versions/${agentV.version}/accept`, 'prediction.exposure.accept', { digest: dg, rationale: 'The agent\'s higher probability matches the latest corridor readings; accepted after review.' }, CORRIDOR);
    if (!acc.ok) fail('C. Brenner accepts the Risk Agent\'s re-estimate', acc);
    else ok(`C. Brenner ACCEPTED the Risk Agent's estimate v${acc.body.acceptance.version} (an agent proposes, the owner decides): residual ${eur(acc.body.acceptance.residual.residual_low)}–${eur(acc.body.acceptance.residual.residual_high)}; superseded ${JSON.stringify(acc.body.acceptance.superseded)}`);
  } else note('the Risk Agent proposed no new corridor version — the residual is unchanged and S2 will show no fall');
  const c2 = await compute(hoffmann);
  if (!c2.ok) fail('A. Hoffmann computes S2', c2);
  else {
    S2 = c2.body.snapshot; const a = dimOf(S1 ?? {}, 'supply_resilience'); const b = dimOf(S2, 'supply_resilience');
    ok(`A. Hoffmann COMPUTED S2 ${short(S2.snapshot_id)}: ${snapLine(S2)}`);
    (a && b && Number(b.value) < Number(a.value) ? ok : bad)(`SUPPLY RESILIENCE ${a?.value ?? '—'} (${a?.band ?? '—'}) → ${b?.value ?? '—'} (${b?.band ?? '—'}), trend ${JSON.stringify(b?.trend ?? null)}; bounds if the excluded input scored 0 / 100: ${JSON.stringify(b?.bounds ?? null)}`);
    note(`the changes raised: ${(S2.changes ?? []).map((c) => `${c.subject} ${c.from_value}→${c.to_value} (${(c.triggers ?? []).join('+')})`).join('; ') || 'none'}`);
  }
}
if (S2) {
  const g = await hx(brenner, `snapshots/${S2.snapshot_id}/get`, 'executive.health.read', 'HSS', {}, S2.snapshot_id);
  if (!g.ok) fail('C. Brenner drills into S2', g);
  else {
    const comps = g.body.snapshot.components ?? [];
    const risk = comps.find((c) => c.key === 'corridor_risk'); const msr = comps.find((c) => c.key === 'on_time_delivery');
    (risk ? ok : bad)(`THE DRILL-DOWN (C. Brenner): corridor risk — value ${eur(risk?.value)}, normalised ${risk?.normalised}, weight ${risk?.weight}, contribution ${risk?.contribution}, confidence ${risk?.confidence ?? '—'}, ${risk?.state}; evidence ${(risk?.evidence ?? []).map((e) => `${e.kind ?? 'object'} ${short(e.object_id ?? e.id)}${e.version ? ` v${e.version}` : ''}`).join(', ') || 'none'}; sensitivity ${JSON.stringify(risk?.sensitivity ?? null).slice(0, 160)}`);
    (msr && msr.state === 'stale' ? ok : bad)(`the on-time measure: ${msr?.state?.toUpperCase()} — ${msr?.freshness_days} days old against its ${msr?.stale_after_days}-day bound; ${msr?.reason ?? ''} (declared and excluded, never averaged away)`);
    for (const c of comps) note(`  component ${c.key} (${c.input_kind}): ${c.state}, value ${c.value ?? '—'}, contribution ${c.contribution ?? '—'}${c.decision_links?.length ? `, decisions ${c.decision_links.map((x) => `"${x.title}" ${short(x.decision_id)}`).join(', ')}` : ''}`);
    note(`peer comparison: ${JSON.stringify(g.body.snapshot.peer)}`);
  }
  const ch = (S2.changes ?? []).find((c) => c.subject === 'dimension:supply_resilience') ?? null;
  if (!ch) bad('no change raised on supply resilience');
  else {
    const a1 = await hx(brenner, `changes/${ch.change_id}/acknowledge`, 'executive.health.change.acknowledge', 'HSC', { note: 'seen: the corridor exposure drives it' }, ch.change_id);
    if (!a1.ok) fail('C. Brenner acknowledges the change', a1); else ok(`C. Brenner ACKNOWLEDGED the supply-resilience change ${short(ch.change_id)} → ${a1.body.change.state}`);
    const c1 = await hx(brandt, `changes/${ch.change_id}/challenge`, 'executive.health.change.challenge', 'HSC', { kind: 'weight', statement: 'the corridor risk weighs as much as the transits it is derived from; the fall double counts the corridor' }, ch.change_id);
    if (!c1.ok) fail('L. Brandt challenges the change', c1); else ok(`L. Brandt CHALLENGED it (weight): ${c1.body.change.state}`);
    const selfD = await hx(okafor, `changes/${ch.change_id}/decide`, 'executive.health.change.decide', 'HSC', { decision: 'dismissed', note: 'the approver decides' }, ch.change_id);
    expectRefused('S. Okafor deciding the challenge (the definition\'s approver)', selfD, 403, /separation/);
    const dd = await hx(dvorak, `changes/${ch.change_id}/decide`, 'executive.health.change.decide', 'HSC', { decision: 'dismissed', note: 'the risk is the exposure after controls, the transits the corridor state; they are different inputs — the fall stands' }, ch.change_id);
    if (!dd.ok) fail('M. Dvořák decides the challenge', dd); else ok(`M. Dvořák DECIDED the challenge: ${dd.body.change.state} (neither the challenger nor the approver) — ${dd.body.change.what_follows ?? ''}`);
  }
  const cmp = await hx(dvorak, 'compare', 'executive.health.read', 'HSS', { snapshot_id: S2.snapshot_id, baseline_id: S1?.snapshot_id });
  if (!cmp.ok) fail('the comparison S2 against S1', cmp);
  else { const k = cmp.body.comparison; ok(`THE COMPARISON S2 against S1: aggregate ${JSON.stringify(k.aggregate)}; ${(k.dimensions ?? []).map((d2) => `${d2.key} ${d2.from}→${d2.to} (${d2.from_band}→${d2.to_band})`).join(', ')}; peer ${JSON.stringify(k.peer)}`); }
}

/* ── B32-9 ───────────────────────────────────────────────────────────────────────────── */
console.log('\nB32-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from graph.alignments where tenant_id = $1 and domain_id = $2 and state = 'active')::int al, (select count(*) from graph.measures where tenant_id = $1 and domain_id = $2)::int ms,
                             (select count(*) from prediction.exposure_current where tenant_id = $1 and domain_id = $2)::int ex, (select count(*) from executive.health_score_snapshots where tenant_id = $1 and domain_id = $2)::int sn`, [T, D]))[0];
  note(`in the ledgers: ${n.al} active alignments, ${n.ms} measures, ${n.ex} exposures, ${n.sn} health snapshots`);
  note('LIMITS said: every amount, target and probability is SYNTHETIC; the measure reading is an analyst\'s entry for a day nine days ago (no delivery-performance feed exists); the Morocco supplier is a hypothesis, not a real supplier; the peer comparison has no input (declared); the anti-gaming flags, the as-of replay, the refused proposal and the conflict / cycle / missing-owner detections are the harnesses\' (phase6-health-b32, phase6-graph-b32), not staged here; the owner-edit anti-gaming clause is not measured (the health input contract carries no owner — a residual named in the records); risk and opportunity events stay in the exposure ledger (the attention opportunity class is B34\'s); the four second-role bindings are the one act outside the governed routes, disclosed above; nothing is cleaned: the objects, the exposures, the decisions opened and the snapshots stand as demonstration facts.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
