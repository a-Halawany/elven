#!/usr/bin/env node
/**
 * CP-6 stage B50 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE KNOWLEDGE CORE —
 * header completeness, identity and time (F-P3-01), the governed work-object lifecycle (F-P3-02), provenance, explanation, unfit marking and
 * challenges (F-P3-03), timeline, as-of and trace (F-P3-04), correction-propagation closure (F-P3-05) — migration 0120 — exercised by named
 * personas through the REAL HTTP routes only (scripts/phase4/governed.mjs), each scene stating what it shows and ASSERTING it (a scene that
 * does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left
 * (read-only SQL) and says "stands — an earlier run" instead of writing it twice. NOTHING IS PLANTED: no row is written by SQL and no clock is
 * moved; the closure contract's short SYNTHETIC acknowledgement window is waited for on the DATABASE clock (DESIGN D8).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (0120 and its harnesses phase6-{prelude,header,lifecycle,impact,provenance,closure,timeline,
 * schema-conformance}-b50, the web unit models and the walks); DEMONSTRATED OPERATION (this act — every persona SYNTHETIC; every acceptance
 * record carries `claim = demonstration`); REAL ACCEPTANCE — the signed scope-specific records of ch6 / ch22 / ch24 (PR-06/22/24-006, AT-06/
 * 22/24) — NEVER claimed: the non-demonstration recording path is construction at B111, then R2.
 *
 * The walker step (DESIGN D10) runs BEFORE this act: scripts/phase6/register-propagation-agent.mjs --register-only (T. Richter revokes the
 * 1.0.0 agent; the platform administrator registers 1.1.0 with backlog 'leave'). B50-0 asserts it.
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument). Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment.
 */
import { closeSync, existsSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, ok, bad, note, failureCount } from '../phase4/governed.mjs';

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

const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const WINDOW_MIN = Number(process.env.EYE_B50_WINDOW_MINUTES ?? 3);
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const dg = (x) => (x ? `${String(x).slice(0, 12)}…` : '—');
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 420)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const rcpt = (r) => (r?.body?.receipt ? `POL ${String(r.body.receipt.policyDecisionId).slice(0, 13)}… · audit seq ${r.body.receipt.auditSeq}` : 'no receipt');
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
await su.query('set default_transaction_read_only = on');
/** READ-ONLY checks (the session is read-only; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const tStart = Date.now();
console.log(`THE B50 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, statuses, re) => {
  const st = Array.isArray(statuses) ? statuses : [statuses];
  if (!r.ok && st.includes(r.status) && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${st.join('/')} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const isRead = (action) => /\.(read|preview|search|list|get|explain|diff|history|replay|trace|scopes)$/.test(action) || /^(graph|objects|observation)\.read/.test(action);
const over = (s, sc, action, objectType, objectId, purposeId, consequence) => ({
  scope: sc, tenantId: sc === 'PLATFORM' ? null : T, domainId: sc === 'DOMAIN' ? D : null, principalId: `principal:${s.principalId}`, purposeId,
  action, objectType, objectId, sideEffect: isRead(action) ? 'none' : 'reversible', consequence: consequence ?? (isRead(action) ? 'C1' : 'C2'), trace: 'phase6-b50' });
/** One retry when the TRANSPORT fails before any answer (a pooled socket reset): no answer means nothing was decided by the server's reply. */
const callOnce = async (path, o, payload, token) => { try { return await call(path, o, payload, token); } catch (e) { if (!/fetch failed/.test(String(e?.message))) throw e; note(`the transport was reset before an answer (${e?.cause?.code ?? e.message}); retried once`); return call(path, o, payload, token); } };
const P = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => callOnce(path, over(s, 'PLATFORM', action, objectType, objectId, purpose), payload, s.token);
const DM = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance', consequence) => callOnce(path, over(s, 'DOMAIN', action, objectType, objectId, purpose, consequence), payload, s.token);
const BASE = `/v1/tenants/${T}/domains/${D}`;
const G = `${BASE}/graph`;
const O = `${BASE}/observation`;
const LC = `${BASE}/lifecycle`;
const OBJ = `${BASE}/objects`;
const DG = '/v1/governance/design';
const DGD = `${BASE}/governance/design`;

/* ── B50-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB50-0 THE STATE — 0120, the walker 1.1.0, the NORDWERK cast, the build identity');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0120%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0120 is not applied'); process.exit(1); }
  const ag = await q(`select agent_id::text id, agent_version, code_digest, status from graph.propagation_agents where tenant_id = $1 and domain_id = $2 order by created_at`, [T, D]);
  const act = ag.filter((a) => a.status === 'active');
  if (act.length === 1 && act[0].agent_version === '1.1.0') ok(`the domain's propagation agent is walker 1.1.0 (${short(act[0].id)}, ${dg(act[0].code_digest)}); earlier registrations: ${ag.filter((a) => a.status !== 'active').map((a) => `${a.agent_version} ${a.status}`).join(', ') || 'none'}`);
  else { bad(`the walker is not re-registered (${act.map((a) => a.agent_version).join(', ') || 'no active agent'}) — run scripts/phase6/register-propagation-agent.mjs --register-only first (DESIGN D10)`); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D])).n > 0;
const CAST = [['d.ivanova', 'domain_specialist', 'DOMAIN'], ['k.mueller', 'knowledge_owner', 'DOMAIN'], ['r.adler', 'record_authority', 'DOMAIN'], ['r.okafor', 'extraction_agent', 'DOMAIN'],
  ['a.hoffmann', 'domain_analyst', 'DOMAIN'], ['m.dvorak', 'collection_manager', 'DOMAIN'], ['n.eriksen', 'forecast_owner', 'DOMAIN'], ['c.brenner', 'risk_owner', 'DOMAIN'],
  ['c.brenner', 'decision_owner', 'DOMAIN'], ['f.aydin', 'data_steward', 'DOMAIN'], ['t.richter', 'domain_admin', 'DOMAIN'], ['chief.of.staff', 'executive_operator', 'DOMAIN'],
  ['s.okafor', 'decision_approver', 'DOMAIN'], ['l.brandt', 'decision_owner', 'DOMAIN'], ['l.haddad', 'design_system_authority', 'PLATFORM'], ['s.iversen', 'design_system_authority', 'PLATFORM'],
  ['p.castellano', 'conformance_steward', 'PLATFORM'], ['h.achterberg', 'independent_assurance', 'PLATFORM'], ['w.zielinska', 'customer_sponsor', 'TENANT']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n !== null) Object.assign(s, n); } };
const ivanova = await persona('d.ivanova'); const mueller = await persona('k.mueller'); const adler = await persona('r.adler'); const okaforX = await persona('r.okafor');
const hoffmann = await persona('a.hoffmann'); const dvorak = await persona('m.dvorak'); const eriksen = await persona('n.eriksen'); const brenner = await persona('c.brenner');
const aydin = await persona('f.aydin'); const richter = await persona('t.richter'); const chief = await persona('chief.of.staff'); const okafor = await persona('s.okafor');
const brandt = await persona('l.brandt');
const dsa = await persona('l.haddad'); const dsaOwner = await persona('s.iversen'); const steward = await persona('p.castellano'); const assurance = await persona('h.achterberg'); const sponsor = await persona('w.zielinska');
const NAME = Object.fromEntries([[ivanova, 'D. Ivanova'], [mueller, 'K. Müller'], [adler, 'R. Adler'], [okaforX, 'R. Okafor'], [hoffmann, 'A. Hoffmann'], [dvorak, 'M. Dvořák'], [eriksen, 'N. Eriksen'],
  [brenner, 'C. Brenner'], [aydin, 'F. Aydın'], [richter, 'T. Richter'], [chief, 'the chief of staff'], [okafor, 'S. Okafor'], [brandt, 'L. Brandt'], [dsa, 'L. Haddad'], [dsaOwner, 'S. Iversen'],
  [steward, 'P. Castellano'], [assurance, 'H. Achterberg'], [sponsor, 'W. Zielińska']].map(([s, n]) => [s.principalId, n]));
const nm = (id) => NAME[String(id ?? '').replace(/^principal:/, '')] ?? short(id);
{
  const c = await P(admin, '/v1/governance/conformance/read', 'governance.read', {}, 'GOV', null, 'governance');
  const b = c.ok ? (c.body.build ?? c.body.identity ?? {}) : {};
  if (c.ok) note(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}`);
  else note(`the build identity was not read (${refusalLine(c)})`);
}

/* ── B50-1 THE HEADER STATED (F-P3-01) ──────────────────────────────────────────────────── */
await renewAll();
console.log('\nB50-1 THE HEADER STATED (F-P3-01) — the "late August" ETA uploaded with its stated time; the new versions\' headers (absences declared, controls inherited, the side ledgers); a version recorded before B50 says so; a decision-active use refused naming the fields');
const objRead = (s, id, path, payload = {}) => DM(s, `${OBJ}/${id}/${path}`, 'objects.read', payload, 'OBJ', id, 'observation');
const PW_SRC = await q1(`select source_id::text id, contract_version::int v from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'imf-portwatch-chokepoints' and lifecycle_state = 'active' limit 1`, [T, D]);
const REC_SRC = await q1(`select source_id::text id, contract_version::int v from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-inbound-records' and lifecycle_state = 'active' limit 1`, [T, D]);
if (PW_SRC === null || REC_SRC === null) { bad(`an input source is missing: imf-portwatch-chokepoints ${!!PW_SRC}, nordwerk-inbound-records ${!!REC_SRC} (act-b33)`); process.exit(1); }
// the PortWatch chokepoint-4 days that carry claims (the corridor's extracted lineage), latest version first
const DAYS = await q(`select e.object_id::text id, e.object_version::int v, to_char((e.event_time at time zone 'UTC')::date, 'YYYY-MM-DD') d, e.lifecycle_state s, e.content_digest digest, e.recorded_at rec,
    (select count(distinct l.claim_object_id)::int from intelligence.claim_lineage l where l.evidence_object_id = e.object_id) claims
  from objects.canonical_objects e join objects.canonical_objects o on o.object_type = 'OBS' and o.object_id = (e.payload ->> 'obs_object_id')::uuid and o.object_version = 1
  where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD' and e.provenance_ref like 'SRC:' || $3 || '@%' and e.event_time is not null
    and not exists (select 1 from objects.canonical_objects n where n.object_id = e.object_id and n.object_version > e.object_version)
    and exists (select 1 from intelligence.claim_lineage l where l.evidence_object_id = e.object_id)
  order by d, e.object_id`, [T, D, PW_SRC.id]);
