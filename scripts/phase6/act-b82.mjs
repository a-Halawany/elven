#!/usr/bin/env node
/**
 * CP-6 stage B82 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): TRUST, EVIDENCE,
 * PROVENANCE AND EXPLANATION (F-P7-E-07) and THE EVIDENCE-BEARING VISUALIZATION LIBRARY (F-P7-E-21) — migration 0121 — exercised by named
 * personas through the REAL HTTP routes only (scripts/phase4/governed.mjs), each scene stating what it shows and ASSERTING it (a scene that
 * does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads what an earlier run left
 * (read-only SQL) and says "stands — an earlier run" instead of writing it twice. NOTHING IS PLANTED: no row is written by SQL and no clock is
 * moved.
 *
 * DESIGN D9 (the coordinator's, CHANGED from the map's default): NO NEW EVIDENCE PERMISSION. L. Brandt (decision owner) reads what a citation
 * resolves to SHORT OF THE BYTES (graph.provenance.read); his request for the cited span is REFUSED by the policy in the server's words; the
 * cited span is opened by a persona who already holds evidence read (A. Hoffmann, domain analyst — observation.evidence.retrieve).
 *
 *   B82-0  THE CAST AND THE STATE (read-only): 0121, the cast's roles, the build; the B31 reroute package, its runs, twin v14, the corrected
 *          PortWatch fragment; no geography and no AIS evidence recorded — each stated.
 *   B82-1  THE DRILL (L. Brandt, E-07): his recommendation on the B31 package RECOMMENDED (advisory, never a decision); the run INDETERMINATE
 *          (withdrawn since); the scenario, twin v14 and the evidence each with its display truth and trust facets; the run's citation resolved
 *          to its evidence leaves (custody, tier, span, correction); his request for the cited bytes REFUSED; A. Hoffmann opens the span.
 *   B82-2  CORRECTED AND THE NOTICE (E-07): B50's UNFIT claim corrected through the governed claim review (K. Müller's own decision refused —
 *          her role routes, it does not decide a claim review; L. Ferreira, extraction manager, decides `correct`); the correction linked to its
 *          preserved original; the original's citation reads CORRECTED SINCE through the resolver; L. Brandt's next briefing in his room: the
 *          correction WITHHELD under the room's briefing policy (a claim needs two sources) and declared as an omission — his paragraph citing it
 *          refused in the server's words (a narrative cites only what the edition includes).
 *   B82-3  THE CORRIDOR MAP, THE BAND, THE FAN (E-21): F. Aydın declares the geographic register (EPSG:4326, typed, sourced, licensed — never
 *          imported); a mistyped site retired; an analyst and another CRS refused; the flow map's series named (the page reads them — minutes on
 *          the demonstration, said); the forecast band and the scenario fan named for the walk.
 *   B82-4  TRUST (E-07): E. Lindqvist (auditor) reads /graph/trust's overview; VERIFIES the evidence's custody (VERIFIED) and B81's decision
 *          signature (VERIFIED); a version with no signature reads UNAVAILABLE, never FAILED; she ATTESTS the reroute package's lineage and custody
 *          (L. Brandt's attestation refused); she opens an INVESTIGATION on the withdrawn run → an attention item to its owner. RIGHTS: F. Aydın
 *          declares the carrier advisories' rights terms with an expiry already passed — a decision-active use of that evidence is REFUSED in the
 *          server's words — then declares them again in force (the use derives no option here: nothing is recorded by the refusal).
 *   B82-5  AI NON-AUTHORITY AND THE LAYERS: the B35 Decision Agent's recommendation reads RECOMMENDED and agent-authored; an agent-composed
 *          briefing named for the walk's AI notice; B35's explanations named for the layers.
 *   B82-6  THE LIBRARY: the DSA declares `design.evidence-bearing-charts`; the chart-grammar lint (dg-lint-4) recorded at ZERO over the real web
 *          source; B82's components registered and approved with ONE accountable owner; a design acceptance DEMONSTRATION record per chapter
 *          (ch6, ch26, ch27, ch57 — F-P7-E-07), `claim = demonstration`.
 *   B82-7  THE STATE, the env lines for the walks, THE LIMITS.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (0121 and its harnesses phase6-{prelude,truth,evidence,geography,trust,charts}-b82, the web unit
 * models and the walks); DEMONSTRATED OPERATION (this act — every persona SYNTHETIC; every acceptance record `claim = demonstration`); REAL
 * ACCEPTANCE (UX-06/26/27/57-006's signed packages) — NEVER claimed: the shared non-demonstration recording path is B111, then H3.
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
import { actTargetOrExit } from '../act-target.mjs';

// B80 integration pass (2026-10-19): the target is decided FIRST — before the local env is read, before any login, session
// or request. EYE_ACT_TARGET (rehearsal | live), EYE_DB_NAME and EYE_API come from the caller; a rehearsal that names no API,
// or names the live one, is refused here and contacts nothing (scripts/act-target.mjs; the B82 probe incident).
const ACT_TARGET = actTargetOrExit(process.env, { needs: ['api'] });

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
const stableUuid = (label) => { const h = sha256(`b82-act:${label}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const tStart = Date.now();
console.log(`THE B82 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, statuses, re) => {
  const st = Array.isArray(statuses) ? statuses : [statuses];
  if (!r.ok && st.includes(r.status) && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${st.join('/')} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const isRead = (action) => /\.(read|preview|search|list|get|explain|diff|history|replay|trace|scopes)$/.test(action) || /^(graph|objects|observation)\.read/.test(action)
  || action === 'graph.provenance.read' || action === 'observation.evidence.retrieve';
const over = (s, sc, action, objectType, objectId, purposeId, consequence) => ({
  scope: sc, tenantId: sc === 'PLATFORM' ? null : T, domainId: sc === 'DOMAIN' ? D : null, principalId: `principal:${s.principalId}`, purposeId,
  action, objectType, objectId, sideEffect: isRead(action) ? 'none' : 'reversible', consequence: consequence ?? (isRead(action) ? 'C1' : 'C2'), trace: 'phase6-b82' });
/** One retry when the TRANSPORT fails before any answer (a pooled socket reset): no answer means nothing was decided by the server's reply. */
const callOnce = async (path, o, payload, token) => {
  let r;
  try { r = await call(path, o, payload, token); } catch (e) { if (!/fetch failed/.test(String(e?.message))) throw e; note(`the transport was reset before an answer (${e?.cause?.code ?? e.message}); retried once`); r = await call(path, o, payload, token); }
  // a READ that outlived its authorization context (503 EYE-DEP-001: the result was discarded, nothing concluded — "retry") is read once more
  if (!r.ok && r.status === 503 && o.sideEffect === 'none' && /outlived its authorization context/.test(String(r.body?.message ?? ''))) { note(`the read ${o.action} outlived its authorization context (the server discarded it and says retry); read once more`); r = await call(path, o, payload, token); }
  return r;
};
const P = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => callOnce(path, over(s, 'PLATFORM', action, objectType, objectId, purpose), payload, s.token);
const DM = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance', consequence) => callOnce(path, over(s, 'DOMAIN', action, objectType, objectId, purpose, consequence), payload, s.token);
const BASE = `/v1/tenants/${T}/domains/${D}`;
const G = `${BASE}/graph`;
const O = `${BASE}/observation`;
const DG = '/v1/governance/design';
const DGD = `${BASE}/governance/design`;
const truth = (s, refs, purpose = 'decision') => DM(s, `${BASE}/display-truth`, 'objects.display_truth.read', { refs }, refs.length === 1 ? refs[0].type : 'OBJ', refs.length === 1 ? refs[0].id : null, purpose);
const resolve = (s, refs, depth = 6, purpose = 'decision') => DM(s, `${G}/citations/resolve`, 'graph.provenance.read', { refs, depth }, 'CIT', refs.length === 1 ? refs[0].id : null, purpose);
const trustRead = (s, path, payload, type = 'OBJ', id = null) => DM(s, `${G}/trust/${path}`, 'graph.trust.read', payload, type, id, 'graph');
const trustAct = (s, path, action, payload, type, id) => DM(s, `${G}/trust/${path}`, action, payload, type, id, 'graph');
const geo = (s, path, action, payload, id = null) => DM(s, `${G}/geo/${path}`, action, payload, 'GEO', id, 'graph');
const refText = (r) => `${r.type}:${r.id}@${r.version}`;
const truthLine = (t) => `${t.ref.split(':')[0]} ${short(t.ref.split(':')[1]?.split('@')[0])}@${t.ref.split('@')[1]} → ${String(t.display).toUpperCase()} (stored ${t.stored}; ${(t.reasons ?? []).map((x) => x.code).filter((c, i, a) => a.indexOf(c) === i).join(', ') || 'no reason'})`;

/* ── B82-0 THE CAST AND THE STATE ─────────────────────────────────────────────────────────── */
console.log('\nB82-0 THE CAST AND THE STATE — 0121, the build, the NORDWERK cast; the B31 package, its runs, twin v14, the corrected fragment; no geography and no AIS evidence, each stated');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0121%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0121 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D])).n > 0;
const CAST = [['l.brandt', 'decision_owner', 'DOMAIN'], ['k.mueller', 'knowledge_owner', 'DOMAIN'], ['l.ferreira', 'extraction_manager', 'DOMAIN'], ['a.hoffmann', 'domain_analyst', 'DOMAIN'],
  ['f.aydin', 'data_steward', 'DOMAIN'], ['n.eriksen', 'forecast_owner', 'DOMAIN'], ['e.lindqvist', 'auditor', 'TENANT'], ['c.brenner', 'decision_owner', 'DOMAIN'],
  ['s.okafor', 'decision_approver', 'DOMAIN'], ['l.haddad', 'design_system_authority', 'PLATFORM'], ['s.iversen', 'design_system_authority', 'PLATFORM'],
  ['p.castellano', 'conformance_steward', 'PLATFORM'], ['h.achterberg', 'independent_assurance', 'PLATFORM'], ['w.zielinska', 'customer_sponsor', 'TENANT']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n !== null) Object.assign(s, n); } };
