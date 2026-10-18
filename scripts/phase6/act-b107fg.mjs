#!/usr/bin/env node
/**
 * CP-6 B107-F / B107-G on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): the two bounded
 * corrections exercised by named personas through the REAL HTTP routes — migrations 0116 (acceptance decided at the request) and 0117 (the
 * expansion restriction read from what is in force now, at the proposal and at the activation) — and the release-candidate DRIFT their
 * migrations cause, handled through the existing governed process. This act never reuses 0115's demonstration evidence as proof of 0116 or
 * 0117: every record it relies on is made here, at the deployed head.
 *
 * NOTHING IS PLANTED: no governance row is written by SQL and no clock is moved — the short validities are REAL, waited for on the DATABASE
 * clock. The live demonstration's attention agent ticks every minute, so the window BEFORE reconciliation is short: the act reads the accepted
 * scope at the first instant after the expiry and SAYS whether the tick had already reconciled (`reconciled`) — the gate and the read are
 * correct either way; the window itself is proven by the harness (phase6-acceptance-b107 "B107-F", "B107-G"). RERUN-SAFE: each scene reads what
 * an earlier run left first and says "stands".
 *
 *   FG-0  THE STATE — 0116 and 0117 applied; the build identity; the cast (B107's SYNTHETIC vendor personas, NORDWERK's people).
 *   FG-1  THE RELEASE-CANDIDATE DRIFT (§CM): the monitor run; the candidate bound to 0115 reads drifted (visible, not hidden); test runs at the
 *         deployed head ingested; a NEW candidate assembled at the deployed head, checked, previewed and ATTESTED by independent assurance —
 *         a local conformance record (B65 substituted), never a release.
 *   FG-2  REQUEST-TIME ACCEPTANCE (0116): CAP-FW-04 accepted for the corridor over current evidence, one item covering the `executive` role
 *         valid for minutes; at its expiry the accepted-scope read says CONSTRAINED with the executive role removed — and whether the tick had
 *         reconciled yet.
 *   FG-3  EXPANSION AFTER THE EXPIRY (0117, ordering a): a WIDER version (+ board_member) REFUSED (held); the same scope re-accepted over
 *         renewed (again short-lived) evidence → accepted.
 *   FG-4  EXPANSION PENDING ACROSS THE EXPIRY (0117, ordering b): a wider version proposed while the record is current and attested by every
 *         obligation but the last; the record's evidence expires; the FINAL attestation REFUSED (held) — nothing activated; the same scope
 *         re-accepted over long-lived evidence → accepted.
 *   FG-5  THE STATE and THE LIMITS.
 *
 * THREE CLAIMS: construction (0116, 0117 and their harness cases); demonstrated operation (this act — every persona SYNTHETIC, every record
 * claim = demonstration); real acceptance (R2/H3) — never claimed, and the present implementation cannot record it (the non-demonstration
 * recording path is construction at B111).
 */
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, ok, bad, note, failureCount } from '../phase4/governed.mjs';

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
const REPORTS = process.env.EYE_B107FG_REPORTS ?? join(SELF_ROOT, 'evidence', 'cp6');
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const { tenantId: T, domainId: D } = await demoScope(admin);
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const MINUTES = Number(process.env.EYE_B107FG_MINUTES ?? 3);
const short = (id) => (id == null ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const dg = (x) => (x ? `${String(x).slice(0, 12)}…` : '—');
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const line = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 380)}`;
const fail = (label, r) => bad(`${label}: ${line(r)}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${line(r)}`); return true; }
  bad(`${label}: expected a ${status} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : line(r)}`); return false;
};
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (t, p = []) => (await su.query(t, p)).rows;   // READ-ONLY checks (nothing is written by SQL)
const q1 = async (t, p = []) => (await q(t, p))[0] ?? null;
const dbNow = async () => new Date((await q1('select clock_timestamp() t')).t);
const waitFor = async (label, until) => {
  const ms = new Date(until).getTime() - (await dbNow()).getTime() + 1_500;
  if (ms > 0) { note(`WAITING ${Math.ceil(ms / 1000)} s on the database clock for ${label} (until ${iso(until)}) — a real short validity, nothing moved`); await sleep(ms); }
};
const plat = (s, action, objectType = 'GOV', objectId = null) => ({ scope: 'PLATFORM', tenantId: null, domainId: null, principalId: `principal:${s.principalId}`, purposeId: 'governance',
  consequence: 'C2', action, objectType, objectId, sideEffect: /\.read$/.test(action) ? 'none' : 'reversible', trace: 'phase6-b107fg' });
const dom = (s, action, objectType = 'GOV', objectId = null) => ({ ...plat(s, action, objectType, objectId), scope: 'DOMAIN', tenantId: T, domainId: D });
const RG = '/v1/governance/registries'; const CM = '/v1/governance/conformance'; const AR = `/v1/tenants/${T}/domains/${D}/governance/acceptance`;
const wr = (s, path, action, payload = {}, ot = 'GOV', oid = null) => call(path, plat(s, action, ot, oid), payload, s.token);
const dwr = (s, path, action, payload = {}, ot = 'GOV', oid = null) => call(path, dom(s, action, ot, oid), payload, s.token);
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l, name) => { const s = await who(l); s.name = name; PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n) Object.assign(s, n); } };

console.log(`THE B107-F/G ACT on ${DB_NAME}${DB_NAME !== 'eye_demo' ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);