const EVD_REFS = DAYS.slice(0, 3).map((x) => `EVD:${x.id}@${x.v}`);
note(`the PortWatch chokepoint days with extracted claims (the corridor's lineage): ${DAYS.length} (${DAYS[0]?.d} … ${DAYS[DAYS.length - 1]?.d}); corrected already: ${DAYS.filter((x) => x.s === 'corrected').map((x) => x.d).join(', ') || 'none'}`);
const ETA_FILE = 'inbound-records-nordbearing-eta-late-august-2026.csv';
const ETA_TEXT = ['synthetic,record_id,record_kind,consignee,shipper,material,quantity,unit,eta_stated,via,contract_ref',
  'true,SYN-BKG-7104,booking,Nordbearing AB,Shenzhen precision bearing maker (SYNTHETIC),bearing blank,20000,pcs,late August 2026,malacca|bab-el-mandeb|suez,SYN-PO-2026-0817',
].join('\n') + '\n';
const ETA_TIME = { kind: 'bounded', earliest: '2026-08-21T00:00:00+02:00', latest: '2026-09-01T00:00:00+02:00', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text' };
const evdOfText = async (text) => q1(`select e.object_id::text id, e.object_version::int v, e.source_object_ids from objects.canonical_objects e where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD'
   and e.payload ->> 'content_digest' = $3 and e.provenance_ref like 'SRC:' || $4 || '@%' order by e.object_version desc limit 1`, [T, D, sha256(ETA_TEXT), REC_SRC.id]);
let ETA = await evdOfText(ETA_TEXT);
if (ETA) note(`"${ETA_FILE}" stands as evidence ${short(ETA.id)}@${ETA.v} — an earlier run`);
else {
  const bad1 = await DM(hoffmann, `${O}/upload`, 'observation.run.trigger', { sourceId: REC_SRC.id, contractVersion: REC_SRC.v,
    files: [{ filename: ETA_FILE, mediaType: 'text/csv', base64: Buffer.from(ETA_TEXT, 'utf8').toString('base64'), documentTime: { ...ETA_TIME, earliest: '2026-09-01T00:00:00+02:00', latest: '2026-08-21T00:00:00+02:00' } }] }, 'RUN', null, 'observation', 'C1');
  expectRefused('A. Hoffmann uploads it with a backwards bound (latest before earliest)', bad1, 400, /is not a valid time value/);
  const r = await DM(hoffmann, `${O}/upload`, 'observation.run.trigger', { sourceId: REC_SRC.id, contractVersion: REC_SRC.v,
    files: [{ filename: ETA_FILE, mediaType: 'text/csv', base64: Buffer.from(ETA_TEXT, 'utf8').toString('base64'), documentTime: ETA_TIME }] }, 'RUN', null, 'observation', 'C1');
  if (!r.ok) fail('A. Hoffmann uploads the booking', r);
  else {
    for (let i = 0; i < 30 && ETA === null; i += 1) { await sleep(1000); ETA = await evdOfText(ETA_TEXT); }
    (ETA ? ok : bad)(`A. Hoffmann (domain analyst) UPLOADED "${ETA_FILE}" (SYNTHETIC, ${Buffer.byteLength(ETA_TEXT)} bytes) to nordwerk-inbound-records with its DOCUMENT TIME stated as the publisher wrote it — "late August 2026" = bounded [2026-08-21, 2026-09-01) Europe/Berlin, precision part_of_month, source "publisher text": run ${r.body.run?.state}, ${r.body.run?.admitted} admitted → evidence ${short(ETA?.id)}@${ETA?.v}`);
  }
}
if (ETA) {
  ENV_OUT.EYE_B50_UPLOAD_EVD = ETA.id;
  const h = await objRead(hoffmann, ETA.id, 'header');
  if (!h.ok) fail('A. Hoffmann reads the evidence header', h);
  else {
    const v = h.body.header.versions[0];
    const ev = (v.time ?? []).find((t) => t.axis === 'event');
    const basis = v.operation?.basis ?? {};
    const c = basis.controls ?? {};
    (v.header === 'stated' && ev?.kind === 'bounded' && ev?.precision === 'part_of_month' && ev?.zone === 'Europe/Berlin' && ev?.source === 'publisher text' && ev?.declared === true ? ok : bad)(
      `THE EVIDENCE HEADER — STATED: event time ${ev?.kind} [${iso(ev?.earliest)}, ${iso(ev?.latest)}) ${ev?.precision}, zone ${ev?.zone}, source "${ev?.source}", clock ${ev?.clockQuality}, declared ${ev?.declared}; the other axes ${(v.time ?? []).filter((t) => t.axis !== 'event').map((t) => `${t.axis} ${t.declared ? 'declared' : 'derived'}`).join(', ')}; operation ${v.operation?.boundAction} · idempotency ${v.operation?.idempotencyBasis} · trace ${v.operation?.traceSource}`);
    (c.residency_profile?.value === 'EU' && c.residency_profile?.from === 'source_contract' ? ok : bad)(`THE CONTROLS INHERITED with their basis: ${Object.entries(c).map(([k, x]) => `${k.replace('_profile', '').replace('_ref', '')} ${x.value ?? 'none'} (from ${x.from}${x.ref ? ` ${x.ref}` : ''})`).join('; ')}`);
    note(`the limitations the header states: ${(basis.limitations ?? []).join('; ') || 'none'}; ontology ${basis.ontology?.header ?? '—'}; the declared absences ${JSON.stringify(basis.absences ?? {})}`);
    const g = await objRead(hoffmann, ETA.id, 'get', {});
    const o = g.body?.object ?? {};
    note(`the EVD row: time_precision ${o.time_precision}, event_time ${iso(o.event_time)}, confidence ${JSON.stringify(o.confidence)}, uncertainty ${JSON.stringify(o.uncertainty)}, provenance ${o.provenance_ref}, ontology ${o.ontology_ref}, quality profile ${o.quality_profile}`);
    const obsRef = (ETA.source_object_ids ?? [])[0];
    const obsId = typeof obsRef === 'string' ? obsRef.replace(/^OBS:/, '').replace(/@\d+$/, '') : null;
    if (obsId) {
      const ho = await objRead(hoffmann, obsId, 'header');
      const t = (ho.body?.header?.versions?.[0]?.time ?? []).find((x) => x.axis === 'event');
      (ho.ok && ho.body.header.versions[0].header === 'stated' && t?.precision === 'part_of_month' ? ok : bad)(`the OBSERVATION ${short(obsId)} carries the same stated event time (${t?.kind} ${t?.precision} ${t?.zone}) — header ${ho.body?.header?.versions?.[0]?.header}`);
      ENV_OUT.EYE_B50_UPLOAD_OBS = obsId;
    }
  }
}
{
  // a version recorded BEFORE B50: nothing back-filled — the header read says so
  const old = DAYS.find((x) => x.s === 'admitted');
  const h = old ? await objRead(hoffmann, old.id, 'header') : null;
  const v = h?.body?.header?.versions?.[0];
  (v && v.header === 'recorded before B50 — not populated' && v.operation === null && (v.time ?? []).length === 0 ? ok : bad)(`a PortWatch evidence version recorded before B50 (${old?.d}, ${short(old?.id)}@1): "${v?.header}" — no operation, no time qualifiers; the identity declaration names ${h?.body?.header?.identity?.issuing_authority?.profile ?? '—'} (${(h?.body?.header?.identity?.supersession ?? []).map((x) => x.header).join(', ')})`);
  if (old) ENV_OUT.EYE_B50_PRE_B50_EVD = old.id;
}
{
  // N. Eriksen's corridor forecast (the B24 decision's): its uncertainty a value; its confidence is what its profile declares for a new version
  const opt = await q1(`select o.consequences from decision.options o join decision.packages_current p on p.package_id = o.package_id where p.tenant_id = $1 and p.domain_id = $2 and p.title like 'B24 — second source%' and o.key = 'second-source' limit 1`, [T, D]);
  const fc = (opt?.consequences ?? []).find((x) => x.kind === 'forecast');
  const F = fc ? await q1(`select object_id::text id, object_version::int v, uncertainty, confidence, quality_state, method_ref from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [fc.id]) : null;
  const prof = await DM(hoffmann, `${OBJ}/header-profiles`, 'objects.read', {}, 'OBJ', null, 'observation');
  const fp = prof.ok ? (prof.body.profiles ?? []).find((p) => p.object_type === 'FCT') : null;
  const u = F?.uncertainty ?? {};
  (F && u.q10 !== undefined && fp ? ok : bad)(`N. Eriksen's corridor forecast ${short(F?.id)}@${F?.v} (the B24 decision's): UNCERTAINTY q10 ${u.q10} · q50 ${u.q50} · q90 ${u.q90} (${F?.method_ref}); CONFIDENCE — recorded before B50 on this version (${JSON.stringify(F?.confidence)}); the FCT@${fp?.profile_version} profile states it for every new version: ${fp?.absence?.confidence ? `${fp.absence.confidence.state} — "${fp.absence.confidence.reason}"` : JSON.stringify(fp?.absence ?? {})}; mandatory for a decision option: ${(fp?.mandatory?.decision_option ?? []).join(', ')}`);
  if (F) { ENV_OUT.EYE_B50_FORECAST = F.id; ENV_OUT.EYE_B50_FORECAST_VERSION = F.v; }
}
// A DECISION-ACTIVE USE REFUSED naming the fields (ES-24-003): a generic claim (no confidence, no method) cited by a package option
const MITIGATE = await q1(`select package_id::text id, current_version::int v, owner_principal_id::text owner from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'Mitigate the corridor closure — Regensburg line' limit 1`, [T, D]);
const optionOn = (s, consequences, key, title) => DM(s, `${BASE}/decisions/${MITIGATE.id}/versions/${MITIGATE.v}/options`, 'decision.package.option', { key, title, kind: 'intervention', consequences,
  unsimulatedReason: 'not simulated here: the option exists to show the header and fitness checks at the use (SYNTHETIC; refused — nothing is recorded)' }, 'DPK', MITIGATE.id, 'decision');
{
  const CLM_SUBJECT = 'SYN-BKG-7104 (B50 act)';
  let c = await q1(`select object_id::text id, object_version::int v, content_digest digest, confidence, method_ref from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'CLM' and payload ->> 'subject' = $3 order by object_version desc limit 1`, [T, D, CLM_SUBJECT]);
  if (c) note(`the analyst's generic claim ${short(c.id)} "${CLM_SUBJECT} eta late August 2026" stands — an earlier run`);
  else {
    const r = await DM(hoffmann, OBJ, 'objects.create', { objectType: 'CLM', truthState: 'asserted', classification: 'internal', purposeScope: 'observation', humanRefs: [`principal:${hoffmann.principalId}`],
      payload: { subject: CLM_SUBJECT, predicate: 'eta', object_value: 'late August 2026' } }, 'CLM', null, 'observation');
    if (!r.ok) fail('A. Hoffmann records a generic claim', r);
    else ok(`A. Hoffmann RECORDED a generic claim ${short(r.body.object.object_id)} ("${CLM_SUBJECT}" eta "late August 2026") through the generic create: its header STATES confidence ${JSON.stringify(r.body.object.confidence)}, method ${r.body.object.method_ref ?? 'none'} — ${rcpt(r)}`);
    c = await q1(`select object_id::text id, object_version::int v, content_digest digest, confidence, method_ref from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'CLM' and payload ->> 'subject' = $3 order by object_version desc limit 1`, [T, D, CLM_SUBJECT]);
  }
  if (c && MITIGATE) {
    expectRefused(`C. Brenner (decision owner) derives an option on "Mitigate the corridor closure — Regensburg line" v${MITIGATE.v} citing that claim`, await optionOn(brenner, [{ kind: 'claim', id: c.id, version: c.v, digest: c.digest }], 'b50-eta-claim', 'Expedite the late-August bearing booking (SYNTHETIC)'),
      409, /^object use rejected \(incomplete_header\): CLM .* lacks confidence \(declared not_assessed: .*\).* for decision_option \(header profile CLM@1\)/);
    ENV_OUT.EYE_B50_GENERIC_CLAIM = c.id;
  } else if (!MITIGATE) bad('the draft package "Mitigate the corridor closure — Regensburg line" is absent');
}

/* ── B50-2 THE GOVERNED LIFECYCLE (F-P3-02) ───────────────────────────────────────────────── */
await renewAll();
console.log('\nB50-2 THE GOVERNED LIFECYCLE (F-P3-02) — the Red Sea assessment: authored by D. Ivanova, reviewed by K. Müller, approved by R. Adler, published by its owner (a stale second tab rejected and kept), a proposal declined, retired; replayed at every recorded instant');
const ASM_TITLE = 'Red Sea corridor assessment — Bab el-Mandeb, January 2024 (SYNTHETIC)';
const lc = (s, path, action, payload, id = null, consequence) => DM(s, `${LC}/${path}`, action, payload, 'ASM', id, 'intelligence', consequence);
const asmRow = async () => q1(`select object_id::text id, object_version::int v, lifecycle_state s, content_digest, recorded_at from objects.canonical_objects
   where tenant_id = $1 and domain_id = $2 and object_type = 'ASM' and schema_ref = 'ASM@v3' and payload ->> 'title' = $3 order by object_version desc limit 1`, [T, D, ASM_TITLE]);
const ledgerOf = async (id) => q(`select action, outcome, refusal_code, actor_principal_id::text actor, recorded_at from objects.lifecycle_transitions where object_id = $1 order by recorded_at, transition_id`, [id]);
const K = (step) => `b50-act:asm-red-sea:${step}`;
let ASM = await asmRow();
const move = (s, id, payload) => lc(s, `ASM/${id}/transition`, 'objects.lifecycle.transition', payload, id);
{
  if (ASM === null) {
    const r = await lc(ivanova, 'work-objects/author', 'objects.work_object.author', { objectType: 'ASM', title: ASM_TITLE, idempotencyKey: K('author'),
      statement: 'Container transits through Bab el-Mandeb fell by about two thirds in January 2024 after the attacks on shipping; the corridor stays disrupted for the 90-day horizon and the Regensburg magnet sets need the Cape routing (SYNTHETIC).',
      body: { scope: 'The Red Sea corridor (Bab el-Mandeb)', judgement: 'disrupted', horizon: '90 days', basis: 'IMF PortWatch chokepoint transits, the carrier advisories' },
      evidenceRefs: [], classification: 'internal', purposeScope: 'intelligence', synthetic: true });
    if (!r.ok) fail('D. Ivanova authors the assessment', r);
    else ok(`D. Ivanova (domain specialist, human gate) AUTHORED "${ASM_TITLE}" ${short(r.body.transition.object_id)}: ${r.body.transition.from ?? '∅'} → ${String(r.body.transition.to).toUpperCase()} v${r.body.transition.object_version}, she is its accountable owner (${r.body.transition.actor_class}) — ${rcpt(r)}`);
    ASM = await asmRow();
  } else note(`the assessment ${short(ASM.id)} "${ASM_TITLE}" stands at v${ASM.v} ${String(ASM.s).toUpperCase()} — an earlier run`);
}
if (ASM) {
  ENV_OUT.EYE_B50_ASSESSMENT = ASM.id;
  if (ASM.s === 'draft') {
    expectRefused('D. Ivanova reviews her own draft', await move(ivanova, ASM.id, { expectedVersion: ASM.v, action: 'review', idempotencyKey: K('self-review'), reason: 'Reviewing my own draft (refused)' }), 403, /^lifecycle transition rejected \(separation_of_duties\): review is never done by the author/);
    const r = await move(mueller, ASM.id, { expectedVersion: ASM.v, action: 'review', idempotencyKey: K('review'),
      reason: 'Findings: the PortWatch chokepoint transits for January 2024 and two carrier advisories support the judgement; the 90-day horizon rests on the corridor forecast (SYNTHETIC)',
      changes: { evidence_refs: EVD_REFS.slice(0, 3) } });
    if (!r.ok) fail('K. Müller reviews the assessment', r);
    else ok(`K. Müller (knowledge owner — never the author) REVIEWED it: ${r.body.transition.from} → ${String(r.body.transition.to).toUpperCase()} v${r.body.transition.object_version}, the findings and ${EVD_REFS.slice(0, 3).length} evidence reference(s) recorded on the version — ${rcpt(r)}`);
    ASM = await asmRow();
  }
  if (ASM.s === 'reviewed') {
    const x = await move(mueller, ASM.id, { expectedVersion: ASM.v, action: 'publish', idempotencyKey: K('mueller-publish') });
    if (expectRefused('K. Müller (the reviewer, not the owner) publishes it', x, 403, /^lifecycle transition rejected \(authority\): publish is the accountable owner's act/))
      note(`the refused attempt is KEPT in the ledger: outcome ${x.body?.outcome?.outcome}, ${x.body?.outcome?.refusal?.code}, the authoritative version stays v${x.body?.outcome?.last_authoritative_version}`);
    expectRefused('K. Müller (this cycle\'s reviewer) approves what she reviewed', await move(mueller, ASM.id, { expectedVersion: ASM.v, action: 'approve', idempotencyKey: K('mueller-approve'), reason: 'Approving what I reviewed (refused)' }), 403, /^lifecycle transition rejected \(separation_of_duties\): approve is never done by the reviewer/);
    const r = await move(adler, ASM.id, { expectedVersion: ASM.v, action: 'approve', idempotencyKey: K('approve'), reason: 'Rationale: the exact reviewed version is fit for the corridor desk; its evidence is cited (SYNTHETIC)' });
    if (!r.ok) fail('R. Adler approves the assessment', r);
    else ok(`R. Adler (record authority — neither the author nor the reviewer) APPROVED v${r.body.transition.object_version - 1}: → ${String(r.body.transition.to).toUpperCase()} v${r.body.transition.object_version} — ${rcpt(r)}`);
    ASM = await asmRow();
  }
  if (ASM.s === 'approved') {
    // the extraction agent's login (r.okafor — a HUMAN-kind login holding extraction_agent on this demonstration): no transition; a proposal only
    expectRefused('R. Okafor (the extraction agent role) publishes it', await move(okaforX, ASM.id, { expectedVersion: ASM.v, action: 'publish', idempotencyKey: K('okafor-publish') }), 403, /no qualifying role binding/);
    let prop = await q1(`select p.proposal_id::text id, d.decision from objects.lifecycle_proposals p left join objects.lifecycle_proposal_decisions d on d.proposal_id = p.proposal_id where p.object_id = $1 and p.proposer_principal_id = $2 order by p.proposed_at desc limit 1`, [ASM.id, okaforX.principalId]);
    if (prop === null) {
      const r = await lc(okaforX, `ASM/${ASM.id}/proposals/propose`, 'objects.lifecycle.propose', { requestId: randomUUID(), baseVersion: ASM.v, action: 'publish', via: 'view',
        reason: 'The review and the approval are recorded; publish it for the corridor desk (SYNTHETIC proposal from the extraction desk)' }, ASM.id);
      if (!r.ok) fail('R. Okafor proposes publishing', r);
      else ok(`R. Okafor PROPOSED "publish" on v${r.body.proposal.base_version} (${r.body.proposal.proposer_kind}, via ${r.body.proposal.via}) — never authoritative — ${rcpt(r)}`);
      prop = await q1(`select p.proposal_id::text id, d.decision from objects.lifecycle_proposals p left join objects.lifecycle_proposal_decisions d on d.proposal_id = p.proposal_id where p.object_id = $1 and p.proposer_principal_id = $2 order by p.proposed_at desc limit 1`, [ASM.id, okaforX.principalId]);
    }
    if (prop && prop.decision === null) {
      expectRefused('K. Müller decides the proposal (not the owner)', await lc(mueller, `ASM/${ASM.id}/proposals/${prop.id}/decide`, 'objects.lifecycle.proposal.decide', { requestId: randomUUID(), decision: 'decline', reason: 'Not mine to decide (refused)' }, ASM.id), 403, /^lifecycle proposal rejected \(authority\): only the accountable owner/);
      const r = await lc(ivanova, `ASM/${ASM.id}/proposals/${prop.id}/decide`, 'objects.lifecycle.proposal.decide', { requestId: randomUUID(), decision: 'decline', reason: 'I publish it myself after reading the review and the approval (SYNTHETIC)' }, ASM.id);
      if (!r.ok) fail('D. Ivanova declines the proposal', r); else ok(`D. Ivanova (the owner) DECLINED the proposal with her reason: ${r.body.decision.decision}, no transition (${r.body.decision.transition_id ?? 'none'}) — ${rcpt(r)}`);
    }
    // the owner publishes (the page's Command Review + TypedConfirmation is the walk's; the server binds the expected version and the key)
    const tab1 = ASM.v;
    const r = await move(ivanova, ASM.id, { expectedVersion: tab1, action: 'publish', idempotencyKey: K('publish') });
    if (!r.ok) fail('D. Ivanova publishes', r);
    else ok(`D. Ivanova (the accountable owner, human gate) PUBLISHED it: ${r.body.transition.from} → ${String(r.body.transition.to).toUpperCase()} v${r.body.transition.object_version} — ${rcpt(r)}`);
    // THE SECOND TAB: the same person, the version she read before the first tab's publish — rejected, the attempt kept
    const t2 = await move(ivanova, ASM.id, { expectedVersion: tab1, action: 'publish', idempotencyKey: K('publish-tab2') });
    if (expectRefused('D. Ivanova\'s SECOND TAB publishes over the version it read', t2, 409, /^lifecycle transition rejected \(stale\): the command expected version \d+; the authoritative version is \d+ \(published\)/))
      note(`the stale attempt is KEPT: ${t2.body?.outcome?.refusal?.code}, the authoritative version v${t2.body?.outcome?.last_authoritative_version}`);
    const again = await move(ivanova, ASM.id, { expectedVersion: tab1, action: 'publish', idempotencyKey: K('publish') });
    (again.ok && again.body.transition.repeated === true ? ok : bad)(`the first tab's command REPEATED (the same key) answers the first result: repeated ${again.body?.transition?.repeated}, v${again.body?.transition?.object_version}`);
    ASM = await asmRow();
  }
  if (ASM.s === 'published') {
    const r = await move(ivanova, ASM.id, { expectedVersion: ASM.v, action: 'retire', idempotencyKey: K('retire'), reason: 'The January 2024 judgement is superseded by the quarterly corridor view (SYNTHETIC)' });
    if (!r.ok) fail('D. Ivanova retires the assessment', r);
    else ok(`D. Ivanova RETIRED it with her reason: ${r.body.transition.from} → ${String(r.body.transition.to).toUpperCase()} v${r.body.transition.object_version} — ${rcpt(r)}`);
    ASM = await asmRow();
  }
  // THE RECORD: history, the replay at each recorded instant, the export and its verification
  const h = await lc(mueller, `ASM/${ASM.id}/history`, 'objects.lifecycle.read', {}, ASM.id);
  if (!h.ok) fail('K. Müller reads the lifecycle history', h);
  else {
    const L = h.body.lifecycle;
    const tr = (L.transitions ?? []).map((t) => `${t.action}${t.outcome === 'rejected' ? `✗(${t.refusal?.code ?? t.refusal_code ?? 'refused'})` : ''}`);
    note(`the ledger (${(L.transitions ?? []).length} attempts, oldest first): ${tr.join(' · ')}; agreement ${L.agreement}; proposals ${(L.proposals ?? []).length} (${(L.proposals ?? []).map((p) => p.decision?.decision ?? 'open').join(', ')})`);
    const got = [];
    for (const v of L.versions ?? []) {
      const rp = await lc(mueller, `ASM/${ASM.id}/replay`, 'objects.lifecycle.read', { asOf: new Date(v.recorded_at).toISOString() }, ASM.id);
      got.push(rp.ok && rp.body.replay.known && rp.body.replay.agrees ? rp.body.replay.state : `✗${rp.body?.replay?.state ?? refusalLine(rp)}`);
    }
    const want = ['draft', 'reviewed', 'approved', 'published', 'retired'];
    (JSON.stringify(got) === JSON.stringify(want) ? ok : bad)(`REPLAY at each recorded instant reads ${got.join(' → ')} (each agreeing with the ledger)`);
    const rej = (L.transitions ?? []).filter((t) => t.outcome === 'rejected').map((t) => t.refusal?.code ?? t.refusal_code);
    (['not_owner', 'stale_version'].every((c) => rej.includes(c)) ? ok : bad)(`the REJECTED attempts are kept beside the accepted ones: ${rej.join(', ')}`);
    ENV_OUT.EYE_B50_ASSESSMENT_PUBLISHED_AT = new Date((L.versions ?? []).find((v) => v.state === 'published')?.recorded_at ?? Date.now()).toISOString();
  }
  const ex = await lc(mueller, `ASM/${ASM.id}/export`, 'objects.lifecycle.read', {}, ASM.id);
  if (!ex.ok) fail('the lifecycle export', ex);
  else {
    const vf = await DM(mueller, `${LC}/verify-export`, 'objects.lifecycle.read', { document: ex.body.document }, 'OLC', null, 'intelligence');
    (vf.ok && vf.body.verification.valid === true ? ok : bad)(`the lifecycle EXPORT (${ex.body.document.format}, ${ex.body.document.versions.length} versions, digest ${dg(ex.body.document.digest)}) re-imported and VERIFIED: valid ${vf.body?.verification?.valid}, replay ${(vf.body?.verification?.replay ?? []).map((x) => x.state).join(' → ')}`);
  }
}

/* ── B50-3 THE CORRECTION — ONE PORTWATCH RESTATEMENT CARRIES F-P3-03 AND F-P3-05 (D6) ───────────── */
await renewAll();
console.log('\nB50-3 THE CORRECTION (F-P3-03 + F-P3-05, one case for both — D6) — the closure contract declared; the day chosen by the read-only preview; the restatement received and applied; the walker 1.1.0 walks it; the revision diff, the backward explanation, the forward impact classed');
const PUB_REF = 'B50 act — IMF PortWatch restatement of a chokepoint-4 day (SYNTHETIC)';
const caseRow = async () => q1(`select case_id::text id, state, propagation_state, received_at, closed_at applied_at, affected_resolved from observation.correction_current where tenant_id = $1 and domain_id = $2 and publisher_ref like $3 || '%' order by received_at desc limit 1`, [T, D, PUB_REF]);
let CASE = await caseRow();
const gr = (s, path, action, payload = {}, objectType = 'COR', objectId = null, consequence) => DM(s, `${G}/${path}`, action, payload, objectType, objectId, 'graph', consequence);
const closureRead = async (s, check = false) => { const r = await gr(s, `closure/cases/${CASE.id}`, 'graph.read', check ? { check: true } : {}, 'COR', CASE.id); return r.ok ? r.body.closure : null; };
const DEMO_STATEMENT = `B50 demonstration closure contract (SYNTHETIC): every consumer class acknowledged within ${WINDOW_MIN} minutes — a short window so the stall is shown on the database clock; never an operating contract`;
const ORDINARY_STATEMENT = 'The corridor\'s closure contract after the B50 demonstration: stale and challenged products within 3 days, withdrawn within 1 day, recomputes within 7 days, human reviews within 5 days, subscriptions within 1 day';
const contractRow = async () => q1(`select contract_id::text id, version, windows, synthetic, statement from graph.closure_contracts where tenant_id = $1 and domain_id = $2 order by version desc limit 1`, [T, D]);
// THE DAY: the first uncorrected PortWatch day whose walk reaches the claims, the corridor forecast, the warning, a briefing and a commitment
let DAY = null;
if (CASE) {
  const ids = (CASE.affected_resolved ?? []).map((x) => x.object_id ?? x.id ?? x);
  DAY = DAYS.find((x) => ids.includes(x.id)) ?? null;
  note(`the restatement case ${short(CASE.id)} stands — an earlier run (${CASE.state}, propagation ${CASE.propagation_state}; the day ${DAY?.d ?? '—'})`);
} else {
  const W = ['reachedClaims', 'forecasts', 'warnings', 'briefings', 'commitments'];
  for (const x of DAYS.filter((d) => d.s === 'admitted')) {
    const p = await gr(hoffmann, 'impact/preview', 'graph.read', { triggerObjectId: x.id, triggerKind: 'evidence_correction' }, 'INV', x.id);
    if (!p.ok) { fail(`the read-only preview of ${x.d}`, p); break; }
    const i = p.body.impact; const n = Object.fromEntries(W.map((k) => [k, (i[k] ?? []).length]));
    if (n.reachedClaims >= 2 && W.every((k) => n[k] > 0)) {
      DAY = { ...x, preview: i };
      ok(`THE DAY CHOSEN by the read-only preview (nothing written): ${x.d} (${short(x.id)}@${x.v}) — its walk would reach ${W.map((k) => `${k} ${n[k]}`).join(', ')}; also ${['decisionPackages', 'publications', 'exportPackages', 'evaluationDatasets'].map((k) => `${k} ${(i[k] ?? []).length}`).join(', ')}`);
      break;
    }
    note(`${x.d}: the walk would reach ${W.map((k) => `${k} ${n[k]}`).join(', ')} — not all five; the next day`);
  }
  if (DAY === null) { bad('no uncorrected PortWatch day reaches the five classes — the act plants nothing'); }
}
// THE CLOSURE CONTRACT (D8): the domain administrator declares a short SYNTHETIC window before the case opens
{
  let k = await contractRow();
  if (CASE === null && DAY) {
    expectRefused('M. Dvořák (collection manager) declares the closure contract', await gr(dvorak, 'closure/contract/declare', 'graph.closure.contract.declare', { windows: Object.fromEntries(['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'].map((c) => [c, WINDOW_MIN * 60])), exceptionMaxDays: 30, synthetic: true, statement: DEMO_STATEMENT }, 'CCT'), 403);
    expectRefused('T. Richter declares a 3-minute window NOT marked synthetic', await gr(richter, 'closure/contract/declare', 'graph.closure.contract.declare', { windows: Object.fromEntries(['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'].map((c) => [c, WINDOW_MIN * 60])), exceptionMaxDays: 30, synthetic: false, statement: DEMO_STATEMENT }, 'CCT'), 422, /\(synthetic\)/);
    if (k?.statement === DEMO_STATEMENT) note(`the demonstration contract v${k.version} stands — an earlier run`);
    else {
      const r = await gr(richter, 'closure/contract/declare', 'graph.closure.contract.declare', { windows: Object.fromEntries(['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'].map((c) => [c, WINDOW_MIN * 60])), exceptionMaxDays: 30, synthetic: true, statement: DEMO_STATEMENT }, 'CCT');
      if (!r.ok) fail('T. Richter declares the demonstration closure contract', r);
      else ok(`T. Richter (domain administrator, human gate) DECLARED the closure contract v${r.body.contract.version} — SYNTHETIC: every consumer class within ${WINDOW_MIN * 60} s, a bounded exception at most 30 days (digest ${dg(r.body.contract.contract_digest)}) — ${rcpt(r)}`);
      k = await contractRow();
    }
  } else note(`the closure contract in force: v${k?.version ?? '—'} (${k?.synthetic ? 'SYNTHETIC' : 'ordinary'}; windows ${JSON.stringify(k?.windows ?? {})})`);
}
// THE RESTATEMENT received by A. Hoffmann, applied by M. Dvořák — nobody calls /impact/propagate
if (CASE === null && DAY) {
  const r = await DM(hoffmann, `${O}/corrections/submit`, 'observation.correction.receive', { sourceId: PW_SRC.id, kind: 'correction', channel: 'publisher re-publication',
    publisherRef: `${PUB_REF}: ${DAY.d}`, reason: `IMF PortWatch restated the chokepoint-4 (Bab el-Mandeb) transit count of ${DAY.d} (SYNTHETIC restatement for the B50 demonstration)`, affectedEvdIds: [DAY.id] }, 'COR', null, 'observation');
  if (!r.ok) fail('A. Hoffmann receives the restatement', r);
  else {
    ok(`A. Hoffmann (domain analyst) RECEIVED the publisher's restatement of ${DAY.d}: case ${short(r.body.correction.caseId)} ${r.body.correction.state} — ${rcpt(r)}`);
    const a = await DM(dvorak, `${O}/corrections/${r.body.correction.caseId}/apply`, 'observation.correction.apply', { decision: 'apply', affectedEvdIds: [DAY.id], reason: 'restatement verified against the publisher\'s re-publication (SYNTHETIC)' }, 'COR', r.body.correction.caseId, 'observation');
    if (!a.ok) fail('M. Dvořák applies the restatement', a);
    else ok(`M. Dvořák (collection manager — the correction authority) APPLIED it: ${(a.body.correction.superseded ?? []).map((x) => `${short(x.object_id)} v${x.from} → v${x.to}`).join(', ')} — nobody calls /impact/propagate — ${rcpt(a)}`);
  }
  CASE = await caseRow();
}
if (CASE) {
  ENV_OUT.EYE_B50_CASE = CASE.id;
  if (DAY) { ENV_OUT.EYE_B50_CORRECTED_EVD = DAY.id; }
  // THE AUTOMATIC WALK (walker 1.1.0)
  let att = null; const t0 = Date.now();
  for (let i = 0; i < 120; i += 1) {
    att = await q1(`select state, agent_id::text agent, attempts, deliveries, roots_walked, last_error, finished_at from graph.propagation_attempts where case_id = $1 order by last_delivered_at desc limit 1`, [CASE.id]);
    if (att && ['complete', 'partial', 'failed'].includes(att.state)) break;
    await sleep(1000);
  }
  const agentV = att ? await q1(`select agent_version from graph.propagation_agents where agent_id = $1`, [att.agent]) : null;
  (att?.state === 'complete' ? ok : bad)(`THE AUTOMATIC WALK: attempt ${att?.state ?? 'never received'} by the propagation agent ${short(att?.agent)} (walker ${agentV?.agent_version ?? '—'})${att?.state === 'complete' ? `, ${(att.roots_walked ?? []).length} root(s) walked` : ` — ${att?.last_error ?? ''}`} (read ${Math.round((Date.now() - t0) / 1000)} s after)`);
  CASE = await caseRow();
  (CASE.propagation_state === 'complete' ? ok : bad)(`the case reads propagation ${CASE.propagation_state}`);
  // THE REVISION DIFF on the corrected evidence (v1 → v2)
  const ev = DAY ? await q1(`select object_version::int v from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [DAY.id]) : null;
  if (ev && ev.v >= 2) {
    const d = await gr(mueller, 'provenance/diff', 'graph.provenance.read', { type: 'EVD', id: DAY.id, from: ev.v - 1, to: ev.v }, 'EVD', DAY.id);
    if (!d.ok) fail('K. Müller reads the revision diff', d);
    else {
      const x = d.body.diff;
      ok(`THE REVISION DIFF of EVD ${short(DAY.id)} v${ev.v - 1} → v${ev.v}: header ${(x.header ?? []).map((h) => h.field).join(', ')}; payload ${(x.payload ?? []).length} change(s) (the restatement re-records the same bytes under the correction — said, not invented); the chain ${(x.chain ?? []).map((c) => `v${c.version} ${c.lifecycle}`).join(' → ')}; impact recorded since v${ev.v - 1}: ${(x.impact?.recorded ?? []).length} invalidation(s)`);
    }
    ENV_OUT.EYE_B50_CORRECTED_EVD_VERSION = ev.v;
  }
  if (DAY && ev && ev.v >= 2) {
    const x1 = await gr(mueller, 'provenance/explain', 'graph.provenance.read', { type: 'EVD', id: DAY.id, version: ev.v - 1 }, 'EVD', DAY.id);
    const o1 = x1.ok ? (x1.body.explain.outcomes ?? {}) : {};
    ((o1.corrected ?? 0) >= 1 ? ok : bad)(`the explanation of the CORRECTED evidence v${ev.v - 1}: ${Object.entries(o1).map(([k, v]) => `${k} ${v}`).join(', ')} — ${((x1.body?.explain?.nodes ?? []).filter((n) => n.outcome === 'corrected').map((n) => n.label).slice(0, 2).join(' · ')) || refusalLine(x1)}; forward: ${(x1.body?.explain?.forward?.invalidations ?? []).length} invalidation(s), ${(x1.body?.explain?.forward?.options ?? []).length} option(s)`);
  }
  // THE FORWARD IMPACT CLASSED (affected-class@1)
  const af = await gr(mueller, 'impact/affected', 'graph.read', { caseId: CASE.id }, 'COR', CASE.id);
  if (!af.ok) fail('K. Müller reads the classed impact', af);
  else {
    const P_ = af.body.products ?? [];
    const by = (b) => P_.filter((p) => p.bucket === b).length;
    const cls = af.body.classes ?? {};
    ok(`THE FORWARD IMPACT CLASSED (${af.body.ruleVersion}): ${P_.length} product(s) — ${Object.entries(cls).map(([k, v]) => `${k} ${v}`).join(', ')}; by bucket: claims ${by('graph_state')}, forecasts ${by('forecasts')}, warnings ${by('warnings')}, briefings ${by('briefings')}, commitments ${by('commitments')}, decision packages ${by('decision_packages')}, publications ${by('publications')}, export packages ${by('export_packages')}, evaluation datasets ${by('evaluation_datasets')}`);
    const fcts = P_.filter((p) => p.objectType === 'FCT' && p.bucket === 'forecasts');
    const f0 = fcts.find((p) => p.objectId === ENV_OUT.EYE_B50_FORECAST) ?? fcts[0];
    (f0?.class === 'recompute' ? ok : bad)(`the corridor forecast ${short(f0?.objectId)} is classed ${f0?.class} (its path ${(f0?.path ?? []).map((r) => String(r).slice(0, 3)).join(' → ')}); a package is ${P_.find((p) => p.bucket === 'decision_packages')?.class ?? '—'}, a briefing ${P_.find((p) => p.bucket === 'briefings')?.class ?? '—'}, a claim ${P_.find((p) => p.bucket === 'graph_state')?.class ?? '—'}`);
    if (f0) { ENV_OUT.EYE_B50_WALKED_FORECAST = f0.objectId; ENV_OUT.EYE_B50_WALKED_FORECAST_VERSION = f0.version ?? (await q1(`select max(object_version)::int v from objects.canonical_objects where object_id = $1`, [f0.objectId])).v; }
  }
  // THE BACKWARD EXPLANATION of the walked forecast — the denied node is A. Hoffmann's refused fitness mark on it (an analyst marks nothing)
  const FID = ENV_OUT.EYE_B50_WALKED_FORECAST; const FV = Number(ENV_OUT.EYE_B50_WALKED_FORECAST_VERSION ?? 1);
  if (FID) {
    const denied = await q1(`select count(*)::int n from policy.policy_decisions where action = 'graph.provenance.fitness.mark' and object_id = $1 and decision <> 'allow'`, [FID]);
    if ((denied?.n ?? 0) === 0) expectRefused('A. Hoffmann (domain analyst) marks the forecast\'s fitness', await gr(hoffmann, 'provenance/fitness/mark', 'graph.provenance.fitness.mark', { type: 'FCT', id: FID, version: FV, note: 'an analyst marking a forecast (refused: no qualifying role)' }, 'FCT', FID), 403);
    const x = await gr(mueller, 'provenance/explain', 'graph.provenance.read', { type: 'FCT', id: FID, version: FV }, 'FCT', FID);
    if (!x.ok) fail('K. Müller reads the explanation of the forecast', x);
    else {
      const e = x.body.explain; const o = e.outcomes ?? {};
      const show = (e.nodes ?? []).filter((n) => ['denied', 'failed', 'corrected', 'abstained', 'challenged'].includes(n.outcome)).slice(0, 3).map((n) => `[${String(n.outcome).toUpperCase()}] ${String(n.label).slice(0, 90)}`);
      ((o.denied ?? 0) >= 1 && ((o.failed ?? 0) + (o.corrected ?? 0)) >= 1 ? ok : bad)(`THE BACKWARD EXPLANATION of FCT ${short(FID)} v${FV} (${e.method}): ${(e.nodes ?? []).length} node(s) — ${Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ')}; ${e.incomplete ? 'INCOMPLETE' : 'complete'} (${(e.gaps ?? []).length} gap(s)); e.g. ${show.join(' · ')}; the tool boundary ${e.boundaries?.tool?.state ?? '—'} (${e.boundaries?.tool?.carrier ?? ''})`);
    }
  }
}

/* ── B50-4 THE CONTEST PATH, UNFIT, THE TRIGGERS (F-P3-03) ────────────────────────────────── */
await renewAll();
console.log('\nB50-4 THE CONTEST PATH, UNFIT MARKING AND THE TRIGGERS (F-P3-03) — N. Eriksen challenges a claim of the corrected day; K. Müller reviews and upholds; the claim marked UNFIT and refused at a package option (a version recorded before B50, refused with its reason); F. Aydın\'s data-quality finding walked');
const stableUuid = (label) => { const h = sha256(`b50-act:${label}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const pv = (s, path, action, payload, objectType, objectId) => DM(s, `${G}/provenance/${path}`, action, payload, objectType, objectId, 'graph');
let CLAIM = null;
if (DAY) {
  CLAIM = await q1(`select c.object_id::text id, c.object_version::int v, c.content_digest digest, c.accountable_owner owner, c.lifecycle_state s from intelligence.claim_lineage l
     join objects.canonical_objects c on c.object_id = l.claim_object_id and c.object_type = 'CLM' and not exists (select 1 from objects.canonical_objects n where n.object_id = c.object_id and n.object_version > c.object_version)
     where l.evidence_object_id = $1 order by c.object_id limit 1`, [DAY.id]);
}
if (CLAIM === null) bad('the corrected day carries no CLM claim to contest');
else {
  ENV_OUT.EYE_B50_CLAIM = CLAIM.id; ENV_OUT.EYE_B50_CLAIM_VERSION = CLAIM.v;
  note(`the claim ${short(CLAIM.id)}@${CLAIM.v} of the corrected day ${DAY.d} (owner ${String(CLAIM.owner).startsWith('agent:') ? 'the extraction agent — no human owner' : nm(CLAIM.owner)}; recorded before B50)`);
  let ch = await q1(`select challenge_id::text id, state, opened_by::text opened_by, reviewer::text reviewer from graph.knowledge_challenges where subject_id = $1 and opened_by = $2 order by opened_at desc limit 1`, [CLAIM.id, eriksen.principalId]);
  if (ch === null) {
    const r = await pv(eriksen, 'challenges', 'graph.provenance.challenge.open', { type: 'CLM', id: CLAIM.id, version: CLAIM.v, requestId: stableUuid('challenge-claim'),
      grounds: `The claim rests on the PortWatch transit count of ${DAY.d}, which the publisher has since restated; the extracted figure no longer matches its evidence (SYNTHETIC)`, disputed: ['object_value'], reviewWithinDays: 7 }, 'KCH', null);
    if (!r.ok) fail('N. Eriksen opens the challenge', r);
    else ok(`N. Eriksen (forecast owner — neither the claim's owner nor a reviewer) OPENED a knowledge challenge ${short(r.body.challenge.challenge_id)} on CLM v${CLAIM.v}: ${r.body.challenge.state}, review by ${iso(r.body.challenge.review_by)} — ${rcpt(r)}`);
    ch = await q1(`select challenge_id::text id, state, opened_by::text opened_by, reviewer::text reviewer from graph.knowledge_challenges where subject_id = $1 and opened_by = $2 order by opened_at desc limit 1`, [CLAIM.id, eriksen.principalId]);
  } else note(`N. Eriksen's challenge ${short(ch.id)} stands (${ch.state}) — an earlier run`);
  if (ch?.state === 'open') {
    expectRefused('N. Eriksen (the opener) reviews his own challenge', await pv(eriksen, `challenges/${ch.id}/review`, 'graph.provenance.challenge.review', {}, 'KCH', ch.id), 403);
    const r = await pv(mueller, `challenges/${ch.id}/review`, 'graph.provenance.challenge.review', {}, 'KCH', ch.id);
    if (!r.ok) fail('K. Müller starts the review', r); else ok(`K. Müller (knowledge owner) STARTED the review: ${r.body.challenge.state}, reviewer ${nm(r.body.challenge.reviewer)} — ${rcpt(r)}`);
    ch = await q1(`select challenge_id::text id, state from graph.knowledge_challenges where challenge_id = $1`, [ch.id]);
  }
  if (ch?.state === 'under_review') {
    const ev = await q1(`select object_version::int v, content_digest d from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [DAY.id]);
    const e = await pv(eriksen, `challenges/${ch.id}/evidence`, 'graph.provenance.challenge.evidence', { ref: `EVD:${DAY.id}@${ev.v}`, digest: ev.d, note: 'the corrected evidence version the claim does not yet reflect (SYNTHETIC)' }, 'KCH', ch.id);
    if (!e.ok) fail('N. Eriksen submits the corrected evidence', e); else ok(`N. Eriksen SUBMITTED the corrected evidence EVD v${ev.v} (digest ${dg(ev.d)}) as a party to the challenge`);
    const d = await pv(mueller, `challenges/${ch.id}/decide`, 'graph.provenance.challenge.decide', { decision: 'upheld', note: 'Upheld: the claim was extracted from the version the publisher restated; it stays recorded and is marked for adjudication (SYNTHETIC)' }, 'KCH', ch.id);
    if (!d.ok) fail('K. Müller decides the challenge', d); else ok(`K. Müller DECIDED it UPHELD — ${d.body.challenge.next ?? ''} — ${rcpt(d)}`);
  }
  // THE FITNESS MARK — the evaluation's verdict, recorded by a person (never the caller's choice)
  const fit = await pv(mueller, 'fitness', 'graph.provenance.read', { type: 'CLM', id: CLAIM.id, version: CLAIM.v }, 'CLM', CLAIM.id);
  const mark = fit.ok ? fit.body.fitness.mark : null;
  if (mark?.verdict === 'unfit') note(`the claim's UNFIT mark ${short(mark.mark_id)} stands — an earlier run (${(mark.reasons ?? []).join(', ')}, routed to ${mark.route})`);
  else {
    note(`the fitness evaluation of the claim: ${fit.body?.fitness?.evaluation?.verdict} (${(fit.body?.fitness?.evaluation?.reasons ?? []).join(', ')})`);
    const m = await pv(mueller, 'fitness/mark', 'graph.provenance.fitness.mark', { type: 'CLM', id: CLAIM.id, version: CLAIM.v, route: 'adjudication', markId: stableUuid('unfit-claim'),
      note: 'The upheld challenge leaves the claim unsupported by its corrected evidence; adjudication decides its replacement (SYNTHETIC)' }, 'CLM', CLAIM.id);
    if (!m.ok) fail('K. Müller marks the claim\'s fitness', m);
    else (m.body.mark.verdict === 'unfit' ? ok : bad)(`K. Müller RECORDED the evaluation's verdict: ${String(m.body.mark.verdict).toUpperCase()} (${(m.body.mark.reasons ?? []).join(', ')}), routed to ${m.body.mark.route} (${m.body.mark.routed_to ?? '—'}); refuses use ${m.body.mark.refuses_use} — ${rcpt(m)}`);
  }
  if (MITIGATE) expectRefused(`C. Brenner derives an option citing the UNFIT claim (CLM v${CLAIM.v}, recorded before B50)`, await optionOn(brenner, [{ kind: 'claim', id: CLAIM.id, version: CLAIM.v, digest: CLAIM.digest }], 'b50-unfit-claim', 'Reroute on the restated January transits (SYNTHETIC)'),
    409, /^object use rejected \(unfit\): CLM .* is marked unfit \(unsupported_claim\).* it is not used for decision_option/);
  const cl = await pv(mueller, 'challenges/list', 'graph.provenance.read', { subjectId: CLAIM.id, state: 'all' }, 'KCH', null);
  if (cl.ok) note(`the contest path of the claim: ${(cl.body.challenges?.challenges ?? []).map((c) => `${short(c.challenge_id)} ${String(c.state).toUpperCase()} (${(c.events ?? []).map((e) => e.event.replace('challenge.', '')).join(' → ')})`).join('; ')}; B35 appeals and B36 gate challenges stay their own paths (${Object.keys(cl.body.challenges?.routes ?? {}).join(', ') || 'routes listed'})`);
  note('an overdue challenge escalates to the subject\'s owner as a knowledge_challenge_overdue attention item (D21) — its review is due in days, not minutes: harness-proven (phase6-provenance-b50), not staged');
  note('an UNFIT evidence version refuses an export build (the retention execute path) — the harness plants the broken custody it needs; not staged here');
}
// THE TRIGGER: F. Aydın's data-quality finding on another PortWatch day — walked by the agent at once (the answer carries the walk)
{
  const other = DAYS.find((x) => x.s === 'admitted' && x.id !== DAY?.id);
  let t = other ? await q1(`select trigger_id::text id, state, invalidation_id::text inv from graph.impact_triggers where object_id = $1 and trigger_kind = 'data_quality_finding' and recorded_by = $2 order by recorded_at desc limit 1`, [other.id, aydin.principalId]) : null;
  if (t) note(`F. Aydın's data-quality finding ${short(t.id)} on ${other.d} stands (${t.state}) — an earlier run`);
  else if (other) {
    const r = await DM(aydin, `${G}/impact/triggers/data_quality_finding/record`, 'graph.impact.trigger.data_quality_finding', { objectType: 'EVD', objectId: other.id,
      reason: `The chokepoint-4 transit count of ${other.d} disagrees with the vessel-call total of the same day (SYNTHETIC finding)`, basis: { dimension: 'consistency', finding: 'transit total differs from the sum of the vessel classes by 3 (SYNTHETIC)' } }, 'ITR', null, 'graph');
    if (!r.ok) fail('F. Aydın records the data-quality finding', r);
    else (r.body.walk?.state === 'walked' ? ok : bad)(`F. Aydın (data steward, human gate) RECORDED a data-quality finding on ${other.d}: trigger ${short(r.body.trigger.trigger_id)} — walked by the domain's propagation agent at once: ${r.body.walk?.state}, assessment ${short(r.body.walk?.invalidationId)} (walker ${r.body.walk?.agent?.agent_version}) — ${rcpt(r)}`);
    t = await q1(`select trigger_id::text id, state, invalidation_id::text inv from graph.impact_triggers where object_id = $1 and trigger_kind = 'data_quality_finding' and recorded_by = $2 order by recorded_at desc limit 1`, [other.id, aydin.principalId]);
  }
  if (t?.inv) {
    const af = await DM(mueller, `${G}/impact/affected`, 'graph.read', { invalidationId: t.inv }, 'INV', t.inv, 'graph');
    if (af.ok) note(`the finding's walk classed ${(af.body.products ?? []).length} product(s): ${Object.entries(af.body.classes ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ')} — no correction case (a finding is not a correction)`);
    ENV_OUT.EYE_B50_TRIGGER = t.id;
  }
  note('the legal-request, model-incident and ontology-correction triggers are harness-only (phase6-impact-b50) — no fourth demonstration case');
}

/* ── B50-5 THE CLOSURE (F-P3-05) ───────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB50-5 THE CLOSURE (F-P3-05) — the consumers past the window on the DATABASE clock; the stall swept, its products FROZEN, the owners told; a publication refused at approval while the warning stays visible; acknowledgements, a bounded exception, PR-24-003; the case closed with its record; the freeze lifted; MET-010 to closure');
const PUB_TITLE = 'B50 — the corridor briefing for the supervisory board (SYNTHETIC)';
const pb = (s, path, action, payload, objectId = null) => DM(s, `${BASE}/publications/${path}`, action, payload, 'PUB', objectId, 'decision');
const login2 = new Map(); // owner principal → a session (the owner's own credential; never by name alone)
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
let CL = CASE ? await closureRead(mueller) : null;
if (CASE && CL === null) bad('the closure of the case could not be read');
const consumers = () => (CL?.consumers ?? []);
const material = () => consumers().filter((c) => c.material);
if (CL) {
  const k = CL.contract ?? {};
  note(`the closure ${CL.tracked ? 'is tracked' : 'is NOT tracked'} (opened ${CL.closure?.opened_via ?? '—'} at ${iso(CL.closure?.opened_at)}; state ${CL.closure?.state}); contract v${k.version ?? '—'}; ${consumers().length} consumer(s), ${material().length} material (${Object.entries(material().reduce((a, c) => ({ ...a, [c.class]: (a[c.class] ?? 0) + 1 }), {})).map(([c, n]) => `${c} ${n}`).join(', ')})`);
  ENV_OUT.EYE_B50_CASE_STATE = CL.closure?.state ?? '—';
}
// the chief of staff's draft publication of a briefing that rests on the warning (drafting is not refused; approval is)
const BRF = CL ? material().find((c) => c.object_type === 'BRF' && (c.path ?? []).some((p) => String(p).startsWith('WRN:'))) ?? material().find((c) => c.object_type === 'BRF') : null;
let PUBR = await q1(`select publication_id::text id, state, current_version::int v from executive.publications where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PUB_TITLE]);
if (CL && CL.closure?.state !== 'closed' && PUBR === null && BRF) {
  const b = await q1(`select b.briefing_id::text id, b.content_digest, (select o.classification from objects.canonical_objects o where o.object_id = b.briefing_id order by o.object_version desc limit 1) classification from executive.briefings b where b.briefing_id = $1`, [BRF.product_id]);
  const r = await pb(chief, 'draft', 'executive.publication.draft', { title: PUB_TITLE, sourceKind: 'briefing', sourceId: b.id, sourceVersion: Number(BRF.product_version ?? 1), sourceDigest: b.content_digest,
    audience: { roles: ['board_member'], recipients: [brandt.principalId] }, classification: b.classification ?? 'internal', channels: ['in_app'], format: 'md', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: null });
  if (!r.ok) fail('the chief of staff drafts the publication', r);
  else ok(`the chief of staff (executive operator) DRAFTED "${PUB_TITLE}" ${short(r.body.publication.publication_id)} (classified ${b.classification}, as its source) from the briefing ${short(b.id)} that rests on the corridor warning (path ${(BRF.path ?? []).map((p) => String(p).slice(0, 3)).join(' → ')}) — ${rcpt(r)}`);
  PUBR = await q1(`select publication_id::text id, state, current_version::int v from executive.publications where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, PUB_TITLE]);
}
if (PUBR) ENV_OUT.EYE_B50_PUBLICATION = PUBR.id;
// THE STALL: wait on the DATABASE clock until a consumer is past its window, then the correction authority sweeps
if (CL && CL.closure?.state === 'open') {
  const dl = material().map((c) => c.deadline).filter(Boolean).sort()[0];
  const now = (await q1('select clock_timestamp() t')).t;
  note(`the first deadline is ${iso(dl)}; the database clock reads ${iso(now)} — waiting on it (nothing moved)`);
  const t0 = Date.now();
  while (!material().some((c) => c.overdue) && Date.now() - t0 < (WINDOW_MIN + 3) * 60_000) { await sleep(10_000); CL = await closureRead(mueller); }
  (material().some((c) => c.overdue) ? ok : bad)(`PAST THE WINDOW on the database clock (${Math.round((Date.now() - t0) / 1000)} s waited): ${material().filter((c) => c.overdue).length} consumer(s) overdue`);
}
if (CL && CL.closure?.state !== 'closed') {
  const sw = await gr(dvorak, 'closure/sweep', 'graph.closure.sweep', {}, 'COR', null);
  if (!sw.ok) fail('M. Dvořák sweeps the open corrections', sw);
  else {
    const mine = (sw.body.sweep.swept ?? []).find((x) => x.case_id === CASE.id);
    ok(`M. Dvořák (the correction authority) SWEPT the open corrections: case ${short(CASE.id)} ${String(mine?.state ?? '—').toUpperCase()}${mine?.stalled ? ' (stalled)' : ''} — ${mine?.frozen_now ?? 0} product(s) frozen now, ${mine?.failed_recorded ?? 0} failed deliveries recorded, ${(mine?.items ?? []).length} attention item(s) (${(mine?.items ?? []).filter((i) => i.repeated).length} repeated) — the attention agent's tick sweeps the same way`);
  }
  CL = await closureRead(mueller);
  const live = (CL.freezes ?? []).filter((f) => f.lifted_at === null);
  (CL.closure?.state === 'stalled' && live.length > 0 ? ok : bad)(`THE STALL: the case is ${String(CL.closure?.state).toUpperCase()} (stalled at ${iso(CL.closure?.stalled_at)}); ${live.length} LIVE freeze(s) (${[...new Set(live.map((f) => f.reason_kind))].join(', ')}); ${(CL.escalations ?? []).length} attention item(s) to ${[...new Set((CL.escalations ?? []).map((e) => nm(e.owner)))].slice(0, 8).join(', ')}`);
  const items = await q(`select owner_principal_id::text owner, state, title from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'correction_propagation_stall' and subject_id = $3`, [T, D, CASE.id]);
  const brennerItem = items.some((i) => i.owner === brenner.principalId); const eriksenItem = items.some((i) => i.owner === eriksen.principalId);
  note(`the stall items (correction_propagation_stall): ${items.length} — C. Brenner ${brennerItem ? 'told' : 'not an owner here'}, N. Eriksen ${eriksenItem ? 'told' : 'not an owner here'}; e.g. "${items[0]?.title ?? '—'}"`);
  // THE FREEZE REFUSES THE PUBLICATION'S APPROVAL; THE WARNING STAYS VISIBLE WITH ITS MARKER
  if (PUBR && PUBR.state === 'drafted') {
    const g = await pb(dvorak, `${PUBR.id}/get`, 'executive.publication.read', {}, PUBR.id);
    const vv = (g.body?.publication?.versions ?? []).find((x) => Number(x.version) === PUBR.v);
    expectRefused(`M. Dvořák (executive) approves the draft publication v${PUBR.v}`, await pb(dvorak, `${PUBR.id}/versions/${PUBR.v}/approve`, 'executive.publication.approve', { digest: vv?.bytes_digest }, PUBR.id), 409, /^publication rejected \(held\): its source briefing .* is frozen by correction case/);
  }
  const W = consumers().find((c) => c.object_type === 'WRN');
  if (W) {
    const w = await DM(eriksen, `${BASE}/prediction/warnings/${W.product_id}/get`, 'prediction.read', {}, 'WRN', W.product_id, 'prediction');
    (W.frozen === true && w.ok ? ok : bad)(`the corridor WARNING ${short(W.product_id)} stays VISIBLE (read by N. Eriksen: ${w.ok ? (w.body.warning?.state ?? 'read') : refusalLine(w)}) — its consumer row on the case carries the FROZEN marker (${W.frozen}) and the case link; never hidden, never suppressed`);
    ENV_OUT.EYE_B50_WARNING = W.product_id;
  }
  // THE FROZEN WALK (optional): the case page while the freeze is live — the walk's own frozen-marker step, run now
  if (process.env.EYE_B50_FROZEN_WALK) {
    // ASYNC (never spawnSync): the event loop keeps serving this process's sockets while the walk runs
    const { execFile } = await import('node:child_process');
    const r = await new Promise((res) => { execFile('sh', ['-c', process.env.EYE_B50_FROZEN_WALK], { env: { ...process.env, EYE_B50_CASE: CASE.id, EYE_B50_FROZEN: '1', EYE_B50_WARNING: W?.product_id ?? '' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => res({ status: err ? (err.code ?? 1) : 0, stdout })); });
    (r.status === 0 ? ok : bad)(`THE FROZEN WALK while the freeze is live (exit ${r.status}): ${String(r.stdout).split('\n').filter((l) => /passed|failed/.test(l)).slice(-2).map((l) => l.trim()).join(' | ')}`);
    await renewAll();
  }
}
// THE ACKNOWLEDGEMENTS — each consumer's own owner (PR-24-003: never the correction authority for a human review)
if (CL && CL.closure?.state !== 'closed') {
  const pending = () => material().filter((c) => !c.closing);
  const hr = pending().find((c) => c.class === 'human_review' && String(c.owner ?? '').replace(/^principal:/, '') === brenner.principalId) ?? pending().find((c) => c.class === 'human_review');
  if (hr) expectRefused(`M. Dvořák (who APPLIED the case) acknowledges ${hr.consumer_ref} — a human review owned by ${nm(hr.owner)}`, await gr(dvorak, `closure/cases/${CASE.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: hr.consumer_ref, note: 'acknowledging for the owner (refused)' }, 'COR', CASE.id), 403, /\(separation_of_duties\).*never acknowledges it/);
  const fct = pending().filter((c) => c.object_type === 'FCT' && c.class === 'recompute');
  const counts = { acknowledged: 0, excepted: 0, byKnowledgeOwner: 0, failed: 0 };
  const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
  for (const c of pending()) {
    const own = await sessionOf(c.owner);
    const actor = own ?? mueller; // no active human owner → the knowledge owner closes it
    let r;
    if (c.object_type === 'FCT' && c.class === 'recompute' && own) {
      r = await gr(actor, `closure/cases/${CASE.id}/except`, 'graph.closure.except', { consumerRef: c.consumer_ref, ownerPrincipalId: actor.principalId, expiresAt: expires,
        reason: 'The forecast is re-issued at the next scheduled run on the restated series; until then it is read with the restated day flagged (SYNTHETIC bounded exception)' }, 'COR', CASE.id);
      if (r.ok) counts.excepted += 1;
    } else {
      r = await gr(actor, `closure/cases/${CASE.id}/acknowledge`, 'graph.closure.acknowledge', { consumerRef: c.consumer_ref, state: 'acknowledged',
        note: c.class === 'human_review' ? 'Reviewed against the restated day: the prior decision stands, no re-decision needed (SYNTHETIC)' : `Read against the restated ${DAY?.d ?? ''} transit count; the product is marked stale until its next refresh (SYNTHETIC)` }, 'COR', CASE.id);
      if (r.ok) { counts.acknowledged += 1; if (!own) counts.byKnowledgeOwner += 1; }
    }
    if (!r.ok) { counts.failed += 1; if (counts.failed <= 4) fail(`${nm(actor.principalId)} closes ${c.consumer_ref} (${c.class})`, r); }
  }
  const brennerAcks = await q1(`select count(*)::int n from graph.consumer_acknowledgements where case_id = $1 and recorded_by = $2`, [CASE.id, brenner.principalId]);
  ok(`THE CONSUMERS CLOSED by their own owners: ${counts.acknowledged} acknowledged (${counts.byKnowledgeOwner} by K. Müller — no active human owner), ${counts.excepted} under a BOUNDED EXCEPTION (N. Eriksen's ${fct.length} forecast(s), expiring ${iso(expires)}), ${counts.failed} refused; C. Brenner acknowledged ${brennerAcks.n} human review(s) herself`);
  note('"recomputed" (a recompute naming its later re-run record) is not staged: a corridor forecast re-issue reads the full PortWatch series (minutes); harness-proven (phase6-closure-b50 "the recompute names a real later record")');
  CL = await closureRead(mueller, true);
  const rd = CL.readiness ?? {};
  (rd.ready ? ok : bad)(`THE READINESS before the close: ${rd.ready ? 'READY' : `NOT ready — ${(rd.reasons ?? []).join('; ')}`} (projections ${rd.projections?.reconciled === false ? 'do NOT reconcile' : 'reconciled'})`);
  if (rd.ready) {
    const c = await gr(dvorak, `closure/cases/${CASE.id}/close`, 'graph.closure.close', { statement: `The restatement of ${DAY?.d ?? 'the day'} reached its consumers; each owner closed theirs; the forecasts carry a bounded exception until their next run (SYNTHETIC)` }, 'COR', CASE.id);
    if (!c.ok) fail('M. Dvořák closes the case', c);
    else ok(`M. Dvořák CLOSED the case: closure ${short(c.body.closure.closure_id)} — ${c.body.closure.reached_consumers?.length ?? c.body.closure.reached_consumers} consumer(s), ${(c.body.closure.failed_deliveries ?? []).length} failed deliveries, ${(c.body.closure.residual_exposure ?? []).length} residual exposure(s), ${(c.body.closure.acknowledgements ?? []).length} act(s); ${c.body.closure.freezes_lifted ?? 0} freeze(s) lifted, ${c.body.closure.items_closed ?? 0} item(s) closed; audit digest ${dg(c.body.closure.audit_digest)} — ${rcpt(c)}`);
  }
  CL = await closureRead(mueller);
}
if (CL) {
  const rec = CL.record ?? null;
  const live = (CL.freezes ?? []).filter((f) => f.lifted_at === null);
  (CL.closure?.state === 'closed' && rec && live.length === 0 ? ok : bad)(`THE CLOSURE RECORD (${rec?.schema ?? '—'}): closed ${iso(rec?.closed_at)} by ${nm(rec?.closed_by)}; ${(rec?.consumers ?? []).length} consumer(s) listed; failed deliveries ${(rec?.failed_deliveries ?? []).length}; residual exposure ${(rec?.residual_exposure ?? []).map((x) => `${String(x.ref).slice(0, 12)}… ${x.class}`).slice(0, 4).join(', ') || 'none'}; ${(rec?.acknowledgements ?? []).length} acknowledgement(s); projections ${rec?.projections?.reconciled ? 'reconciled' : 'NOT reconciled'}; the freezes: ${(CL.freezes ?? []).length} recorded, ${live.length} live`);
  const n = CL.notice ?? {};
  note(`THE CORRECTION IMPACT NOTICE (HX-18, ${n.schema ?? '—'}) on the case page: the original ${n.original ? 'named' : '—'}, the correction ${n.correction ? 'named' : '—'}, ${(n.affected_products ?? []).length} affected product(s), ${(n.decisions ?? []).length} decision(s), the required review ${n.required_review ? 'stated' : '—'}, the closure ${n.closure ? 'recorded' : '—'}`);
  ENV_OUT.EYE_B50_CASE_STATE = CL.closure?.state;
  // the publication approves once the case closes
  PUBR = PUBR ? await q1(`select publication_id::text id, state, current_version::int v from executive.publications where publication_id = $1`, [PUBR.id]) : null;
  if (PUBR && PUBR.state === 'drafted' && CL.closure?.state === 'closed') {
    const g = await pb(dvorak, `${PUBR.id}/get`, 'executive.publication.read', {}, PUBR.id);
    const vv = (g.body?.publication?.versions ?? []).find((x) => Number(x.version) === PUBR.v);
    const a = await pb(dvorak, `${PUBR.id}/versions/${PUBR.v}/approve`, 'executive.publication.approve', { digest: vv?.bytes_digest }, PUBR.id);
    if (!a.ok) fail('M. Dvořák approves the publication after the closure', a); else ok(`the freeze lifted: M. Dvořák APPROVED the publication v${PUBR.v} by its digest — SIGNED (PUB@${a.body.approval?.pub_object_version ?? '—'} admitted); it is not delivered here`);
  } else if (PUBR) note(`the publication ${short(PUBR.id)} is ${PUBR.state} — an earlier run`);
  // MET-010 v2 — correction propagation time to CONSUMER closure
  if (CL.closure?.state === 'closed') {
    const closedAt = CL.record?.closed_at;
    let res = await q1(`select result_id::text id, value, unit, n, state from analytics.metric_results where tenant_id = $1 and domain_id = $2 and metric_key = 'MET-010' and preview = false and as_of >= $3 order by as_of desc limit 1`, [T, D, closedAt]);
    const analyst = await persona('j.sato');
    if (res === null) {
      const r = await DM(analyst, `${BASE}/analytics/metrics/compute`, 'analytics.metric.compute', { metricKey: 'MET-010', period: '2026-Q4' }, 'AMR', null, 'intelligence');
      if (!r.ok) fail('J. Satō computes MET-010', r);
      else ok(`J. Satō (product analyst) COMPUTED MET-010 for 2026-Q4: ${r.body.result?.state} — value ${r.body.result?.value} ${r.body.result?.unit} over n ${r.body.result?.n} (computation v${r.body.result?.quality?.computation_version ?? '—'}) — ${rcpt(r)}`);
      res = await q1(`select result_id::text id, value, unit, n, state from analytics.metric_results where tenant_id = $1 and domain_id = $2 and metric_key = 'MET-010' and preview = false and as_of >= $3 order by as_of desc limit 1`, [T, D, closedAt]);
    } else note(`MET-010 computed after the closure stands — an earlier run (${res.value} ${res.unit}, n ${res.n})`);
    if (res) {
      const rr = await DM(analyst, `${BASE}/analytics/results/${res.id}/read`, 'analytics.read', { recordsLimit: 500 }, 'AMR', res.id, 'intelligence');
      const recs = rr.ok ? (rr.body.records ?? rr.body.result?.records ?? []) : [];
      const mine = recs.find((x) => x.id === CASE.id || x.ref === CASE.id || x.record_id === CASE.id);
      (mine && (mine.role === 'included') ? ok : bad)(`MET-010 v2 counts THIS case to its consumer closure: ${mine ? `included, ${mine.detail?.value ?? '—'} s (accepted ${iso(mine.detail?.accepted_at)} → closed ${iso(mine.detail?.closed_at)}; ${mine.detail?.closure ?? ''})` : `not among ${recs.length} record(s)${rr.ok ? '' : ` — ${refusalLine(rr)}`}`}; ${recs.filter((x) => x.role === 'excluded').length} case(s) excluded (censored: open)`);
    }
  }
  // the old open case (D9): LISTED as adoptable, NOT adopted
  const ad = await gr(mueller, 'closure/adoptable', 'graph.read', {}, 'COR', null);
  if (!ad.ok) fail('K. Müller lists the adoptable cases', ad);
  else {
    const old = (ad.body.cases ?? []).find((x) => String(x.received_at ?? '').startsWith('2026-09-10') && x.kind === 'supersession');
    (old ? ok : bad)(`D9 — the older open case LISTED, NOT adopted: ${old ? `${short(old.case_id)} (${old.kind}, received ${iso(old.received_at)}, ${old.days_since_apply} days since its apply, propagation ${old.propagation_state}, ${old.material_products ?? '—'} material product(s)${old.past_window_if_adopted ? ' — past its window the moment it is adopted: adopting it would freeze them' : ''})` : `not among ${(ad.body.cases ?? []).length}`}; adopting it is the owner's decision`);
  }
}
// the demonstration window retired: the ordinary contract declared again by the domain administrator
{
  const k = await contractRow();
  if (k?.statement === DEMO_STATEMENT && CL?.closure?.state === 'closed') {
    const r = await gr(richter, 'closure/contract/declare', 'graph.closure.contract.declare', { windows: { stale: 3 * 86_400, challenged: 3 * 86_400, withdrawn: 86_400, recompute: 7 * 86_400, human_review: 5 * 86_400, subscription: 86_400 }, exceptionMaxDays: 30, synthetic: false, statement: ORDINARY_STATEMENT }, 'CCT');
    if (!r.ok) fail('T. Richter declares the ordinary closure contract', r); else ok(`T. Richter RETIRED the demonstration window: the closure contract v${r.body.contract.version} — ordinary windows (stale 3 d, withdrawn 1 d, recompute 7 d, human review 5 d), not synthetic — ${rcpt(r)}`);
  } else if (k) note(`the closure contract in force: v${k.version} ${k.synthetic ? 'SYNTHETIC (the demonstration window)' : 'ordinary'}`);
}

/* ── B50-6 THE TIMELINE, AS-OF AND TRACE (F-P3-04) ──────────────────────────────────────────── */
await renewAll();
console.log('\nB50-6 THE TIMELINE, AS-OF AND TRACE (F-P3-04) — S. Okafor on the governed scope "The Red Sea corridor (Bab el-Mandeb)" as known on 2026-09-25 (the B24 decision\'s day): what was known then, what was corrected later, every disclosure; the trace of the decision; the upload\'s unknown clock stated as a limitation');
const tl = (s, path, payload, objectType = 'TLN', objectId = null) => DM(s, `${G}/timeline/${path}`, 'graph.timeline.read', payload, objectType, objectId, 'graph');
{
  const sc = await tl(okafor, 'scopes', {}, 'ASC');
  const S = sc.ok ? (sc.body.scopes ?? []).find((x) => x.title === 'The Red Sea corridor (Bab el-Mandeb)') : null;
  if (!S) fail('S. Okafor lists the governed scopes', sc);
  else {
    ENV_OUT.EYE_B50_SCOPE = S.scope_key;
    const B24 = await q1(`select committed_at from decision.commitments c join decision.packages_current p on p.package_id = c.package_id where p.tenant_id = $1 and p.domain_id = $2 and p.title like 'B24 — second source%' order by committed_at limit 1`, [T, D]);
    const AS_OF = '2026-09-25T23:59:59Z';
    note(`the scope ${S.scope_key} v${S.version} (${S.entities ?? '—'} entities, ${S.objectives ?? '—'} objectives); the B24 sourcing decision was committed ${iso(B24?.committed_at)}`);
    const read = async (asOf) => tl(okafor, 'read', { scopeKey: S.scope_key, axis: 'record', from: '2023-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', ...(asOf ? { asOf } : {}), limit: 500 });
    const then = await read(AS_OF);
    if (!then.ok) fail('S. Okafor reads the scope as known on 2026-09-25', then);
    else {
      const t = then.body.timeline; const x = t.disclosure ?? {};
      const types = (t.items ?? []).reduce((a, i) => ({ ...a, [i.objectType]: (a[i.objectType] ?? 0) + 1 }), {});
      ok(`THE SCOPE AS KNOWN ON 2026-09-25 (${t.method}, clearance ${t.clearance}): ${(t.items ?? []).length} version(s) (${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), ${(t.events ?? []).length} ledger event(s); the scope places objects by its ${t.subject?.members?.entities ?? 0} entit(ies) and ${t.subject?.members?.objectives ?? 0} objective(s) — UNMATCHED and said: series ${(t.subject?.unmatched?.series_keys ?? []).join(', ') || 'none'}, geographies ${(t.subject?.unmatched?.geographies ?? []).join(', ') || 'none'}`);
      ok(`THE DISCLOSURES: missing intervals ${(x.missingIntervals ?? []).length} (${(x.missingIntervals ?? []).slice(0, 3).map((m) => `${m.sourceKey} ${iso(m.from)}…${m.to === 'open' ? 'open' : iso(m.to)}`).join('; ')}); WITHHELD by his clearance ${x.withheld?.count ?? 0} (${JSON.stringify(x.withheldByReason ?? {})}); clock flags ${x.clockFlags ?? 0} (${Object.entries(x.clock ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}); broken lineage ${(x.brokenLineage ?? []).length}; untimed ${x.untimed ?? 0}; bounds ${JSON.stringify(x.bounds ?? {})}; incomplete ${x.incomplete}`);
      ENV_OUT.EYE_B50_AS_OF = AS_OF;
    }
    const live = await read(null);
    if (live.ok) note(`the live read beside it: ${(live.body.timeline.items ?? []).length} version(s), ${(live.body.timeline.items ?? []).filter((i) => i.correctedLater).length} corrected later — the as-of read never folds in what came after`);
    // the corridor's evidence as known then: the earlier restatements (2026-09-09 … 12) known, today's restatement CORRECTED LATER
    const subj = async (id) => tl(okafor, 'read', { subjectType: 'EVD', subjectId: id, axis: 'record', from: '2023-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', asOf: AS_OF, limit: 50 }, 'EVD', id);
    const early = DAYS.find((x) => x.s === 'corrected' && new Date(x.rec) < new Date(AS_OF));
    if (early) {
      const r = await subj(early.id); const it = r.ok ? (r.body.timeline.items ?? []) : [];
      const v1 = it.find((i) => Number(i.version) === 1); const v2 = it.find((i) => Number(i.version) >= 2);
      (v2 && v1?.correctedLater?.knownAtAsOf === true ? ok : bad)(`the evidence of ${early.d} as known on 2026-09-25: ${it.map((i) => `v${i.version} ${i.believedAtAsOf ? 'believed then' : 'superseded by then'}`).join(', ')} — its restatement (v${v2?.version}, recorded ${iso(v2?.recordedAt)}) was ALREADY KNOWN on 2026-09-25 (known at the as-of: ${v1?.correctedLater?.knownAtAsOf})`);
    }
    if (DAY) {
      const r = await subj(DAY.id); const it = r.ok ? (r.body.timeline.items ?? []) : [];
      const cl = it.find((i) => i.correctedLater);
      (cl && cl.correctedLater.knownAtAsOf === false ? ok : bad)(`the evidence of ${DAY.d} as known on 2026-09-25: ${it.length} version(s) shown, v${cl?.version ?? '—'} marked "CORRECTED LATER (${iso(cl?.correctedLater?.at)})" — today's restatement, never folded into the past${r.ok ? '' : ` — ${refusalLine(r)}`}`);
      ENV_OUT.EYE_B50_TIMELINE_SUBJECT = DAY.id;
    }
  }
  // THE TRACE of the decision: source → evidence → claims → product (the forecast) → decision (the B24 package)
  const DPK = await q1(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'DPK' and object_id = (select package_id from decision.packages_current where tenant_id = $1 and domain_id = $2 and title like 'B24 — second source%' limit 1) order by object_version desc limit 1`, [T, D]);
  if (DPK) {
    const r = await tl(okafor, 'trace', { type: 'DPK', id: DPK.id, version: DPK.v }, 'DPK', DPK.id);
    if (!r.ok) fail('S. Okafor traces the B24 decision', r);
    else {
      const tr = r.body.trace;
      const st = ['source', 'evidence', 'claim', 'product', 'decision'].map((s) => `${s} ${(tr.nodes ?? []).filter((n) => n.stage === s).length}`);
      ((tr.nodes ?? []).some((n) => n.stage === 'decision') && (tr.nodes ?? []).some((n) => n.stage === 'evidence') ? ok : bad)(`THE TRACE of the B24 decision (DPK ${short(DPK.id)} v${DPK.v}, ${tr.method}): ${st.join(' → ')}; ${tr.incomplete ? `INCOMPLETE — ${(tr.reasons ?? []).map((x) => `${x.reason} ${x.count}`).join(', ')}` : 'complete'}; unresolved edges ${(tr.unresolvedEdges ?? []).length}; limitations ${(tr.limitations ?? []).map((l) => `${l.limitation} ${l.count}`).join(', ') || 'none'}; decision snapshots ${(tr.decisionSnapshots ?? []).length}`);
      ENV_OUT.EYE_B50_DECISION_PACKAGE = DPK.id; ENV_OUT.EYE_B50_DECISION_PACKAGE_VERSION = DPK.v;
    }
  }
  if (ETA) {
    const r = await tl(okafor, 'trace', { type: 'EVD', id: ETA.id, version: ETA.v }, 'EVD', ETA.id);
    if (!r.ok) fail('S. Okafor traces the uploaded booking', r);
    else {
      const tr = r.body.trace; const lim = tr.limitations ?? [];
      (lim.some((l) => l.limitation === 'clock_unknown') && !(tr.reasons ?? []).some((x) => x.reason === 'clock_divergence') ? ok : bad)(`THE UPLOAD'S UNKNOWN CLOCK is a STATED LIMITATION of its trace (D20), never a reason it is incomplete: limitations ${lim.map((l) => `${l.limitation} ${l.count}`).join(', ') || 'NONE'}; reasons ${(tr.reasons ?? []).map((x) => x.reason).join(', ') || 'none'}; ${tr.incomplete ? 'incomplete' : 'complete'}`);
    }
  }
}

/* ── B50-7 THE LIBRARY AND THE ACCEPTANCE DEMONSTRATION RECORDS ─────────────────────────────── */
await renewAll();
console.log('\nB50-7 THE LIBRARY AND THE ACCEPTANCE DEMONSTRATION RECORDS — knowledge.tsx\'s components in the inventory, approved with ONE owner; a B50 baseline; a design acceptance per chapter (ch6, ch22, ch24) — claim demonstration');
const libRows = async () => q(`select asset_id::text id, asset_key k, version, status, digest, owner_principal_id::text owner from governance.design_assets where superseded_at is null and asset_key ~ '^web\\.knowledge\\.' order by asset_key`);
{
  let lib = await libRows();
  if (lib.length > 0) note(`knowledge.tsx's library is in the inventory (${lib.length} components): stands — an earlier run`);
  else {
    const reg = await P(steward, `${DG}/assets/register`, 'governance.design.asset.register', {}, 'DSA');
    if (!reg.ok) fail('P. Castellano re-reads and registers the design inventory', reg);
    else {
      const inv = reg.body.inventory;
      const mine = (inv.registered ?? []).filter((x) => x.key.startsWith('web.knowledge.'));
      (mine.length > 0 ? ok : bad)(`P. Castellano (conformance steward) re-read the inventory from the repository: ${(inv.registered ?? []).length} new asset(s) registered (${mine.length} of knowledge.tsx: ${mine.map((x) => x.key.replace('web.knowledge.', '')).join(', ')}), ${inv.unchanged} unchanged; DRIFT STATED: ${(inv.drift ?? []).map((x) => x.key).join(', ') || 'none'}`);
    }
    lib = await libRows();
  }
  let approved = 0; let stood = 0;
  for (const a of lib) {
    if (a.status === 'approved' && a.owner) { stood += 1; continue; }
    const r = await P(dsa, `${DG}/assets/${a.id}/approve`, 'governance.design.asset.approve', { version: a.version, digest: a.digest, ownerPrincipalId: dsaOwner.principalId,
      reason: `${a.k} — a B50 knowledge-core component read against Volume 9 and its unit fixtures (SYNTHETIC)` }, 'DSA', a.id);
    if (!r.ok) fail(`L. Haddad approves ${a.k}`, r); else approved += 1;
  }
  lib = await libRows();
  const owners = new Set(lib.map((a) => a.owner));
  (lib.length > 0 && lib.every((a) => a.status === 'approved') && owners.size === 1 && owners.has(dsaOwner.principalId) ? ok : bad)(`L. Haddad (Design System Authority, human gate) APPROVED ${approved} knowledge component(s)${stood ? ` (${stood} stand — an earlier run)` : ''}: ${lib.length} components of knowledge.tsx, each with ONE accountable owner — S. Iversen`);
  const EVAL = await q1(`select evaluation_id::text id, digest, evaluated_at, verdict from governance.design_evaluations where source = 'lint' order by evaluated_at desc limit 1`);
  const DBL_TITLE = 'The Eye design baseline 2026-10 — B50 the knowledge core (SYNTHETIC demonstration)';
  const tokensVersion = JSON.parse(readFileSync(join(SELF_ROOT, 'packages', 'tokens', 'package.json'), 'utf8')).version;
  const CHAPTERS = [['ch6', 'F-P3-02', 'work objects — the governed lifecycle'], ['ch22', 'F-P3-04', 'timelines and trace'], ['ch24', 'F-P3-05', 'corrections and replay']];
  let DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  if (DBL === null) {
    const p = await P(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { expectedVersion: 0, title: DBL_TITLE, designSystemVersion: `@eye/tokens@${tokensVersion}`,
      scope: { capabilities: ['F-P3-01', 'F-P3-02', 'F-P3-03', 'F-P3-04', 'F-P3-05'], journeys: CHAPTERS.map((c) => c[0]), profiles: ['local-dev'], themes: ['light', 'dark', 'print'], locales: ['en'] }, members: lib.map((a) => a.id) }, 'DSB');
    if (!p.ok) fail('P. Castellano proposes the B50 design baseline', p);
    else {
      const b = p.body.baseline;
      ok(`P. Castellano PROPOSED the B50 design baseline ${short(b.baseline_id)} v${b.version}: ${lib.length} members (knowledge.tsx), design system @eye/tokens@${tokensVersion}`);
      const d = await P(dsa, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the B50 knowledge components read against Volume 9 and the act\'s walks; every member owned (SYNTHETIC)' }, 'DSB', b.baseline_id);
      if (!d.ok) fail('L. Haddad attests the B50 design baseline', d); else ok(`L. Haddad ATTESTED and SIGNED the B50 design baseline v${b.version} (${d.body.baseline.state})`);
    }
    DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  } else note(`the B50 design baseline ${short(DBL.id)} v${DBL.version} stands — an earlier run (${DBL.state})`);
  if (DBL?.state === 'attested' && EVAL) {
    const files = ['scripts/phase6/act-b50.mjs', 'e2e/phase6-b50.demo.spec.ts'].filter((f) => existsSync(join(SELF_ROOT, f)));
    const fileEv = files.map((f) => ({ kind: 'journey_harness', ref: `${f} (the B50 act and walk — the journey harness of the chapter)`, digest: sha256(readFileSync(join(SELF_ROOT, f))),
      capturedAt: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
    const ev = [{ kind: 'design_evaluation', ref: `the lint evaluation ${EVAL.id} (${EVAL.verdict})`, digest: EVAL.digest, capturedAt: new Date(EVAL.evaluated_at).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...fileEv];
    const lines = [];
    for (const [chapter, feature, what] of CHAPTERS) {
      let A = await q1(`select acceptance_id::text id, version, state, digest from governance.design_acceptances where tenant_id = $1 and domain_id = $2 and tuple ->> 'journey' = $3 and tuple ->> 'capability' = $4 order by version desc limit 1`, [T, D, chapter, feature]);
      if (A?.state === 'accepted') { lines.push(`${chapter} stands`); continue; }
      if (A === null) {
        const p = await DM(steward, `${DGD}/acceptances/propose`, 'governance.design.acceptance.propose', { baselineId: DBL.id, components: lib.map((a) => a.id),
          tuple: { capability: feature, journey: chapter, persona: `the corridor's people — ${what} (SYNTHETIC)`, role: 'knowledge_owner', deployment_profile: 'local-dev', theme: 'NORDWERK Corporate v2', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' },
          evidence: ev, obligations: ['design', 'assurance', 'customer'], findings: [{ note: 'the signed scope-specific record of the chapter (PR-xx-006, AT-xx) is NOT this record: it is the non-demonstration recording path (B111), then R2' }],
          conditions: [{ condition: 'local-dev profile only; accessibility slots empty (B108 → H3); real acceptance is R2' }] }, 'DAC');
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
    (recs.length === CHAPTERS.length && recs.every((r) => r.state === 'accepted' && r.claim === 'demonstration') ? ok : bad)(`the design acceptance DEMONSTRATION records per B50 chapter (ch6 F-P3-02, ch22 F-P3-04, ch24 F-P3-05), each attested by L. Haddad (design), H. Achterberg (assurance) and W. Zielińska (customer): ${lines.join(', ')} — ${recs.length} records, claim ${[...new Set(recs.map((r) => r.claim))].join('/')}; the signed scope-specific records are B111 → R2`);
  } else bad('no attested B50 baseline or lint evaluation — the acceptance demonstration records were not proposed');
}

/* ── B50-8 THE STATE AND THE LIMITS ──────────────────────────────────────────────────────────── */
console.log('\nB50-8 THE STATE, the env lines for the walks, THE LIMITS');
{
  const n = await q1(`select (select count(*) from objects.version_operations where tenant_id = $1)::int stated_versions, (select count(*) from objects.time_qualifiers where tenant_id = $1)::int time_qualifiers,
     (select count(*) from objects.lifecycle_transitions where tenant_id = $1)::int lifecycle_attempts, (select count(*) from graph.knowledge_challenges where tenant_id = $1)::int challenges,
     (select count(*) from graph.product_fitness_marks where tenant_id = $1)::int fitness_marks, (select count(*) from graph.impact_triggers where tenant_id = $1)::int impact_triggers,
     (select count(*) from graph.correction_closures where tenant_id = $1)::int closures, (select count(*) from graph.publication_freezes where tenant_id = $1 and lifted_at is null)::int live_freezes,
     (select count(*) from graph.closure_contracts where tenant_id = $1)::int closure_contract_versions`, [T]);
  note(`as recorded: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const claims = await q1(`select (select count(*) from governance.design_acceptances where claim <> 'demonstration')::int d`);
  (claims.d === 0 ? ok : bad)(`no design acceptance claims more than a DEMONSTRATION (${claims.d} beyond it)`);
  ENV_OUT.EYE_B50_TENANT = T; ENV_OUT.EYE_B50_DOMAIN = D;
  ENV_OUT.EYE_B50_ANALYST = 'a.hoffmann'; ENV_OUT.EYE_B50_AUTHOR = 'd.ivanova'; ENV_OUT.EYE_B50_KNOWLEDGE_OWNER = 'k.mueller'; ENV_OUT.EYE_B50_CORRECTION_AUTHORITY = 'm.dvorak'; ENV_OUT.EYE_B50_EXECUTIVE = 's.okafor';
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — 0120 and its harnesses (phase6-{prelude,header,lifecycle,impact,provenance,closure,timeline,schema-conformance}-b50), the web unit models, the walks. (2) DEMONSTRATED OPERATION — what RAN here through the governed routes by SYNTHETIC personas: the booking\'s "late August" ETA uploaded with its stated time, the stated headers (absences, inherited controls, side ledgers) beside a version recorded before B50, a decision-active use refused naming the fields; the Red Sea assessment authored, reviewed, approved, published, retired — the reviewer\'s publish, the extraction role\'s publish and the stale second tab refused and KEPT, a proposal declined by the owner, the replay at every instant, the export verified; one PortWatch restatement (D6) received and applied, walked by walker 1.1.0, its diff, its explanation (a denied and a corrected node), its classed impact; a challenge opened, reviewed and upheld by another person, the claim marked UNFIT and refused at a package option; a data-quality finding walked; the closure under a SYNTHETIC short contract (D8) — the stall on the database clock, its freezes, the publication refused at approval while the warning stayed visible, PR-24-003, the owners\' acknowledgements, the bounded exceptions, the close and its record, the freeze lifted, MET-010 v2, the demonstration window retired; the 2026-09-10 supersession case LISTED and NOT adopted (D9); the scope as known on 2026-09-25 with every disclosure, the decision\'s trace, the upload\'s unknown clock stated as a limitation (D20); knowledge.tsx\'s components owned and a design acceptance per chapter (ch6, ch22, ch24) — every acceptance `claim = demonstration`. (3) REAL ACCEPTANCE — the signed scope-specific records PR-06/22/24-006 and AT-06/22/24 — NEVER claimed: the non-demonstration recording path is B111, then R2. NOT STAGED (harness-proven): an AGENT principal refused at the lifecycle\'s human gate (R. Okafor is a human-kind login holding the extraction role here — refused by the PDP); a recompute naming its re-run record; an unfit evidence refusing an export; an overdue challenge escalated (D21); the legal-request, model-incident and ontology-correction triggers; a delivery failure as an immediate stall.');
}


await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