const brandt = await persona('l.brandt'); const mueller = await persona('k.mueller'); const ferreira = await persona('l.ferreira'); const hoffmann = await persona('a.hoffmann');
const aydin = await persona('f.aydin'); const eriksen = await persona('n.eriksen'); const lindqvist = await persona('e.lindqvist'); const brenner = await persona('c.brenner');
const dsa = await persona('l.haddad'); const dsaOwner = await persona('s.iversen'); const steward = await persona('p.castellano'); const assurance = await persona('h.achterberg'); const sponsor = await persona('w.zielinska');
const NAME = Object.fromEntries([[brandt, 'L. Brandt'], [mueller, 'K. Müller'], [ferreira, 'L. Ferreira'], [hoffmann, 'A. Hoffmann'], [aydin, 'F. Aydın'], [eriksen, 'N. Eriksen'],
  [lindqvist, 'E. Lindqvist'], [brenner, 'C. Brenner'], [dsa, 'L. Haddad'], [dsaOwner, 'S. Iversen'], [steward, 'P. Castellano'], [assurance, 'H. Achterberg'], [sponsor, 'W. Zielińska']].map(([s, n]) => [s.principalId, n]));
const nm = (id) => NAME[String(id ?? '').replace(/^principal:/, '')] ?? short(id);
{
  const c = await P(admin, '/v1/governance/conformance/read', 'governance.read', {}, 'GOV', null, 'governance');
  const b = c.ok ? (c.body.build ?? c.body.identity ?? {}) : {};
  if (c.ok) note(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), migration head ${b.migration_head ?? '—'}, policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}`);
  else note(`the build identity was not read (${refusalLine(c)})`);
}
// THE B31 REROUTE PACKAGE (L. Brandt's, approved — MAP Q7: never a new package created to host the scene)
const PKG_TITLE = 'Regensburg routing — reroute the magnets via the Cape on the B31 corridor runs (SYNTHETIC)';
const PKG = await q1(`select package_id::text id, current_version::int v, state, owner_principal_id::text owner from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, PKG_TITLE]);
if (PKG === null) { bad(`the B31 package "${PKG_TITLE}" is absent (act-b31)`); process.exit(1); }
const OPTS = await q(`select key, title, kind, consequences from decision.options where package_id = $1 and version = $2 order by key`, [PKG.id, PKG.v]);
const REROUTE = OPTS.find((o) => o.key === 'reroute');
const RUNC = (REROUTE?.consequences ?? []).find((c) => c.kind === 'run') ?? null;
const RUN_VERSIONS = RUNC ? await q(`select object_version::int v, lifecycle_state s, truth_state t, withdrawal_reason w, source_object_ids src from objects.canonical_objects where object_id = $1 order by object_version`, [RUNC.id]) : [];
const TWIN_REF = String((RUN_VERSIONS[0]?.src ?? []).find((x) => String(x).startsWith('TWN:')) ?? '');
const SCN_REF = String((RUN_VERSIONS[0]?.src ?? []).find((x) => String(x).startsWith('SCN:')) ?? '');
const parseRef = (r) => { const m = /^([A-Z]{3}):([0-9a-f-]{36})@(\d+)$/.exec(r); return m ? { type: m[1], id: m[2], version: Number(m[3]) } : null; };
const TWIN = parseRef(TWIN_REF); const SCN = parseRef(SCN_REF);
(PKG.owner === brandt.principalId && RUNC && RUN_VERSIONS.length >= 2 && RUN_VERSIONS.at(-1).s === 'withdrawn' ? ok : bad)(`L. Brandt's B31 package "${PKG_TITLE}" ${short(PKG.id)} v${PKG.v} ${String(PKG.state).toUpperCase()}: options ${OPTS.map((o) => `${o.key} (${o.kind})`).join(', ')}; the reroute option cites the run ${short(RUNC?.id)}@${RUNC?.version} — its versions ${RUN_VERSIONS.map((x) => `v${x.v} ${x.s}`).join(', ')} (v${RUN_VERSIONS.at(-1)?.v} WITHDRAWN: ${String(RUN_VERSIONS.at(-1)?.w ?? '').slice(0, 120)}); it rests on ${TWIN_REF.replace(/:([0-9a-f]{4})[0-9a-f-]+(@\d+)/, ':$1…$2')} and ${SCN_REF.replace(/:([0-9a-f]{4})[0-9a-f-]+(@\d+)/, ':$1…$2')}`);
// the corrected PortWatch chokepoint-4 fragment the twin cites (bytes 471–854 of its day's file; v2 CORRECTED)
const FRAG = await q1(`select e.object_id::text id, max(e.object_version)::int v, (array_agg(e.payload -> 'fragment' order by e.object_version desc))[1] frag from objects.canonical_objects e
   where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD' and e.object_id::text like '01a084f5-7979-%' and e.payload -> 'fragment' ->> 'byte_start' = '471' group by e.object_id limit 1`, [T, D]);
(FRAG && FRAG.v >= 2 ? ok : bad)(`the PortWatch chokepoint-4 fragment ${short(FRAG?.id)} (bytes ${FRAG?.frag?.byte_start}–${FRAG?.frag?.byte_end} of its day's file, ${FRAG?.frag?.method_ref ?? '—'}): ${FRAG?.v ?? 0} version(s), the latest a CORRECTION`);
{
  const n = await q1(`select count(*)::int n from graph.geo_references where tenant_id = $1 and domain_id = $2`, [T, D]);
  note(`the geographic register holds ${n.n} reference version(s) ${n.n === 0 ? '— NO GEOGRAPHY EXISTED before B82: the map draws only what a data steward types (D4)' : '— an earlier run'}`);
  const ais = await q1(`select s.source_id::text id, s.connector_kind, s.contract_version::int v, (select count(*)::int from objects.canonical_objects e where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD' and e.provenance_ref like 'SRC:' || s.source_id::text || '@%') evd
     from observation.source_contracts_current s where s.tenant_id = $1 and s.domain_id = $2 and s.source_key = 'red-sea-ais-positions' and s.lifecycle_state = 'active' limit 1`, [T, D]);
  (ais && ais.evd === 0 ? ok : bad)(`the AIS source (red-sea-ais-positions, connector ${ais?.connector_kind}, contract v${ais?.v}): ${ais?.evd ?? '—'} evidence version(s) — "NO AIS EVIDENCE RECORDED", stated, never filled (MAP Q8); the closure evidence is the PortWatch fragment and the carrier advisories`);
  if (ais) ENV_OUT.EYE_B82_AIS_SOURCE = ais.id;
}