/* ── FG-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nFG-0 THE STATE — 0116 and 0117 applied, the build identity, the cast');
for (const f of ['0116_b107f_acceptance_at_request.sql', '0117_b107g_expansion_at_activation.sql']) {
  ((await q1('select count(*)::int n from public.schema_migrations where filename = $1', [f])).n === 1 ? ok : bad)(`migration applied: ${f}`);
}
const productA = await persona('e.lindgren', 'E. Lindgren'); const productB = await persona('r.moreau', 'R. Moreau'); const assurance = await persona('h.achterberg', 'H. Achterberg');
const steward = await persona('p.castellano', 'P. Castellano'); const ops = await persona('k.mensah', 'K. Mensah'); const sponsor = await persona('w.zielinska', 'W. Zielińska');
const richter = await persona('t.richter', 'T. Richter');
const BUILD = {};
{
  const c = await wr(admin, `${CM}/read`, 'governance.read');
  if (!c.ok) fail('the build identity', c);
  else {
    const b = c.body.build ?? c.body.identity ?? {}; BUILD.head = b.head_sha; BUILD.migration = b.migration_head;
    ((/^[0-9a-f]{40}$/.test(String(b.head_sha)) && b.head_source === 'env') ? ok : bad)(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), migration head ${b.migration_head ?? '—'}, policy bundle ${b.policy_bundle?.version}`);
  }
}

/* ── FG-1 THE RELEASE-CANDIDATE DRIFT ───────────────────────────────────────────────── */
console.log('\nFG-1 THE RELEASE-CANDIDATE DRIFT (§CM) — the candidate bound to 0115 reads drifted; a new candidate at the deployed head, checked and attested (not a release)');
{
  const m = await wr(steward, `${CM}/monitor/run`, 'governance.conformance.monitor', {}, 'RCN');
  if (!m.ok) fail('P. Castellano runs the conformance monitor', m);
  else note(`the monitor: ${JSON.stringify(m.body.monitor ?? m.body).slice(0, 300)}`);
  for (const c of await q(`select candidate_id::text id, version, state, label, head_sha, migration_head from governance.cm_release_candidates c where version = (select max(version) from governance.cm_release_candidates x where x.candidate_id = c.candidate_id) order by label`)) {
    const drift = await q(`select reason_kind, reason from governance.holds where subject_artifact = $1 and lifted_at is null`, [c.id]);
    note(`candidate ${short(c.id)} v${c.version} "${String(c.label).slice(0, 60)}…": ${c.state}, head ${dg(c.head_sha)}, migration head ${c.migration_head}${drift.length ? ` — open holds: ${drift.map((h) => `${h.reason_kind}: ${String(h.reason).slice(0, 120)}`).join('; ')}` : ''}`);
  }
}
const RC_LABEL = 'NORDWERK corridor release candidate 2026-10 r2 — at the B107-F/G head (SYNTHETIC — a local release-candidate record, B65 substituted: NOT a release)';
const ingest = async (file, name) => {
  const raw = readFileSync(join(REPORTS, file), 'utf8');
  const r = await wr(steward, `${RG}/verification/ingest`, 'governance.verification.ingest', { format: 'vitest', name, report: raw, claim: 'construction', validDays: 30 }, 'VER');
  if (!r.ok) { fail(`P. Castellano ingests ${file}`, r); return null; }
  const rec = r.body.verification.record ?? {};
  const art = await q1(`select artifact_id::text id, digest from governance.artifacts where kind = 'evidence' and external_key = $1 and superseded_at is null`, [`verification:${rec.source_digest}`]);
  const row = await q1(`select valid_until from governance.rg_verification_records where record_id = $1`, [rec.record_id]);
  (rec.result === 'passed' ? (r.body.verification.duplicate ? note : ok) : bad)(`${r.body.verification.duplicate ? `${file} stands — an earlier run` : `P. Castellano INGESTED ${file}`} (${rec.totals?.passed}/${rec.totals?.cases} passed at head ${dg(rec.identity?.build?.head_sha)})`);
  return { artifactId: art?.id, digest: art?.digest, capturedAt: new Date(JSON.parse(raw).startTime).toISOString(), validUntil: row?.valid_until };
};
const CONTRACT = await ingest('b107fg-contract.vitest.json', `The port and envelope contract tests at head ${String(BUILD.head).slice(0, 12)}`);
const TRUST = await ingest('b107fg-trust.vitest.json', `The trust tests — the PDP and the scope rules at head ${String(BUILD.head).slice(0, 12)}`);
const HUMAN = await ingest('b107fg-human-authority.vitest.json', `The human-authority tests — the governance approver rules and the gates at head ${String(BUILD.head).slice(0, 12)}`);
{
  let rc = await q1(`select candidate_id::text id, max(version)::int v from governance.cm_release_candidates where label = $1 group by 1`, [RC_LABEL]);
  const item = (family, rep, what) => ({ family, kind: 'artifact', ref: what, artifact_id: rep.artifactId, digest: rep.digest, bound_head_sha: BUILD.head, captured_at: rep.capturedAt, valid_until: new Date(rep.validUntil).toISOString() });
  if (!rc && CONTRACT && TRUST && HUMAN) {
    const today = new Date().toISOString().slice(0, 10);
    const r = await wr(steward, `${CM}/candidates/assemble`, 'governance.conformance.candidate.assemble', { label: RC_LABEL, expectedVersion: 0, periodFrom: today, periodTo: today,
      scope: { kind: 'tenants', tenants: [T], domains: [D] }, builders: [ops.principalId],
      evidence: [item('contract', CONTRACT, 'the port and envelope contract tests (verification record)'), item('trust', TRUST, 'the PDP and scope tests (verification record)'),
        item('human_authority', HUMAN, 'the governance approver and gate tests (verification record)')] }, 'RCN');
    if (!r.ok) fail('P. Castellano assembles the new candidate', r);
    else { rc = { id: r.body.candidate.candidate_id, v: r.body.candidate.version }; ok(`P. Castellano ASSEMBLED ${short(rc.id)} v${rc.v} at head ${dg(r.body.candidate.head_sha)}, migration head ${r.body.candidate.migration_head}`); }
  } else if (rc) note(`the new candidate ${short(rc.id)} v${rc.v} stands — an earlier run`);
  if (rc) {
    let c = await q1(`select state from governance.cm_release_candidates where candidate_id = $1 and version = $2`, [rc.id, rc.v]);
    if (c.state === 'assembled') {
      const ch = await wr(steward, `${CM}/candidates/${rc.id}/check`, 'governance.conformance.candidate.check', { version: rc.v }, 'RCN', rc.id);
      if (!ch.ok) fail('P. Castellano checks the new candidate', ch); else (ch.body.check?.outcome === 'conformant' ? ok : bad)(`the CHECK: ${String(ch.body.check?.outcome).toUpperCase()}`);
    }
    c = await q1(`select state from governance.cm_release_candidates where candidate_id = $1 and version = $2`, [rc.id, rc.v]);
    if (c.state !== 'attested') {
      const pv = await call(`${CM}/candidates/${rc.id}/preview`, plat(assurance, 'governance.read', 'RCN', rc.id), {}, assurance.token);
      if (!pv.ok) fail('H. Achterberg previews', pv);
      else {
        expectRefused('P. Castellano (the assembler) attests the candidate', await wr(steward, `${CM}/candidates/${rc.id}/attest`, 'governance.conformance.candidate.attest', { version: rc.v, digest: pv.body.digest, reason: 'the proposer attesting (refused)' }, 'RCN', rc.id), 403);
        const a = await wr(assurance, `${CM}/candidates/${rc.id}/attest`, 'governance.conformance.candidate.attest', { version: rc.v, digest: pv.body.digest,
          reason: 'the three required families read true at the deployed head after 0116 and 0117 (SYNTHETIC)' }, 'RCN', rc.id);
        if (!a.ok) fail('H. Achterberg attests the new candidate', a); else ok(`H. Achterberg (independent assurance) ATTESTED the new candidate v${rc.v}: ${a.body.attestation.state} — a LOCAL CONFORMANCE RECORD, nothing released`);
      }
    } else note(`the new candidate is ATTESTED: stands`);
  }
}