/* ── B82-1 THE DRILL (E-07) ─────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB82-1 THE DRILL (E-07) — L. Brandt: his recommendation on the B31 package (RECOMMENDED, advisory) → the reroute option → the run (INDETERMINATE: withdrawn since) → the scenario branch → twin v14 → the evidence fragment (CORRECTED); truth, freshness and trust facets at each hop; the cited bytes refused to him (D9) and opened by A. Hoffmann');
const RC = `${BASE}/decisions/recommendations`;
const recRow = async (author) => q1(`select recommendation_id::text id, state, option_key, digest, author_kind from decision.recommendations where package_id = $1 and version = $2 and author_principal_id = $3 and option_key = 'reroute'
   and state in ('proposed', 'accepted_for_consideration') order by recorded_at desc limit 1`, [PKG.id, PKG.v, author]);
let REC = await recRow(brandt.principalId);
if (REC) note(`L. Brandt's recommendation ${short(REC.id)} on reroute stands (${REC.state}) — an earlier run`);
else {
  const r = await DM(brandt, `${RC}/packages/${PKG.id}/versions/${PKG.v}/record`, 'decision.recommendation.record', {
    optionKey: 'reroute', what: 'Reroute the open magnet bookings via the Cape of Good Hope on the B31 corridor runs (SYNTHETIC)', forWhom: 'the Regensburg line\'s magnet supply (NORDWERK)', byWhen: '2026-11-16',
    assumptions: [{ statement: 'the Cape routing adds about two weeks of transit and the carriers keep the booked capacity (SYNTHETIC)' }],
    whatCouldMakeItWrong: [{ statement: 'the reroute run was WITHDRAWN since — its surcharge was omitted; the reroute\'s cost is not established (SYNTHETIC)', signpost: 'the reroute run re-issued with the surcharge' },
      { statement: 'the corridor reopens within the horizon and the longer routing buys nothing (SYNTHETIC)', signpost: 'the chokepoint-4 transits on the corridor map' }],
    missingEvidence: [{ what: 'no AIS positions recorded for the corridor — the vessels\' actual routing is not observed (SYNTHETIC)' }],
    components: {
      valueJudgments: [{ statement: 'an uninterrupted Regensburg line outweighs two weeks of transit this quarter (SYNTHETIC)', source: { kind: 'principal', ref: brandt.principalId } }],
      policyConstraints: [],
      analyticalAssumptions: [{ statement: 'the every-kind scenario\'s Downside branch stands for the corridor\'s closure (SYNTHETIC)', source: { kind: 'stated', ref: 'the B31 corridor runs' } }],
      modelOutputs: [{ statement: 'the reroute run keeps the line running under the closure (SYNTHETIC; the run was withdrawn since)', source: { kind: 'run', ref: RUNC.id } }],
    } }, 'DPK', PKG.id, 'decision');
  if (!r.ok) fail('L. Brandt records his recommendation on the reroute option', r);
  else {
    const x = r.body.recommendation; const run = (x.option_runs ?? [])[0];
    ok(`L. Brandt (decision owner, a PERSON) RECORDED the recommendation ${short(x.recommendation_id)} on "${x.option_title}" — ${x.state}, author ${x.author_kind}; ${x.coverage?.label ?? 'no coverage'}; the option's run: ${run?.label ?? '—'} (${(run?.reasons ?? []).map((y) => y.class).join(', ')}) — the port records the recommendation and STATES the run's refusal for decision use — ${rcpt(r)}`);
  }
  REC = await recRow(brandt.principalId);
}
if (REC) ENV_OUT.EYE_B82_RECOMMENDATION = REC.id;
ENV_OUT.EYE_B82_PACKAGE = PKG.id; ENV_OUT.EYE_B82_PACKAGE_VERSION = PKG.v;
if (RUNC) { ENV_OUT.EYE_B82_RUN = RUNC.id; ENV_OUT.EYE_B82_RUN_VERSION = RUNC.version; }
if (TWIN) { ENV_OUT.EYE_B82_TWIN = TWIN.id; ENV_OUT.EYE_B82_TWIN_VERSION = TWIN.version; }
if (SCN) ENV_OUT.EYE_B82_SCENARIO = SCN.id;
if (FRAG) { ENV_OUT.EYE_B82_EVD = FRAG.id; ENV_OUT.EYE_B82_EVD_VERSION = FRAG.v; }
// THE DISPLAY TRUTH AT EVERY HOP — derived in a read, never stored
const HOPS = [REC ? { type: 'REC', id: REC.id, version: 1 } : null, RUNC ? { type: 'SIM', id: RUNC.id, version: RUNC.version } : null, SCN, TWIN,
  FRAG ? { type: 'EVD', id: FRAG.id, version: FRAG.v } : null, FRAG ? { type: 'EVD', id: FRAG.id, version: FRAG.v - 1 } : null].filter((x) => x !== null);
{
  const r = await truth(brandt, HOPS);
  if (!r.ok) fail('L. Brandt reads the display truth along the drill', r);
  else {
    const by = Object.fromEntries((r.body.truth ?? []).map((t) => [t.ref, t]));
    const rec = REC ? by[`REC:${REC.id}@1`] : null; const run = RUNC ? by[`SIM:${RUNC.id}@${RUNC.version}`] : null;
    const e2 = FRAG ? by[`EVD:${FRAG.id}@${FRAG.v}`] : null; const e1 = FRAG ? by[`EVD:${FRAG.id}@${FRAG.v - 1}`] : null;
    (rec?.display === 'recommended' && rec.agent_authored === false && /^advisory, not a decision/.test(String(rec.constrained_use)) ? ok : bad)(`THE RECOMMENDATION reads ${String(rec?.display).toUpperCase()} — attributed to a PERSON (agent-authored ${rec?.agent_authored}: no AI notice is owed), "${String(rec?.constrained_use ?? '').slice(0, 90)}" — never DECIDED`);
    (run?.display === 'indeterminate' && (run.reasons ?? []).some((x) => x.code === 'withdrawn_input') ? ok : bad)(`THE RUN ${truthLine(run ?? { ref: '?:?@?', reasons: [] })}: "${String(run?.constrained_use ?? '').slice(0, 120)}"`);
    for (const h of [SCN, TWIN]) { const t = h ? by[refText(h)] : null; if (t) note(`${h.type === 'SCN' ? 'THE SCENARIO' : 'THE TWIN'} ${truthLine(t)}`); }
    (e2?.display === 'corrected' && e2.correction_of === `EVD:${FRAG.id}@${FRAG.v - 1}` ? ok : bad)(`THE EVIDENCE ${truthLine(e2 ?? { ref: '?:?@?', reasons: [] })} — linked to the preserved original ${e2?.correction_of}; the original reads "${String(e1?.constrained_use ?? '').slice(0, 80)}" (corrected by ${e1?.corrected_by})`);
    note(`the rule ${r.body.truth?.[0]?.rule_version} — ${rcpt(r)}`);
  }
}
// THE RUN'S CITATION RESOLVED DOWN TO ITS EVIDENCE LEAVES — under graph.provenance.read (D9: short of the bytes)
let SPAN = null;
if (RUNC) {
  const r = await resolve(brandt, [{ kind: 'run', id: RUNC.id, version: RUNC.version, digest: RUNC.digest }]);
  if (!r.ok) fail('L. Brandt resolves the reroute option\'s run citation', r);
  else {
    const x = r.body.resolutions[0]; const leaves = x.leaves ?? [];
    const by = leaves.reduce((a, l) => ({ ...a, [l.outcome]: (a[l.outcome] ?? 0) + 1 }), {});
    const hit = leaves.find((l) => l.evidence?.id === FRAG?.id) ?? null;
    (x.own?.outcome === 'withdrawn' && leaves.length > 0 ? ok : bad)(`THE CITATION of the run ${short(RUNC.id)}@${RUNC.version} (digest binds the ${x.own?.digest_binds}) resolves: its own outcome ${String(x.own?.outcome).toUpperCase()} — "${String(x.own?.detail ?? '').slice(0, 140)}"; ${leaves.length} evidence leaf/leaves at depth ${x.depth}${x.truncated ? ' (TRUNCATED)' : ''}: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}; the read's digest ${dg(r.body.digest)} — ${rcpt(r)}`);
    if (hit) {
      (hit.custody?.state === 'intact' && hit.digest_ok === true ? ok : bad)(`the leaf ${hit.path.map((p) => p.replace(/:([0-9a-f]{4})[0-9a-f-]+(@\d+)/, ':$1…$2')).join(' → ')}: ${String(hit.outcome).toUpperCase()}, digest ${hit.digest_ok ? 'verified' : 'NOT verified'}, custody ${hit.custody?.state} (${hit.custody?.events} event(s), last verified ${iso(hit.custody?.last_verified_at)}), tier ${hit.tier}, span ${hit.evidence?.byte_start}–${hit.evidence?.byte_end} of ${hit.evidence?.byte_length} bytes (${hit.span_basis}; a fragment of its day's file ${hit.evidence?.fragment?.byte_start}–${hit.evidence?.fragment?.byte_end}), rights ${hit.rights === null ? `no terms declared (the contract: ${hit.contract_rights_state})` : hit.rights?.state}; correction ${JSON.stringify(hit.correction)}`);
      SPAN = { id: hit.evidence.id, version: hit.evidence.version, start: hit.evidence.byte_start, end: hit.evidence.byte_end, length: hit.evidence.byte_length };
    } else bad(`no leaf of the run's citation reaches the corrected fragment ${short(FRAG?.id)} (${leaves.length} leaves)`);
  }
}
// TRUST FACETS AND FRESHNESS AT EACH HOP (facets, never a score)
for (const h of [RUNC ? { type: 'SIM', id: RUNC.id, version: RUNC.version } : null, TWIN, FRAG ? { type: 'EVD', id: FRAG.id, version: FRAG.v } : null].filter((x) => x !== null)) {
  const r = await trustRead(brandt, 'envelope', h, h.type, h.id);
  if (!r.ok) { fail(`L. Brandt reads the trust envelope of ${refText(h)}`, r); continue; }
  const e = r.body.envelope; const f = Object.fromEntries((e.facets ?? []).map((x) => [x.facet, x]));
  const numeric = JSON.stringify(e).match(/"(score|trust_score|trustScore)"/);
  ((e.facets ?? []).length === 8 && numeric === null ? ok : bad)(`TRUST at ${h.type} ${short(h.id)}@${h.version}: provenance ${String(e.provenance?.strength).toUpperCase()}${e.indeterminate ? ' · TRUST INDETERMINATE' : ''}; facets ${(e.facets ?? []).map((x) => `${x.facet} ${x.outcome}`).join(', ')}; freshness — "${String(f.freshness?.detail ?? '').slice(0, 80)}"; no score anywhere`);
}
// THE EVIDENCE HOP UNDER D9: L. Brandt's request for the cited bytes REFUSED; A. Hoffmann (who reads evidence today) opens the cited span
if (SPAN) {
  ENV_OUT.EYE_B82_SPAN_EVD = SPAN.id; ENV_OUT.EYE_B82_SPAN_VERSION = SPAN.version; ENV_OUT.EYE_B82_SPAN_START = SPAN.start; ENV_OUT.EYE_B82_SPAN_END = SPAN.end;
  const seg = (s, purpose) => DM(s, `${O}/evidence/${SPAN.id}/segment`, 'observation.evidence.retrieve', { version: SPAN.version, byteStart: SPAN.start, byteEnd: Math.min(SPAN.end, SPAN.start + 65536), context: 64 }, 'EVD', SPAN.id, purpose);
  expectRefused(`L. Brandt (decision owner) asks for the cited bytes ${SPAN.start}–${SPAN.end} of ${short(SPAN.id)}@${SPAN.version}`, await seg(brandt, 'decision'), 403, /no qualifying role binding/);
  note('D9 — NO new permission: the decision roles keep the citation\'s resolution (above) short of the bytes; granting them an evidence-segment read is a POLICY change the owner decides (recorded as his question)');
  const before = await q1(`select count(*)::int n from observation.custody_events where evd_object_id = $1`, [SPAN.id]).catch(() => null);
  const r = await seg(hoffmann, 'observation');
  if (!r.ok) fail('A. Hoffmann opens the cited span', r);
  else {
    const s = r.body.segment; const bytes = Buffer.from(s.base64 ?? '', 'base64');
    const after = before === null ? null : await q1(`select count(*)::int n from observation.custody_events where evd_object_id = $1`, [SPAN.id]).catch(() => null);
    (s.integrity === 'verified' && s.highlight?.start - s.served.start === SPAN.start - s.served.start && bytes.length === s.served.end - s.served.start ? ok : bad)(`A. Hoffmann (domain analyst — she reads evidence today) OPENED THE CITED SPAN of ${short(SPAN.id)}@${s.version}: the FULL digest re-verified on this read (${s.integrity}, ${dg(s.contentDigest)}, ${s.byteLength} bytes, tier ${s.tier}); served ${s.served.start}–${s.served.end} with the cited ${s.highlight.start}–${s.highlight.end} highlighted (64 bytes of context); custody written${after && before ? ` (${before.n} → ${after.n} custody event(s))` : ''}; the first cited bytes read "${bytes.subarray(s.highlight.start - s.served.start, s.highlight.start - s.served.start + 60).toString('utf8').replace(/\s+/g, ' ')}…" — ${rcpt(r)}`);
  }
}
{
  // the "port-closure" evidence: the carrier advisories' cited spans beside the PortWatch fragment (MAP Q8)
  const adv = await q1(`select count(*)::int n from objects.canonical_objects e join observation.source_contracts_current s on e.provenance_ref like 'SRC:' || s.source_id::text || '@%'
     where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD' and s.source_key = 'carrier-advisories'`, [T, D]);
  note(`the "port-closure" evidence is the PortWatch chokepoint-4 fragment above and ${adv.n} carrier advisory evidence version(s) (no port-closure bulletin is recorded — stated)`);
}

/* ── B82-2 CORRECTED AND THE NOTICE (E-07) ─────────────────────────────────────────────────── */
await renewAll();
console.log('\nB82-2 CORRECTED AND THE NOTICE (E-07) — B50\'s UNFIT claim corrected through the governed claim review; the correction linked to its preserved original; the original\'s citation CORRECTED SINCE; L. Brandt\'s next briefing in his room — the correction withheld under the room\'s policy, declared');
const UNFIT = await q1(`select m.object_id::text id, m.object_version::int v, m.reasons, c.payload ->> 'subject' subj, c.payload ->> 'predicate' pred, c.payload ->> 'object_value' val
   from graph.product_fitness_marks m join objects.canonical_objects c on c.object_id = m.object_id and c.object_version = m.object_version
   where m.tenant_id = $1 and m.domain_id = $2 and m.object_type = 'CLM' and m.verdict = 'unfit' and m.route = 'adjudication' order by m.marked_at limit 1`, [T, D]);