/* ── FG-2 … FG-4 THE ACCEPTANCE SCENES ──────────────────────────────────────────────── */
await renewAll();
const CAP = 'CAP-FW-04';
const TITLE = 'Risk intelligence workspace (CAP-FW-04) for the corridor domain — the B107-F/G demonstration (SYNTHETIC)';
const SCOPE = (roles = ['domain_analyst', 'executive']) => ({ capability_version: 'CAP-FW-04 as imported from the V8 register (2026-10)', journeys: ['JRN-11', 'JRN-24'], roles, deployment_profile: 'local-dev',
  entitlement: 'supply_chain_intelligence', data_versions: { 'risk.exposures': 'corridor exposures (B32)' }, model_versions: { 'risk-aggregation': 'risk-aggregation@1' },
  configuration_digest: sha256('the corridor domain configuration as read 2026-10-17'), consequence_class: 'C2',
  period: { from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10) } });
const WIDE = () => SCOPE(['domain_analyst', 'executive', 'board_member']);
const JOURNEY_FILE = 'evidence/phase6-browser/b107-04-acceptance-corridor.png';
const JOURNEY_BYTES = readFileSync(join(SELF_ROOT, JOURNEY_FILE));
const JOURNEY_AT = new Date(execFileSync('git', ['-C', SELF_ROOT, 'log', '-1', '--format=%cI', '--', JOURNEY_FILE], { encoding: 'utf8' }).trim()).toISOString();
const PEOPLE = { product: productB, independent_assurance: assurance, customer: sponsor };
const recordOf = async () => q1(`select record_id::text id, max(version)::int v from governance.acceptance_records where tenant_id = $1 and domain_id = $2 and subject_key = $3 and title = $4 group by 1`, [T, D, CAP, TITLE]);
const versions = async (id) => q(`select version, state, effective_scope -> 'roles' roles, digest from governance.acceptance_records where record_id = $1 order by version`, [id]);
const scopeRead = async () => { const r = await dwr(richter, `${AR}/scope/read`, 'governance.acceptance.read', { subjectKey: CAP }, 'ACR'); if (!r.ok) { fail('T. Richter reads the accepted scope', r); return null; } return r.body.scope; };
const journey = async (minutes, renews, label) => {
  const until = new Date((await dbNow()).getTime() + minutes * 60_000).toISOString();
  const r = await dwr(steward, `${AR}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'journey_evidence', title: label, subjectKind: 'external', pointer: JOURNEY_FILE,
    digest: sha256(JOURNEY_BYTES), covers: { roles: ['executive'] }, outcome: 'passed', capturedAt: JOURNEY_AT, validUntil: until, ...(renews ? { renews } : {}) }, 'AEV');
  if (!r.ok) { fail(`P. Castellano records "${label}"`, r); return null; }
  ok(`P. Castellano RECORDED the executive-journey evidence ${short(r.body.evidence.evidence_id)}${renews ? ` (renews ${short(renews)})` : ''} — valid until ${iso(until)} (${minutes} min on the database clock)`);
  return { id: r.body.evidence.evidence_id, until };
};
const propose = async (s, payload) => dwr(s, `${AR}/records/propose`, 'governance.acceptance.propose', { kind: 'capability', title: TITLE, subjectKey: CAP, obligations: [], ...payload }, 'ACR');
const verifyAndAttest = async (id, v, digest, { allButLast = false } = {}) => {
  const ver = await q1(`select count(*)::int n from governance.acceptance_verifications where record_id = $1 and version = $2`, [id, v]);
  if (ver.n === 0) {
    const r = await dwr(sponsor, `${AR}/records/${id}/verify`, 'governance.acceptance.verify', { version: v, digest, findings: 'the scope and evidence read against the corridor\'s operation (SYNTHETIC)' }, 'ACR', id);
    if (!r.ok) { fail('W. Zielińska verifies', r); return null; }
  }
  const order = ['customer', 'product', 'independent_assurance'];
  const todo = allButLast ? order.slice(0, -1) : order;
  let last = null;
  for (const o of todo) {
    if ((await q1(`select count(*)::int n from governance.acceptance_attestations where record_id = $1 and version = $2 and obligation = $3`, [id, v, o])).n > 0) continue;
    const r = await dwr(PEOPLE[o], `${AR}/records/${id}/attest`, 'governance.acceptance.attest', { version: v, obligation: o, decision: 'attest', digest, reason: `the ${o.replace('_', ' ')} obligation read against the exact scope (SYNTHETIC)` }, 'ACR', id);
    if (!r.ok) { fail(`${PEOPLE[o].name} attests the ${o} obligation of v${v}`, r); return null; }
    last = r.body.attestation;
  }
  return last ?? { state: (await q1(`select state from governance.acceptance_records where record_id = $1 and version = $2`, [id, v])).state };
};

let TEST = await q1(`select evidence_id::text id from governance.acceptance_evidence where tenant_id = $1 and domain_id = $2 and kind = 'test_report' and subject_id = $3 limit 1`, [T, D, HUMAN?.artifactId]);
if (!TEST && HUMAN) {
  const r = await dwr(steward, `${AR}/evidence/record`, 'governance.acceptance.evidence.record', { kind: 'test_report', title: 'The human-authority tests at the deployed head (verification record)', subjectKind: 'governance.artifact',
    subjectId: HUMAN.artifactId, covers: {}, outcome: 'passed', capturedAt: HUMAN.capturedAt, validUntil: new Date(HUMAN.validUntil).toISOString() }, 'AEV');
  if (r.ok) TEST = { id: r.body.evidence.evidence_id }; else fail('P. Castellano records the test report', r);
}
let REC = await recordOf();
const done = REC ? (await versions(REC.id)).some((x) => x.version >= 4 && x.state === 'accepted') : false;
if (done) {
  note(`the CAP-FW-04 demonstration record ${short(REC.id)} stands — an earlier run: ${(await versions(REC.id)).map((x) => `v${x.version} ${x.state}`).join(', ')}`);
} else if (TEST) {
  console.log(`\nFG-2 REQUEST-TIME ACCEPTANCE (0116) — ${CAP} accepted for the corridor over current evidence; the executive item valid ${MINUTES} min; the read at its expiry`);
  if (REC) { bad(`a partial CAP-FW-04 demonstration record ${short(REC.id)} exists (${(await versions(REC.id)).map((x) => `v${x.version} ${x.state}`).join(', ')}) — resolve it before rerunning`); process.exit(1); }
  const s1 = await journey(MINUTES, null, 'The corridor\'s executive journey run (SYNTHETIC — short-lived, the B107-F/G demonstration)');
  const p1 = await propose(productA, { scope: SCOPE(), evidence: [TEST.id, s1.id] });
  if (!p1.ok) { fail('E. Lindgren proposes', p1); process.exit(1); }
  REC = { id: p1.body.record.record_id };
  const a1 = await verifyAndAttest(REC.id, 1, p1.body.record.digest);
  (a1?.state === 'accepted' ? ok : bad)(`v1 ACCEPTED for roles domain_analyst + executive (verified by W. Zielińska; attested by R. Moreau, H. Achterberg, W. Zielińska)`);
  const sc0 = await scopeRead();
  if (sc0) (sc0.state === 'accepted' && sc0.reconciled === true ? ok : bad)(`the accepted scope before the expiry: ${sc0.state}, roles ${(sc0.effective_scope?.roles ?? []).join(', ')}, reconciled ${sc0.reconciled}`);
  await waitFor('the executive item\'s validity', s1.until);
  const stored = (await q1(`select state from governance.acceptance_records where record_id = $1 and version = 1`, [REC.id])).state;
  const sc1 = await scopeRead();
  if (sc1) {
    const roles = sc1.effective_scope?.roles ?? [];
    (sc1.state === 'constrained' && !roles.includes('executive') ? ok : bad)(`at the expiry the accepted scope reads ${sc1.state.toUpperCase()} — roles ${roles.join(', ') || 'none'} (executive REMOVED), current findings ${(sc1.current_findings ?? []).map((f) => f.kind).join(', ')}; stored state ${stored}; reconciled ${sc1.reconciled}`);
    note(sc1.reconciled === false ? 'OBSERVED BEFORE RECONCILIATION: the record is still stored accepted — the read (and the gate) answer from the current findings (0116)'
      : 'the live attention tick had already reconciled the record when it was read — the request-time window is proven by the harness (B107-F), not by this run');
  }

  console.log('\nFG-3 EXPANSION AFTER THE EXPIRY (0117, ordering a) — a wider version refused; the same scope re-accepted');
  expectRefused('E. Lindgren proposes a WIDER version (+ board_member) over fresh evidence while v1 no longer meets its evidence', await propose(productA, { recordId: REC.id, expectedVersion: 1, scope: WIDE(),
    evidence: [TEST.id, (await journey(60 * 24 * 30, s1.id, 'The corridor\'s executive journey run — renewed for 30 days'))?.id] }), 409, /\(held\).*expands beyond its previously accepted scope \(role board_member\)/);
  const s2 = await journey(MINUTES, null, 'The corridor\'s executive journey run (SYNTHETIC — short-lived again, for ordering b)');
  const p2 = await propose(productA, { recordId: REC.id, expectedVersion: 1, scope: SCOPE(), evidence: [TEST.id, s2.id] });
  if (!p2.ok) { fail('E. Lindgren proposes the same-scope re-acceptance', p2); process.exit(1); }
  const a2 = await verifyAndAttest(REC.id, 2, p2.body.record.digest);
  (a2?.state === 'accepted' ? ok : bad)(`the SAME scope RE-ACCEPTED as v2 over renewed evidence — ${(await versions(REC.id)).map((x) => `v${x.version} ${x.state}`).join(', ')}`);

  console.log('\nFG-4 EXPANSION PENDING ACROSS THE EXPIRY (0117, ordering b) — the final attestation refused; nothing activated; the same scope re-accepted');
  const long = await journey(60 * 24 * 30, null, 'The corridor\'s executive and board journey run (SYNTHETIC — 30 days)');
  const p3 = await propose(productA, { recordId: REC.id, expectedVersion: 2, scope: WIDE(), evidence: [TEST.id, long.id] });
  if (!p3.ok) { fail('E. Lindgren proposes the wider v3 while v2 is current', p3); process.exit(1); }
  ok(`E. Lindgren PROPOSED the wider v3 (+ board_member) while v2 is current — a legitimate proposal`);
  await verifyAndAttest(REC.id, 3, p3.body.record.digest, { allButLast: true });
  ok('v3 verified and attested by every obligation but the last (independent assurance)');
  await waitFor('v2\'s executive item', s2.until);
  const before = (await q1(`select count(*)::int n from governance.acceptance_attestations where record_id = $1 and version = 3`, [REC.id])).n;
  expectRefused('H. Achterberg gives the FINAL attestation of the wider v3 after v2\'s evidence expired', await dwr(assurance, `${AR}/records/${REC.id}/attest`, 'governance.acceptance.attest',
    { version: 3, obligation: 'independent_assurance', decision: 'attest', digest: p3.body.record.digest, reason: 'the final obligation (refused — the restriction applied before activation)' }, 'ACR', REC.id), 409, /\(held\).*version 3 expands beyond the scope in force/);
  const after = (await q1(`select count(*)::int n from governance.acceptance_attestations where record_id = $1 and version = 3`, [REC.id])).n;
  const vs = await versions(REC.id);
  (after === before && vs.find((x) => x.version === 3)?.state === 'proposed' && vs.find((x) => x.version === 2)?.state !== 'superseded' ? ok : bad)(`nothing activated: the attestations of v3 unchanged (${after}), ${vs.map((x) => `v${x.version} ${x.state}`).join(', ')}`);
  const renewed = await journey(60 * 24 * 30, s2.id, 'The corridor\'s executive journey run — renewed for 30 days');
  const p4 = await propose(productA, { recordId: REC.id, expectedVersion: 3, scope: SCOPE(), evidence: [TEST.id, renewed.id] });
  if (!p4.ok) { fail('E. Lindgren proposes the same-scope v4', p4); process.exit(1); }
  const a4 = await verifyAndAttest(REC.id, 4, p4.body.record.digest);
  (a4?.state === 'accepted' ? ok : bad)(`the SAME scope RE-ACCEPTED as v4 (the pending wider v3 superseded) — ${(await versions(REC.id)).map((x) => `v${x.version} ${x.state}`).join(', ')}`);
}

/* ── FG-5 THE STATE and THE LIMITS ──────────────────────────────────────────────────── */
console.log('\nFG-5 THE STATE and THE LIMITS');
{
  const sc = await scopeRead();
  if (sc) (sc.state === 'accepted' ? ok : bad)(`${CAP} in the corridor: ${sc.state}, roles ${(sc.effective_scope?.roles ?? []).join(', ')}, reconciled ${sc.reconciled}, claim ${sc.record?.claim}`);
  note('LIMITS — THREE CLAIMS KEPT APART. (1) CONSTRUCTION: 0116 and 0117 with their harness cases (phase6-acceptance-b107 "B107-F", "B107-G"). (2) DEMONSTRATED OPERATION: this act — B107\'s SYNTHETIC vendor personas and NORDWERK\'s people through the governed routes; every record claim = demonstration; the new release candidate is a local conformance record (B65 substituted), never a release. (3) REAL ACCEPTANCE — never claimed; the present implementation cannot record it (the non-demonstration recording path is construction at B111), then R2/H3. NOT SHOWN HERE: the gate\'s handler reachability (the demonstration marks no capability enforce_acceptance; harness-proven).');
}
await su.end();
const n = failureCount();
console.log(n === 0 ? '\nALL SCENES HELD' : `\n${n} FAILURE(S)`);
process.exit(n === 0 ? 0 : 1);