let CORR = null;
if (UNFIT === null) bad('B50\'s UNFIT claim is absent (act-b50 B50-4)');
else {
  ENV_OUT.EYE_B82_CLAIM = UNFIT.id; ENV_OUT.EYE_B82_CLAIM_ORIGINAL_VERSION = UNFIT.v;
  const latest = async () => q1(`select object_version::int v, correction_of, lifecycle_state s, payload -> 'review' review, accountable_owner owner, recorded_at from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [UNFIT.id]);
  CORR = await latest();
  note(`B50's UNFIT claim ${short(UNFIT.id)}@${UNFIT.v} — "${UNFIT.subj}" ${UNFIT.pred} "${UNFIT.val}" (marked UNFIT: ${(UNFIT.reasons ?? []).join(', ')}, routed to adjudication)`);
  if (CORR.v > UNFIT.v && CORR.correction_of) note(`the correction v${CORR.v} stands — an earlier run (decided by ${nm(CORR.owner)})`);
  else {
    let cs = await q1(`select case_id::text id, state from intelligence.review_current where claim_object_id = $1 and claim_version = $2 and state = 'queued' order by opened_at desc limit 1`, [UNFIT.id, UNFIT.v]);
    if (cs === null) {
      const r = await DM(hoffmann, `${BASE}/intelligence/review/request`, 'intelligence.review.request', { claimObjectId: UNFIT.id, claimVersion: UNFIT.v,
        reason: 'the claim is marked UNFIT (unsupported_claim) after the upheld challenge: its PortWatch day was restated (SYNTHETIC)' }, 'REV', null, 'intelligence');
      if (!r.ok) fail('A. Hoffmann requests the claim\'s review', r); else ok(`A. Hoffmann (domain analyst) REQUESTED the claim's review: case ${short(r.body.review?.caseId)} — ${rcpt(r)}`);
      cs = await q1(`select case_id::text id, state from intelligence.review_current where claim_object_id = $1 and claim_version = $2 and state = 'queued' order by opened_at desc limit 1`, [UNFIT.id, UNFIT.v]);
    } else note(`the claim's review case ${short(cs.id)} is QUEUED (opened at its extraction, below the review threshold) — the adjudication is decided on it`);
    if (cs) {
      const decide = (s) => DM(s, `${BASE}/intelligence/review/${cs.id}/decide`, 'intelligence.review.decide', { decision: 'correct',
        reason: 'the restated PortWatch day does not support the claim at its extracted confidence; corrected to the reviewed confidence — the B50 adjudication of the UNFIT claim (SYNTHETIC)', correctedValue: { confidence: 0.35 } }, 'REV', cs.id, 'intelligence', 'C2');
      expectRefused('K. Müller (knowledge owner — the adjudication routes to her) decides the claim review herself', await decide(mueller), 403, /no qualifying role binding/);
      const r = await decide(ferreira);
      if (!r.ok) fail('L. Ferreira decides the review (correct)', r);
      else ok(`L. Ferreira (extraction manager — the role that decides a claim review) CORRECTED the claim: case ${short(cs.id)} → ${r.body.review.state}, the new version v${r.body.review.newVersion} (confidence 0.35, human-review) linked by correction_of; the contradiction check raised ${r.body.review.contradictions} open contradiction(s) against the other days' readings of "${UNFIT.subj} ${UNFIT.pred}" — ${rcpt(r)}`);
    }
    CORR = await latest();
  }
  if (CORR && CORR.v > UNFIT.v) {
    ENV_OUT.EYE_B82_CLAIM_CORRECTED_VERSION = CORR.v;
    const r = await truth(brandt, [{ type: 'CLM', id: UNFIT.id, version: UNFIT.v }, { type: 'CLM', id: UNFIT.id, version: CORR.v }]);
    if (!r.ok) fail('L. Brandt reads the display truth of the original and the correction', r);
    else {
      const [a, b] = r.body.truth; const codes = (t) => [...new Set((t.reasons ?? []).map((x) => x.code))];
      const contra = (b.reasons ?? []).filter((x) => x.code === 'contradiction').length;
      (b.correction_of === `CLM:${UNFIT.id}@${UNFIT.v}` && codes(b).includes('correction_of') && (b.display === 'corrected' || (b.display === 'indeterminate' && contra > 0)) ? ok : bad)(
        `THE CORRECTION CLM ${short(UNFIT.id)}@${CORR.v} reads ${String(b.display).toUpperCase()} — linked to the preserved original (${b.correction_of}); ${b.display === 'corrected' ? 'CORRECTED' : `NOT shown CORRECTED: the derivation puts INDETERMINATE first — ${contra} open contradiction(s) with the other days' readings of the same subject and predicate (the PortWatch claims carry no day in their subject), open until adjudicated; reasons ${codes(b).join(', ')}`} — "${String(b.basis).slice(0, 140)}"`);
      (a.corrected_by === `CLM:${UNFIT.id}@${CORR.v}` && /superseded by correction v\d+ — the preserved original/.test(String(a.constrained_use)) ? ok : bad)(`THE ORIGINAL CLM ${short(UNFIT.id)}@${UNFIT.v} keeps its stored state (${a.stored}) and reads ${String(a.display).toUpperCase()}: "${String(a.constrained_use).slice(0, 150)}"`);
    }
    const o = await resolve(brandt, [{ kind: 'claim', id: UNFIT.id, version: UNFIT.v, digest: null }], 4);
    (o.ok && o.body.resolutions[0].own?.outcome === 'corrected' ? ok : bad)(`THE NOTICE THROUGH THE RESOLVER: a citation of the original CLM@${UNFIT.v} now resolves CORRECTED SINCE — "${String(o.body?.resolutions?.[0]?.own?.detail ?? refusalLine(o)).slice(0, 160)}"`);
    // the older briefings whose items cite the original (each shows the same notice when opened — the walk reads one)
    const old = await q(`select b.briefing_id::text id, b.room_id::text room, b.composed_via via, b.known_at from executive.briefings b, jsonb_array_elements(b.items) i
       where b.tenant_id = $1 and b.domain_id = $2 and i ->> 'item_id' = $3 order by b.known_at`, [T, D, `claim:${UNFIT.id}@${UNFIT.v}`]);
    note(`${old.length} earlier briefing(s) list the ORIGINAL claim as an item (${old.slice(0, 3).map((x) => `${short(x.id)} ${x.via} ${iso(x.known_at)}`).join(', ')}${old.length > 3 ? ', …' : ''}) — each reads CORRECTED SINCE at that item when opened`);
    if (old.length > 0) { ENV_OUT.EYE_B82_OLD_BRIEFING = old[0].id; ENV_OUT.EYE_B82_OLD_BRIEFING_ROOM = old[0].room; }
  }
}
// L. BRANDT'S NEXT BRIEFING in his room: the correction in "what changed" — or, under the room's briefing policy, WITHHELD and declared
{
  const ROOM = await q1(`select room_id::text id, title from executive.rooms_current where tenant_id = $1 and domain_id = $2 and owner_principal_id = $3 and title = 'January corridor collapse — Regensburg line'`, [T, D, brandt.principalId]);
  const item = CORR && UNFIT ? `claim:${UNFIT.id}@${CORR.v}` : null;
  if (ROOM === null || item === null) bad(`L. Brandt's room or the correction is absent (room ${ROOM ? 'found' : 'absent'})`);
  else {
    ENV_OUT.EYE_B82_ROOM = ROOM.id;
    const mineQ = () => q1(`select b.briefing_id::text id, b.known_at, b.narrative_cites, b.items, o.payload -> 'suppressed' suppressed, o.payload -> 'omissions' omissions from executive.briefings b
       left join objects.canonical_objects o on o.object_type = 'BRF' and o.object_id = b.briefing_id
       where b.room_id = $1 and b.composed_by = $2 and b.known_at > $3 order by b.known_at desc limit 1`, [ROOM.id, brandt.principalId, CORR.recorded_at]);
    let mine = await mineQ();
    // the prior: the room's last briefing BEFORE the correction was recorded (the briefing agent composes in this room on its own cadence — a
    // later agent edition would already have absorbed the change); "what changed" is the interval (prior.known_at, now]
    const prior = await q1(`select briefing_id::text id, known_at from executive.briefings where room_id = $1 and known_at < $2 order by known_at desc limit 1`, [ROOM.id, CORR.recorded_at]);
    const compose = (narrative) => DM(brandt, `${BASE}/briefings/compose`, 'briefing.compose', { roomId: ROOM.id, knownAt: new Date().toISOString(), priorBriefingId: prior?.id ?? null,
      ...(narrative ? { narrative, narrativeCites: [item] } : {}) }, 'BRF', null, 'briefing', 'C2');
    if (mine) note(`L. Brandt's briefing ${short(mine.id)} composed after the correction stands — an earlier run (${iso(mine.known_at)})`);
    else {
      const narrative = `The Cape of Good Hope reading that B50 marked UNFIT is corrected (v${CORR.v}, the reviewed confidence). I keep the Cape reroute under review until the reroute run is re-issued with the surcharge (SYNTHETIC — the decision owner's labelled paragraph).`;
      const first = await compose(narrative);
      if (first.ok) {
        ok(`L. Brandt COMPOSED the next briefing in "${ROOM.title}" ${short(first.body.briefing.briefing_id ?? first.body.briefing.briefingId)}: the correction is an item of "what changed" and his labelled paragraph cites it — ${rcpt(first)}`);
      } else {
        expectRefused(`L. Brandt's labelled paragraph cites the correction ${item.replace(/:([0-9a-f]{4})[0-9a-f-]+(@\d+)/, ':$1…$2')}`, first, 422, /^a narrative cites the items it summarises; unknown item\(s\): claim:/);
        const r = await compose(null);
        if (!r.ok) fail('L. Brandt composes the next briefing in his room', r);
        else ok(`L. Brandt (decision owner) COMPOSED the next briefing in "${ROOM.title}" ${short(r.body.briefing.briefing_id ?? r.body.briefing.briefingId)} since ${short(prior?.id)} (${iso(prior?.known_at)}), without the paragraph — ${rcpt(r)}`);
      }
      mine = await mineQ();
    }
    if (mine) {
      ENV_OUT.EYE_B82_BRIEFING = mine.id;
      const included = (mine.items ?? []).some((i) => i.item_id === item);
      const sup = (mine.suppressed ?? []).find((x) => JSON.stringify(x).includes(UNFIT.id)) ?? null;
      const om = (mine.omissions ?? []).find((x) => JSON.stringify(x).includes(UNFIT.id)) ?? null;
      (included || sup || om ? ok : bad)(`THE CORRECTION IN L. BRANDT'S BRIEFING ${short(mine.id)}: ${included ? `an item of "what changed"${(mine.narrative_cites ?? []).includes(item) ? ', cited by his labelled paragraph' : ''}` : `WITHHELD under the room's briefing policy and DECLARED as an omission — "${String(om?.reason ?? JSON.stringify(sup)).slice(0, 200)}" (prefer silence over false certainty: a claim needs two sources here; the paragraph cannot cite what the edition withholds — the server's refusal above)`}`);
    }
  }
}

/* ── B82-3 THE CORRIDOR MAP, THE BAND, THE FAN (E-21) ──────────────────────────────────────── */
await renewAll();
console.log('\nB82-3 THE CORRIDOR MAP, THE BAND, THE FAN (E-21) — F. Aydın declares the geographic register (typed, EPSG:4326, sourced, licensed; never imported); a mistyped site retired; the flow map\'s measure; the band and the fan named for the walk');
const SRC_STMT = 'Typed by F. Aydın (data steward) from a public nautical gazetteer entry, rounded to two decimals (SYNTHETIC demonstration)';
const LIC_STMT = 'Facts of geography typed by hand; no dataset imported, no licence restriction stated (SYNTHETIC demonstration)';
const NINGBO = [121.9, 29.9]; const BAB = [43.33, 12.58]; const SUEZ = [32.35, 30.6]; const CAPE = [18.47, -34.36]; const ROTTERDAM = [4.05, 51.95]; const REGENSBURG = [12.1, 49.01];
const GEO = [
  { key: 'chokepoint.bab-el-mandeb', label: 'Bab el-Mandeb', kind: 'chokepoint', geometry: { type: 'Point', coordinates: BAB }, uncertaintyM: 25_000, chokepointKey: 'portwatch:chokepoint4' },
  { key: 'chokepoint.suez-canal', label: 'Suez Canal', kind: 'chokepoint', geometry: { type: 'Point', coordinates: SUEZ }, uncertaintyM: 25_000, chokepointKey: 'portwatch:chokepoint1' },
  { key: 'chokepoint.cape-of-good-hope', label: 'Cape of Good Hope', kind: 'chokepoint', geometry: { type: 'Point', coordinates: CAPE }, uncertaintyM: 50_000, chokepointKey: 'portwatch:chokepoint7' },
  { key: 'port.ningbo', label: 'Ningbo', kind: 'port', geometry: { type: 'Point', coordinates: NINGBO }, uncertaintyM: 10_000, chokepointKey: null },
  { key: 'port.rotterdam', label: 'Rotterdam', kind: 'port', geometry: { type: 'Point', coordinates: ROTTERDAM }, uncertaintyM: 10_000, chokepointKey: null },
  { key: 'site.regensburg', label: 'Regensburg site (NORDWERK)', kind: 'site', geometry: { type: 'Point', coordinates: REGENSBURG }, uncertaintyM: 2_000, chokepointKey: null },
  { key: 'route.ningbo-rotterdam-via-suez', label: 'Ningbo → Rotterdam via Bab el-Mandeb and Suez', kind: 'route', geometry: { type: 'LineString', coordinates: [NINGBO, BAB, SUEZ, ROTTERDAM] }, uncertaintyM: 50_000, chokepointKey: null },
  { key: 'route.ningbo-rotterdam-via-cape', label: 'Ningbo → Rotterdam via the Cape of Good Hope', kind: 'route', geometry: { type: 'LineString', coordinates: [NINGBO, CAPE, ROTTERDAM] }, uncertaintyM: 50_000, chokepointKey: null },
];
const geoRow = async (key) => q1(`select reference_id::text id, version::int v, state from graph.geo_references r where tenant_id = $1 and domain_id = $2 and reference_key = $3
   and version = (select max(version) from graph.geo_references x where x.reference_id = r.reference_id) order by declared_at desc limit 1`, [T, D, key]);
{
  const payload = (g) => ({ requestId: stableUuid(`geo:${g.key}`), expectedVersion: 0, key: g.key, label: g.label, kind: g.kind, geometry: g.geometry, crs: 'EPSG:4326', uncertaintyM: g.uncertaintyM,
    sourceStatement: SRC_STMT, licenceStatement: LIC_STMT, chokepointKey: g.chokepointKey, linked: null, reason: `the corridor map draws ${g.label} (B82 demonstration; SYNTHETIC)` });
  if ((await geoRow(GEO[0].key)) === null) {
    expectRefused('A. Hoffmann (domain analyst — not a data steward) declares Bab el-Mandeb', await geo(hoffmann, 'references', 'graph.geo.declare', { ...payload(GEO[0]), requestId: randomUUID() }), 403, /no qualifying role binding/);
    expectRefused('F. Aydın declares it in EPSG:3857 (another CRS is never converted)', await geo(aydin, 'references', 'graph.geo.declare', { ...payload(GEO[0]), requestId: randomUUID(), crs: 'EPSG:3857' }), 422, /^geographic reference rejected \(crs\)/);
  }
  const lines = []; let declared = 0;
  for (const g of GEO) {
    if (await geoRow(g.key)) { lines.push(`${g.key} stands`); continue; }
    const r = await geo(aydin, 'references', 'graph.geo.declare', payload(g));
    if (!r.ok) { fail(`F. Aydın declares ${g.key}`, r); continue; }
    declared += 1; lines.push(`${g.key} v${r.body.reference.version}${g.chokepointKey ? ` (${g.chokepointKey})` : ''}`);
  }
  ok(`F. Aydın (data steward, human gate) DECLARED ${declared} reference(s) of the corridor — typed in EPSG:4326 with uncertainty, source and licence (never imported, no tile, no network): ${lines.join(', ')}`);
  // THE MISTYPED SITE: declared with latitude and longitude swapped, RETIRED by her (its history kept)
  const MIS = 'site.regensburg-mistyped';
  let m = await geoRow(MIS);
  if (m === null) {
    const r = await geo(aydin, 'references', 'graph.geo.declare', { ...payload({ key: MIS, label: 'Regensburg site — mistyped (latitude and longitude swapped)', kind: 'site', geometry: { type: 'Point', coordinates: [REGENSBURG[1], REGENSBURG[0]] }, uncertaintyM: 2_000, chokepointKey: null }) });
    if (!r.ok) fail('F. Aydın declares the mistyped site', r); else note(`F. Aydın declared ${MIS} at [${REGENSBURG[1]}, ${REGENSBURG[0]}] — the order swapped (a typing slip, shown on purpose)`);
    m = await geoRow(MIS);
  }
  if (m && m.state === 'active') {
    const r = await geo(aydin, `references/${m.id}/retire`, 'graph.geo.retire', { requestId: stableUuid(`geo-retire:${MIS}`), expectedVersion: m.v, reason: 'latitude and longitude were typed in the wrong order; the site is declared again as site.regensburg (SYNTHETIC)' }, m.id);
    if (!r.ok) fail('F. Aydın retires the mistyped site', r);
    else ok(`F. Aydın RETIRED ${MIS} at v${r.body.reference.version} with her reason — it is never drawn again; its history is kept — ${rcpt(r)}`);
  } else if (m) note(`${MIS} stands RETIRED (v${m.v}) — an earlier run`);
  // THE LAYER, read by N. Eriksen (graph.geo.read)
  const l = await geo(eriksen, 'layer', 'graph.geo.read', {});
  if (!l.ok) fail('N. Eriksen reads the geographic layer', l);
  else {
    const L = l.body.layer; const refs = L.references ?? [];
    (L.crs === 'EPSG:4326' && refs.filter((x) => x.state === 'active').length >= GEO.length && !refs.some((x) => x.key === MIS) ? ok : bad)(`THE LAYER (graph.geo.read): ${L.counts?.active ?? refs.length} active reference(s) in ${L.crs}, bounds ${JSON.stringify(L.bounds)}, rule ${L.rule_version}; the retired site is not drawn — "${String(L.statement ?? '').slice(0, 140)}"`);
  }
}
// THE FLOW MAP'S MEASURE: each declared chokepoint names its PortWatch transit series (`<chokepoint key>:n_total`); the page reads the series
// under the reader's own prediction.read. The act does NOT read the points itself: one points read assembles the WHOLE series from its
// evidence (every version digest-verified, custody written per read) — minutes on the demonstration (the rehearsal's finding, said below)
{
  const keys = GEO.filter((x) => x.chokepointKey).map((g) => `${g.chokepointKey}:n_total`);
  const reg = await q(`select series_key from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = any($3)`, [T, D, keys]);
  const n = await q1(`select count(*)::int n from objects.canonical_objects e join observation.source_contracts_current s on e.provenance_ref like 'SRC:' || s.source_id::text || '@%'
     where e.tenant_id = $1 and e.domain_id = $2 and e.object_type = 'EVD' and s.source_key = 'imf-portwatch-chokepoints'`, [T, D]);
  (reg.length === keys.length ? ok : bad)(`THE FLOW MAP'S MEASURE: the ${keys.length} declared chokepoints name their registered transit series (${reg.map((x) => x.series_key).join(', ')}); the map states its rule — a route takes the mean daily transits (last 30 points) of the FIRST chokepoint it passes whose series is read: the Suez route by Bab el-Mandeb, the Cape route by the Cape of Good Hope (dashed)`);
  note(`READ COST, said: each series read assembles the whole PortWatch history (${n.n} evidence versions of the source, each digest-verified with a custody entry) — the flow map draws only after those reads answer (minutes on this copy); the act does not repeat them`);
}
// THE BAND AND THE FAN — the reads the walk opens
{
  const F = await q1(`select f.forecast_id::text id, f.series_key, f.validation_state, f.known_at from prediction.forecasts_current f where f.tenant_id = $1 and f.domain_id = $2 and f.series_key like 'portwatch:chokepoint4%' order by f.known_at desc limit 1`, [T, D]).catch(() => null);
  if (F) { ENV_OUT.EYE_B82_FORECAST = F.id; note(`THE PROBABILITY BAND: the chokepoint-4 forecast ${short(F.id)} on ${F.series_key} (validation ${F.validation_state}, known at ${iso(F.known_at)}) — its q10–q90 band with the validation state stated; the walk reads it at /prediction/forecasts/${F.id}`); }
  else note('no chokepoint-4 forecast is recorded — the band is read on the forecast the walk finds first');
  if (SCN) note(`THE SCENARIO FAN: the every-kind scenario ${short(SCN.id)} (the run's basis) — its branches fanned with the valid runs' spread, the suspended or closed branches marked; the walk reads it at /prediction/scenarios/anatomy?scenario=${SCN.id}`);
}

/* ── B82-4 TRUST AND RIGHTS (E-07) ─────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB82-4 TRUST AND RIGHTS (E-07) — E. Lindqvist (auditor): the overview; VERIFIED custody and signature, UNAVAILABLE never FAILED; an attestation (L. Brandt\'s refused); an investigation to the run\'s owner. F. Aydın: rights terms expired → a decision-active use REFUSED → declared again in force');
{
  const o = await trustRead(lindqvist, 'overview', { types: ['DPK', 'BRF', 'FCT', 'SIM', 'CLM'], limit: 5 }, 'OBJ', null);
  if (!o.ok) fail('E. Lindqvist reads the Trust and Governance overview', o);
  else {
    const v = o.body.overview ?? o.body;
    const sizes = Object.entries(v).filter(([, x]) => Array.isArray(x)).map(([k, x]) => `${k} ${x.length}`);
    ok(`E. Lindqvist (auditor, TENANT) read /graph/trust's OVERVIEW (WS-18): ${sizes.join(', ') || Object.keys(v).join(', ')} — "${String(v.statement ?? '').slice(0, 120)}" — ${rcpt(o)}`);
  }
  const verify = (s, subj, facet, label) => trustAct(s, 'verify', 'graph.trust.verify', { ...subj, facet, requestId: stableUuid(`verify:${label}`) }, subj.type, subj.id);
  const vRow = async (subj, facet) => q1(`select outcome, detail, verified_at from graph.trust_verifications where subject_id = $1 and subject_version = $2 and facet = $3 and verifier = $4 order by verified_at desc limit 1`, [subj.id, subj.version, facet, lindqvist.principalId]);
  const shown = async (subj, facet, label, want) => {
    const had = await vRow(subj, facet);
    const r = had ? null : await verify(lindqvist, subj, facet, label);
    if (r && !r.ok) { fail(`E. Lindqvist verifies ${facet} of ${refText(subj)}`, r); return; }
    const x = r ? r.body.verification : had;
    (x.outcome === want ? ok : bad)(`E. Lindqvist VERIFIED AGAIN the ${facet} of ${subj.type} ${short(subj.id)}@${subj.version} (${label}): ${String(x.outcome).toUpperCase()} — "${String(x.detail ?? '').slice(0, 140)}"${had ? ' — stands, an earlier run' : ` — ${rcpt(r)}`}`);
  };
  if (FRAG) await shown({ type: 'EVD', id: FRAG.id, version: FRAG.v }, 'custody', 'the corrected fragment', 'verified');
  const B81 = await q1(`select p.package_id::text id, p.current_version::int v from decision.packages_current p where p.tenant_id = $1 and p.domain_id = $2 and p.title = 'Bab el-Mandeb corridor reroute (SYNTHETIC)'`, [T, D]);
  if (B81) await shown({ type: 'DPK', id: B81.id, version: 1 }, 'signature', 'B81\'s committed decision, signed', 'verified');
  await shown({ type: 'DPK', id: PKG.id, version: PKG.v }, 'signature', 'the B31 package: no signature recorded', 'unavailable');
  // THE ATTESTATION on the B31 package's lineage and custody (never an approval; never the producer's)
  const subj = { type: 'DPK', id: PKG.id, version: PKG.v };
  const att = await q1(`select attestation_id::text id, facets, attested_at from graph.trust_attestations where subject_id = $1 and subject_version = $2 and attested_by = $3 order by attested_at desc limit 1`, [PKG.id, PKG.v, lindqvist.principalId]);
  const env0 = await trustRead(lindqvist, 'envelope', subj, 'DPK', PKG.id);
  if (!env0.ok) fail('E. Lindqvist reads the package\'s trust envelope', env0);
  else {
    const e = env0.body.envelope;
    const statement = 'I inspected the backward path of this package version and the custody of every evidence version on it; the reroute run it rests on was withdrawn since, and that stands (SYNTHETIC)';
    expectRefused('L. Brandt (the package\'s owner) attests his own package', await trustAct(brandt, 'attest', 'graph.trust.attest', { ...subj, requestId: randomUUID(), facets: ['lineage', 'custody'], statement, envelopeDigest: e.digest }, 'DPK', PKG.id), 403);
    if (att) note(`E. Lindqvist's attestation ${short(att.id)} (${(att.facets ?? []).join(', ')}) stands — an earlier run`);
    else {
      const r = await trustAct(lindqvist, 'attest', 'graph.trust.attest', { ...subj, requestId: stableUuid('attest:b31-package'), facets: ['lineage', 'custody'], statement, envelopeDigest: e.digest }, 'DPK', PKG.id);
      if (!r.ok) fail('E. Lindqvist attests the package', r);
      else {
        const x = r.body.attestation;
        const after = await trustRead(lindqvist, 'envelope', subj, 'DPK', PKG.id);
        const same = after.ok && JSON.stringify((after.body.envelope.facets ?? []).map((f) => [f.facet, f.outcome])) === JSON.stringify((e.facets ?? []).map((f) => [f.facet, f.outcome]));
        (x.state === 'standing' && same ? ok : bad)(`E. Lindqvist ATTESTED ${x.facets?.join(' and ')} of the package (a recorded statement by a person, bound to the envelope digest ${dg(x.envelope_digest)} — never an approval: no facet moved (${same}), no command is enabled) — ${rcpt(r)}`);
      }
    }
    ENV_OUT.EYE_B82_TRUST_SUBJECT_TYPE = 'DPK'; ENV_OUT.EYE_B82_TRUST_SUBJECT = PKG.id; ENV_OUT.EYE_B82_TRUST_SUBJECT_VERSION = PKG.v;
    note(`the package's envelope: provenance ${String(e.provenance?.strength).toUpperCase()}; ${(e.facets ?? []).map((f) => `${f.facet} ${f.outcome}`).join(', ')}`);
  }
  // THE INVESTIGATION on the withdrawn run → an attention item `trust_investigation` routed to its owner
  if (RUNC) {
    const run = { type: 'SIM', id: RUNC.id, version: RUNC.version };
    const r = await trustAct(lindqvist, 'investigate', 'graph.trust.investigate', { ...run, itemId: stableUuid('investigate:reroute-run'), facet: 'correction',
      note: 'The B31 reroute package rests on this run, which was withdrawn since (the surcharge omitted); who re-issues it, and when? (SYNTHETIC)' }, 'SIM', RUNC.id);
    if (!r.ok) fail('E. Lindqvist opens an investigation on the run', r);
    else {
      const x = r.body.investigation;
      const item = await q1(`select signal_class, owner_principal_id::text owner, state from executive.attention_items where item_id = $1`, [x.item_id]);
      (item?.signal_class === 'trust_investigation' ? ok : bad)(`E. Lindqvist OPENED AN INVESTIGATION on ${refText(run).replace(/:([0-9a-f]{4})[0-9a-f-]+(@\d+)/, ':$1…$2')} (the correction facet): attention item ${short(x.item_id)} of class ${item?.signal_class} routed to its owner ${nm(item?.owner ?? x.owner)} (${item?.state ?? '—'})${x.repeated ? ' — the same item answered (an earlier run)' : ''} — ${rcpt(r)}`);
      ENV_OUT.EYE_B82_INVESTIGATION_ITEM = x.item_id;
    }
  }
}
// RIGHTS (D10): the carrier advisories' rights terms — expired, a decision-active use refused, declared again in force
{
  const SRC = await q1(`select source_id::text id, contract_version::int v from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'carrier-advisories' and lifecycle_state = 'active' limit 1`, [T, D]);
  const ADV = SRC ? await q1(`select object_id::text id, object_version::int v, content_digest digest from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and provenance_ref like 'SRC:' || $3 || '@%' and lifecycle_state = 'admitted' order by recorded_at limit 1`, [T, D, SRC.id]) : null;
  const MITIGATE = await q1(`select package_id::text id, current_version::int v from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'Mitigate the corridor closure — Regensburg line' limit 1`, [T, D]);
  const terms = async () => q1(`select terms_id::text id, version::int v, state, expires_at from observation.rights_terms t where source_id = $1 and contract_version = $2 and version = (select max(version) from observation.rights_terms x where x.terms_id = t.terms_id) order by declared_at desc limit 1`, [SRC?.id, SRC?.v]);
  if (!SRC || !ADV || !MITIGATE) bad(`the rights scene's inputs: carrier-advisories ${!!SRC}, an advisory evidence ${!!ADV}, the Mitigate package ${!!MITIGATE}`);
  else {
    ENV_OUT.EYE_B82_RIGHTS_SOURCE = SRC.id; ENV_OUT.EYE_B82_ADVISORY_EVD = ADV.id;
    const declare = (expectedVersion, expiresAt, reason) => DM(aydin, `${O}/rights/declare`, 'observation.rights.declare', { sourceId: SRC.id, contractVersion: SRC.v, expectedVersion, expiresAt,
      purposes: ['decision support', 'internal briefings'], prohibitedUses: ['redistribution outside NORDWERK'], attribution: 'Carrier & port advisories (SYNTHETIC)', reason, requestId: randomUUID() }, 'SRC', SRC.id, 'observation');
    const derive = () => DM(brenner, `${BASE}/decisions/${MITIGATE.id}/versions/${MITIGATE.v}/options`, 'decision.package.option', { key: 'b82-advisory-rights', title: 'Hold the bookings on the carrier advisory (SYNTHETIC)', kind: 'intervention',
      consequences: [{ kind: 'evidence', id: ADV.id, version: ADV.v, digest: ADV.digest }],
      unsimulatedReason: 'not simulated here: the option exists to show the rights check at a decision-active use (SYNTHETIC; refused — nothing is recorded)' }, 'DPK', MITIGATE.id, 'decision');
    let t = await terms();
    if (t && t.state === 'in_force' && t.v >= 2) note(`the carrier advisories' rights terms v${t.v} stand IN FORCE (expiring ${iso(t.expires_at)}) — an earlier run; the expired v${t.v - 1} is kept in the ledger`);
    else {
      expectRefused('A. Hoffmann (domain analyst) declares rights terms', await DM(hoffmann, `${O}/rights/declare`, 'observation.rights.declare', { sourceId: SRC.id, contractVersion: SRC.v, expectedVersion: t?.v ?? 0, expiresAt: null, purposes: ['decision support'], prohibitedUses: [], reason: 'not mine to declare (refused)' }, 'SRC', SRC.id, 'observation'), 403);
      if (t === null) {
        const past = new Date(Date.now() - 86_400_000).toISOString();
        const r = await declare(0, past, 'The carrier advisories\' licence term ended yesterday (as the advisory service states it; SYNTHETIC)');
        if (!r.ok) fail('F. Aydın declares the expired rights terms', r);
        else ok(`F. Aydın (data steward, human gate) DECLARED the carrier advisories' rights terms v${r.body.terms.version} for contract v${SRC.v}: purposes ${(r.body.terms.purposes ?? []).join(', ')}, prohibited ${(r.body.terms.prohibited_uses ?? []).join(', ')}, EXPIRES ${iso(r.body.terms.expires_at)} — already passed — ${rcpt(r)}`);
        t = await terms();
      }
      if (t && t.state !== 'withdrawn') {
        const x = await derive();
        expectRefused(`C. Brenner derives an option on "Mitigate the corridor closure — Regensburg line" v${MITIGATE.v} citing a carrier advisory ${short(ADV.id)}@${ADV.v}`, x, 409, /^object use rejected \(rights_expired\)/);
        const rr = await resolve(brenner, [{ kind: 'evidence', id: ADV.id, version: ADV.v, digest: ADV.digest }], 2);
        if (rr.ok) note(`the advisory's citation resolves ${String(rr.body.resolutions[0].outcome).toUpperCase()} — the leaf's rights ${JSON.stringify(rr.body.resolutions[0].leaves?.[0]?.rights ?? null).slice(0, 160)}`);
        const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
        const r = await declare(t.v, future, 'The advisory service renewed the licence for twelve months (SYNTHETIC)');
        if (!r.ok) fail('F. Aydın declares the renewed rights terms', r);
        else ok(`F. Aydın DECLARED the renewed terms v${r.body.terms.version} — IN FORCE until ${iso(r.body.terms.expires_at)}; the expired version stays in the ledger — ${rcpt(r)}`);
      }
    }
    // the data steward declares the terms but holds no observation read (D9 — no permission widened): A. Hoffmann, who reads evidence, reads them
    expectRefused('F. Aydın reads the rights terms she declared (observation.read.rights is the observation readers\' — a data steward is not one)', await DM(aydin, `${O}/rights/${SRC.id}/read`, 'observation.read.rights', {}, 'SRC', SRC.id, 'observation'), 403);
    const rd = await DM(hoffmann, `${O}/rights/${SRC.id}/read`, 'observation.read.rights', {}, 'SRC', SRC.id, 'observation');
    if (!rd.ok) fail('A. Hoffmann reads the rights terms', rd);
    else {
      const R_ = rd.body.rights; const cur = R_.current ?? R_.terms ?? (Array.isArray(R_) ? R_[0] : null);
      note(`the rights terms read (observation.read.rights): ${JSON.stringify(cur ?? R_).slice(0, 260)}`);
    }
  }
}

/* ── B82-5 AI NON-AUTHORITY AND THE LAYERS ─────────────────────────────────────────────────── */
await renewAll();
console.log('\nB82-5 AI NON-AUTHORITY AND THE LAYERS — the B35 Decision Agent\'s recommendation RECOMMENDED and agent-authored; an agent-composed briefing; B35\'s explanations for the layers');
{
  const A = await q1(`select r.recommendation_id::text id, r.package_id::text pkg, r.option_key from decision.recommendations r join identity.principals p on p.id = r.author_principal_id
     where r.tenant_id = $1 and r.domain_id = $2 and r.author_kind = 'agent' order by r.recorded_at desc limit 1`, [T, D]);
  if (A === null) bad('no agent-authored recommendation is recorded (act-b35)');
  else {
    const r = await truth(brandt, [{ type: 'REC', id: A.id, version: 1 }]);
    const t = r.ok ? r.body.truth[0] : null;
    (t?.display === 'recommended' && t.agent_authored === true ? ok : bad)(`the Decision Agent's recommendation ${short(A.id)} on "${A.option_key}": ${String(t?.display).toUpperCase()}, AGENT-AUTHORED ${t?.agent_authored} — "${String((t?.reasons ?? [])[0]?.detail ?? refusalLine(r)).slice(0, 120)}" — the page carries the AI notice naming the agent`);
    ENV_OUT.EYE_B82_AGENT_RECOMMENDATION = A.id; ENV_OUT.EYE_B82_AGENT_PACKAGE = A.pkg;
  }
  const B = await q1(`select b.briefing_id::text id, b.room_id::text room, b.agent_id::text agent, b.known_at from executive.briefings b where b.tenant_id = $1 and b.domain_id = $2 and b.composed_via = 'agent' and b.room_id is not null order by b.known_at desc limit 1`, [T, D]);
  if (B) { note(`the latest AGENT-composed briefing ${short(B.id)} (agent ${short(B.agent)}, ${iso(B.known_at)}) — the walk reads its AI notice`); ENV_OUT.EYE_B82_AGENT_BRIEFING = B.id; ENV_OUT.EYE_B82_AGENT_BRIEFING_ROOM = B.room; }
  const X = await q1(`select count(*)::int n from decision.explanations where tenant_id = $1 and domain_id = $2`, [T, D]).catch(() => ({ n: null }));
  note(`B35's explanations recorded: ${X?.n ?? '—'} — the layered pattern (executive → analyst → auditor) projects their App. L keys, no new table (D12); the walk reads it on /decisions/explanations`);
}

/* ── B82-6 THE LIBRARY AND THE ACCEPTANCE DEMONSTRATION RECORDS ─────────────────────────────── */
await renewAll();
console.log('\nB82-6 THE LIBRARY — the principle design.evidence-bearing-charts declared by the DSA; dg-lint-4 recorded at ZERO; B82\'s components registered and approved with ONE owner; a design acceptance DEMONSTRATION record per chapter (ch6, ch26, ch27, ch57)');
const PRINCIPLE = 'design.evidence-bearing-charts';
let EVAL = null;
{
  const p = await q1(`select version::int v, state from governance.design_principles where principle_key = $1 order by version desc limit 1`, [PRINCIPLE]);
  if (p) note(`the principle ${PRINCIPLE} v${p.v} stands (${p.state}) — an earlier run`);
  else {
    const statement = 'Strategic visualizations use an evidence-bearing grammar (UX-ADR-015): every material visual renders through the library\'s chart frame and declares its basis, time (basis, cutoff, as-of), units, sources, uncertainty, legend and an accessible table alternative; series are told apart without colour alone; a drawing outside the frame, or a data bar drawn with boxes, bypasses the grammar.';
    const body = { key: PRINCIPLE, expectedVersion: 0, kind: 'principle', statement, patterns: [], remediation: 'draw through the library\'s ChartFrame (a chart of components/chart.tsx, strategic-charts.tsx or canvas.tsx); else record a narrow, expiring design exception', reason: 'B82: dg-lint-4 evidences this principle (SYNTHETIC demonstration)' };
    expectRefused('P. Castellano (conformance steward) declares the principle', await P(steward, `${DG}/principles/declare`, 'governance.design.principle.declare', body, 'DSP'), 403);
    const r = await P(dsa, `${DG}/principles/declare`, 'governance.design.principle.declare', body, 'DSP');
    if (!r.ok) fail('L. Haddad declares the principle', r); else ok(`L. Haddad (Design System Authority, human gate) DECLARED the principle ${PRINCIPLE} v${r.body.principle?.version ?? 1} — "${statement.slice(0, 110)}…" — ${rcpt(r)}`);
  }
  const since = await q1(`select max(declared_at) t from governance.design_principles where principle_key = $1`, [PRINCIPLE]).catch(() => null);
  EVAL = await q1(`select evaluation_id::text id, verdict, digest, evaluated_at, jsonb_array_length(findings)::int n from governance.design_evaluations where source = 'lint' and rules_version like 'dg-lint-4%' and evaluated_at >= coalesce($1, '-infinity'::timestamptz) order by evaluated_at desc limit 1`, [since?.t ?? null]);
  if (EVAL) note(`the chart-grammar lint ${short(EVAL.id)} (${EVAL.verdict}, ${EVAL.n} finding(s), ${iso(EVAL.evaluated_at)}) stands — an earlier run`);
  else {
    const r = await P(steward, `${DG}/evaluations/chart-grammar`, 'governance.design.evaluate', {}, 'DSE');
    if (!r.ok) fail('P. Castellano records the chart-grammar lint', r);
    else {
      const e = r.body.evaluation;
      (e.open === 0 ? ok : bad)(`P. Castellano RECORDED the chart-grammar lint (dg-lint-4) over the real web source: ${e.files} files, verdict ${String(e.verdict).toUpperCase()}, ${e.open} open finding(s) — dg-lint-4 AT ZERO (§SC replaced the div charts) — evidence ${short(e.evaluation_id)} — ${rcpt(r)}`);
    }
    EVAL = await q1(`select evaluation_id::text id, verdict, digest, evaluated_at, jsonb_array_length(findings)::int n from governance.design_evaluations where source = 'lint' and rules_version like 'dg-lint-4%' order by evaluated_at desc limit 1`);
  }
}
const B82_FILES = ['truth', 'evidence', 'chart-frame', 'chart', 'canvas', 'strategic-charts', 'trust'];
const libRows = async () => q(`select asset_id::text id, asset_key k, version, status, digest, owner_principal_id::text owner from governance.design_assets where superseded_at is null and asset_key ~ $1 order by asset_key`, [`^web\\.(${B82_FILES.join('|')})\\.`]);
{
  let lib = await libRows();
  if (lib.length > 0) note(`B82's library is in the inventory (${lib.length} components): stands — an earlier run`);
  else {
    const reg = await P(steward, `${DG}/assets/register`, 'governance.design.asset.register', {}, 'DSA');
    if (!reg.ok) fail('P. Castellano re-reads and registers the design inventory', reg);
    else {
      const inv = reg.body.inventory;
      const mine = (inv.registered ?? []).filter((x) => B82_FILES.some((f) => x.key.startsWith(`web.${f}.`)));
      (mine.length > 0 ? ok : bad)(`P. Castellano (conformance steward) re-read the inventory from the repository: ${(inv.registered ?? []).length} new asset(s) registered (${mine.length} of B82's library — ${B82_FILES.map((f) => `${f} ${mine.filter((x) => x.key.startsWith(`web.${f}.`)).length}`).join(', ')}), ${inv.unchanged} unchanged; DRIFT STATED (the inventory changes nothing — the steward reconciles): ${(inv.drift ?? []).map((x) => x.key).join(', ') || 'none'}`);
    }
    lib = await libRows();
  }
  let approved = 0; let stood = 0;
  for (const a of lib) {
    if (a.status === 'approved' && a.owner) { stood += 1; continue; }
    const r = await P(dsa, `${DG}/assets/${a.id}/approve`, 'governance.design.asset.approve', { version: a.version, digest: a.digest, ownerPrincipalId: dsaOwner.principalId,
      reason: `${a.k} — a B82 trust / evidence / visualization component read against Volume 9 and its unit fixtures (SYNTHETIC)` }, 'DSA', a.id);
    if (!r.ok) fail(`L. Haddad approves ${a.k}`, r); else approved += 1;
  }
  lib = await libRows();
  const owners = new Set(lib.map((a) => a.owner));
  (lib.length > 0 && lib.every((a) => a.status === 'approved') && owners.size === 1 && owners.has(dsaOwner.principalId) ? ok : bad)(`L. Haddad (Design System Authority, human gate) APPROVED ${approved} B82 component(s)${stood ? ` (${stood} stand — an earlier run)` : ''}: ${lib.length} components of ${B82_FILES.join(', ')}, each with ONE accountable owner — S. Iversen`);
  const DBL_TITLE = 'The Eye design baseline 2026-10 — B82 trust, evidence and the visualization library (SYNTHETIC demonstration)';
  const tokensVersion = JSON.parse(readFileSync(join(SELF_ROOT, 'packages', 'tokens', 'package.json'), 'utf8')).version;
  const CHAPTERS = [['ch6', 'truth state, uncertainty and AI non-authority'], ['ch26', 'evidence, citation, custody and rights'], ['ch27', 'provenance and layered explanation'], ['ch57', 'the trust envelope — verify, attest, investigate']];
  let DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  if (DBL === null && lib.length > 0) {
    const p = await P(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { expectedVersion: 0, title: DBL_TITLE, designSystemVersion: `@eye/tokens@${tokensVersion}`,
      scope: { capabilities: ['F-P7-E-07', 'F-P7-E-21'], journeys: CHAPTERS.map((c) => c[0]), profiles: ['local-dev'], themes: ['light', 'dark', 'print'], locales: ['en'] }, members: lib.map((a) => a.id) }, 'DSB');
    if (!p.ok) fail('P. Castellano proposes the B82 design baseline', p);
    else {
      const b = p.body.baseline;
      ok(`P. Castellano PROPOSED the B82 design baseline ${short(b.baseline_id)} v${b.version}: ${lib.length} members, design system @eye/tokens@${tokensVersion}`);
      const d = await P(dsa, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the B82 components read against Volume 9 and the act\'s walks; every member owned (SYNTHETIC)' }, 'DSB', b.baseline_id);
      if (!d.ok) fail('L. Haddad attests the B82 design baseline', d); else ok(`L. Haddad ATTESTED and SIGNED the B82 design baseline v${b.version} (${d.body.baseline.state})`);
    }
    DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  } else if (DBL) note(`the B82 design baseline ${short(DBL.id)} v${DBL.version} stands — an earlier run (${DBL.state})`);
  if (DBL?.state === 'attested' && EVAL) {
    const files = ['scripts/phase6/act-b82.mjs', 'e2e/phase6-b82.demo.spec.ts', 'e2e/phase6-b82-viz.demo.spec.ts'].filter((f) => existsSync(join(SELF_ROOT, f)));
    const fileEv = files.map((f) => ({ kind: 'journey_harness', ref: `${f} (the B82 act and walks — the journey harness of the chapter)`, digest: sha256(readFileSync(join(SELF_ROOT, f))),
      capturedAt: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
    const ev = [{ kind: 'design_evaluation', ref: `the chart-grammar lint evaluation ${EVAL.id} (${EVAL.verdict}, dg-lint-4)`, digest: EVAL.digest, capturedAt: new Date(EVAL.evaluated_at).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...fileEv];
    const lines = [];
    for (const [chapter, what] of CHAPTERS) {
      let A = await q1(`select acceptance_id::text id, version, state, digest from governance.design_acceptances where tenant_id = $1 and domain_id = $2 and tuple ->> 'journey' = $3 and tuple ->> 'capability' = 'F-P7-E-07' order by version desc limit 1`, [T, D, chapter]);
      if (A?.state === 'accepted') { lines.push(`${chapter} stands`); continue; }
      if (A === null) {
        const p = await DM(steward, `${DGD}/acceptances/propose`, 'governance.design.acceptance.propose', { baselineId: DBL.id, components: lib.map((a) => a.id),
          tuple: { capability: 'F-P7-E-07', journey: chapter, persona: `the corridor's people — ${what} (SYNTHETIC)`, role: 'decision_owner', deployment_profile: 'local-dev', theme: 'NORDWERK Corporate v2', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' },
          evidence: ev, obligations: ['design', 'assurance', 'customer'], findings: [{ note: 'the signed scope-specific record of the chapter (UX-xx-006) is NOT this record: it is the shared non-demonstration recording path (B111), then H3' }],
          conditions: [{ condition: 'local-dev profile only; testing with human assistive-technology users is B108\'s; real acceptance is H3' }] }, 'DAC');
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
    const recs = await q(`select tuple ->> 'journey' j, state, claim from governance.design_acceptances a where tenant_id = $1 and domain_id = $2 and tuple ->> 'capability' = 'F-P7-E-07' and tuple ->> 'journey' = any($3)
        and version = (select max(version) from governance.design_acceptances x where x.acceptance_id = a.acceptance_id)`, [T, D, CHAPTERS.map((c) => c[0])]);
    (recs.length === CHAPTERS.length && recs.every((r) => r.state === 'accepted' && r.claim === 'demonstration') ? ok : bad)(`the design acceptance DEMONSTRATION records per B82 chapter (ch6, ch26, ch27, ch57 — F-P7-E-07), each attested by L. Haddad (design), H. Achterberg (assurance) and W. Zielińska (customer): ${lines.join(', ')} — ${recs.length} records, claim ${[...new Set(recs.map((r) => r.claim))].join('/')}; the signed scope-specific records are B111 → H3`);
  } else bad('no attested B82 baseline or chart-grammar evaluation — the acceptance demonstration records were not proposed');
}

/* ── B82-7 THE STATE AND THE LIMITS ──────────────────────────────────────────────────────────── */
console.log('\nB82-7 THE STATE, the env lines for the walks, THE LIMITS');
{
  const n = await q1(`select (select count(*) from graph.geo_references where tenant_id = $1)::int geo_reference_versions, (select count(*) from graph.trust_verifications where tenant_id = $1)::int trust_verifications,
     (select count(*) from graph.trust_attestations where tenant_id = $1)::int trust_attestations, (select count(*) from executive.attention_items where tenant_id = $1 and signal_class = 'trust_investigation')::int trust_investigations,
     (select count(*) from observation.rights_terms where tenant_id = $1)::int rights_terms_versions`, [T]);
  note(`as recorded: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const claims = await q1(`select (select count(*) from governance.design_acceptances where claim <> 'demonstration')::int d`);
  (claims.d === 0 ? ok : bad)(`no design acceptance claims more than a DEMONSTRATION (${claims.d} beyond it)`);
  ENV_OUT.EYE_B82_TENANT = T; ENV_OUT.EYE_B82_DOMAIN = D;
  ENV_OUT.EYE_B82_OWNER = 'l.brandt'; ENV_OUT.EYE_B82_ANALYST = 'a.hoffmann'; ENV_OUT.EYE_B82_KNOWLEDGE_OWNER = 'k.mueller'; ENV_OUT.EYE_B82_STEWARD = 'f.aydin'; ENV_OUT.EYE_B82_FORECASTER = 'n.eriksen';
  ENV_OUT.EYE_B82_AUDITOR = 'e.lindqvist'; ENV_OUT.EYE_B82_DSA = 'l.haddad';
  console.log('  the env lines for the walks (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — 0121 and its harnesses (phase6-{prelude,truth,evidence,geography,trust,charts}-b82), the web unit models, the walks. (2) DEMONSTRATED OPERATION — what RAN here through the governed routes by SYNTHETIC personas: L. Brandt\'s recommendation on his B31 package recorded and read RECOMMENDED (advisory, never decided), the run it rests on INDETERMINATE (withdrawn since), the run\'s citation resolved to its evidence leaves with custody, tier, span and correction, the corrected PortWatch fragment CORRECTED and linked; his request for the cited bytes REFUSED (D9 — no new permission) and the span opened by A. Hoffmann with the digest re-verified and custody written; B50\'s UNFIT claim corrected through the governed claim review (K. Müller\'s own decision refused by her role; L. Ferreira decided), the original reading "superseded by correction" and its citation CORRECTED SINCE, L. Brandt\'s next briefing withholding the correction under the room\'s policy (declared as an omission) and his paragraph citing it refused; F. Aydın\'s geographic register typed by hand (a mistyped site retired, another CRS and an analyst refused) and the flow map\'s series named; E. Lindqvist\'s overview, VERIFIED custody and signature, UNAVAILABLE where nothing is signed, her attestation (the owner\'s refused) and her investigation routed to the run\'s owner; rights terms expired → a decision-active use REFUSED → declared again in force; the agent\'s recommendation RECOMMENDED and agent-authored; the principle declared, dg-lint-4 at zero, B82\'s components owned, a design acceptance per chapter (ch6, ch26, ch27, ch57) — every acceptance `claim = demonstration`. (3) REAL ACCEPTANCE — UX-06/26/27/57-006\'s signed packages — NEVER claimed: B111\'s shared recording path, then H3. SAID PLAINLY: the corrected claim does not read CORRECTED — its admission raised open contradictions with the other days\' readings of the same subject and predicate (the PortWatch claims carry no day in their subject), and the derivation shows INDETERMINATE first; the CORRECTED display state is shown on the corrected PortWatch fragment. The claim review is decided by an extraction manager — the knowledge owner\'s role routes the adjudication, it does not decide a claim review. NOT STAGED (harness-proven): an AGENT refused at the geographic and trust human gates (no agent session is opened here); a signature verifying FAILED under the key on file (tamper) and UNAVAILABLE for a key not on file (every demo signature is under the key on file); an integrity failure (EYE-INT-001) and an unreachable tier (EYE-DEG-001) at the cited span; the producer refused at attestation by the port (L. Brandt is refused by the policy first). The design terms RECOMMENDED / CORRECTED / INDETERMINATE are not published as contributions here.');
}

await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
