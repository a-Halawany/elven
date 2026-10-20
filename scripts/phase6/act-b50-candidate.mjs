#!/usr/bin/env node
/**
 * CP-6 B50 — THE RELEASE-CANDIDATE DRIFT after 0120, handled through the existing governed process (§RG, §CM): the conformance steward re-imports
 * the repository's registers read-only (the tracker changed with B50's bookkeeping) and registers the regenerated component manifest (B50's
 * provenance, impact, closure and timeline controllers); test runs at the deployed head are ingested; a NEW candidate is assembled at that head, checked, ATTESTED by independent
 * assurance (never its assembler); every SUPERSEDED live candidate is WITHDRAWN with its stated reason; the monitor runs again. A local
 * conformance record (B65 substituted), never a release, never production admission.
 *
 * (Adapted from act-b81-candidate.mjs: C-0 / C-1 / C-2.) The earlier versions' lines follow:
 *
 * (Adapted from act-b107fg.mjs: the header and FG-0 / FG-1 below; its acceptance scenes are not repeated.) The original lines follow:
 *
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
import { actTargetOrExit } from '../act-target.mjs';

// B80 integration pass (2026-10-19): the target is decided FIRST — before the local env is read, before any login, session
// or request. EYE_ACT_TARGET (rehearsal | live), EYE_DB_NAME and EYE_API come from the caller; a rehearsal that names no API,
// or names the live one, is refused here and contacts nothing (scripts/act-target.mjs; the B82 probe incident).
const ACT_TARGET = actTargetOrExit(process.env, { needs: ['api'] });

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
  consequence: 'C2', action, objectType, objectId, sideEffect: /\.read$/.test(action) ? 'none' : 'reversible', trace: 'phase6-b50-candidate' });
const dom = (s, action, objectType = 'GOV', objectId = null) => ({ ...plat(s, action, objectType, objectId), scope: 'DOMAIN', tenantId: T, domainId: D });
const RG = '/v1/governance/registries'; const CM = '/v1/governance/conformance'; const AR = `/v1/tenants/${T}/domains/${D}/governance/acceptance`;
const wr = (s, path, action, payload = {}, ot = 'GOV', oid = null) => call(path, plat(s, action, ot, oid), payload, s.token);
const dwr = (s, path, action, payload = {}, ot = 'GOV', oid = null) => call(path, dom(s, action, ot, oid), payload, s.token);
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l, name) => { const s = await who(l); s.name = name; PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n) Object.assign(s, n); } };

console.log(`THE B50 CANDIDATE ACT on ${DB_NAME}${DB_NAME !== 'eye_demo' ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);

/* ── FG-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nC-0 THE STATE — 0120 applied, the build identity, the cast; the registers re-imported and the component manifest registered');
for (const f of ['0119_b81_patterns_layout_content.sql', '0120_b50_knowledge_core.sql']) {
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

/* ── C-0b THE REGISTERS AND THE MANIFEST (the steward's governed steps after a tracker change and a regenerated manifest) ── */
{
  const t0 = Date.now();
  const r = await wr(steward, `${RG}/import`, 'governance.registry.import', {}, 'GRG');
  if (!r.ok) fail('P. Castellano re-imports the repository\'s registers', r);
  else {
    const imp = r.body.imported ?? []; const changed = imp.filter((x) => x.unchanged === false);
    if (changed.length === 0) note(`P. Castellano re-ran the READ-ONLY import: all ${imp.length} sources UNCHANGED — stands — an earlier run`);
    else ok(`P. Castellano (conformance steward) RE-IMPORTED the registers READ-ONLY in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${changed.map((x) => `${x.source_path} +${x.counts?.registered ?? 0}`).join(', ')}`);
  }
  const m = await wr(steward, `${CM}/manifest/register`, 'governance.conformance.manifest.register', {}, 'CFN');
  if (!m.ok) fail('P. Castellano registers the committed component manifest', m);
  else if (m.body.manifest.unchanged) note(`the committed component manifest v${m.body.manifest.version} is registered at its digest: unchanged — stands — an earlier run`);
  else ok(`P. Castellano REGISTERED the committed component manifest v${m.body.manifest.version}: ${m.body.manifest.units} deployable units, ${m.body.manifest.components} components`);
}

/* ── FG-1 THE RELEASE-CANDIDATE DRIFT ───────────────────────────────────────────────── */
console.log('\nC-1 THE RELEASE-CANDIDATE DRIFT (§CM) — the earlier candidates read drifted; a new candidate at the deployed head, checked and attested (not a release)');
{
  const m = await wr(steward, `${CM}/monitor/run`, 'governance.conformance.monitor', {}, 'RCN');
  if (!m.ok) fail('P. Castellano runs the conformance monitor', m);
  else note(`the monitor: ${JSON.stringify(m.body.monitor ?? m.body).slice(0, 300)}`);
  for (const c of await q(`select candidate_id::text id, version, state, label, head_sha, migration_head from governance.cm_release_candidates c where version = (select max(version) from governance.cm_release_candidates x where x.candidate_id = c.candidate_id) order by label`)) {
    const drift = await q(`select reason_kind, reason from governance.holds where subject_artifact = $1 and lifted_at is null`, [c.id]);
    note(`candidate ${short(c.id)} v${c.version} "${String(c.label).slice(0, 60)}…": ${c.state}, head ${dg(c.head_sha)}, migration head ${c.migration_head}${drift.length ? ` — open holds: ${drift.map((h) => `${h.reason_kind}: ${String(h.reason).slice(0, 120)}`).join('; ')}` : ''}`);
  }
}
const RC_LABEL = 'NORDWERK corridor release candidate 2026-10 r5 — at the B50 head (SYNTHETIC — a local release-candidate record, B65 substituted: NOT a release)';
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
const CONTRACT = await ingest('b50-contract.vitest.json', `The port and envelope contract tests at head ${String(BUILD.head).slice(0, 12)}`);
const TRUST = await ingest('b50-trust.vitest.json', `The trust tests — the PDP and the scope rules at head ${String(BUILD.head).slice(0, 12)}`);
const HUMAN = await ingest('b50-human-authority.vitest.json', `The human-authority tests — the governance approver rules and the gates at head ${String(BUILD.head).slice(0, 12)}`);
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
          reason: 'the three required families read true at the deployed head after 0120 (SYNTHETIC)' }, 'RCN', rc.id);
        if (!a.ok) fail('H. Achterberg attests the new candidate', a); else ok(`H. Achterberg (independent assurance) ATTESTED the new candidate v${rc.v}: ${a.body.attestation.state} — a LOCAL CONFORMANCE RECORD, nothing released`);
      }
    } else note(`the new candidate is ATTESTED: stands`);
  }
}


/* ── C-2 THE SUPERSEDED CANDIDATES WITHDRAWN, THE MONITOR AGAIN ─────────────────────────────────────────────────────── */
console.log('\nC-2 THE SUPERSEDED CANDIDATES — withdrawn by the conformance steward with the reason; the monitor run again');
{
  const cur = await q1(`select candidate_id::text id, max(version)::int v from governance.cm_release_candidates where label = $1 group by 1`, [RC_LABEL]);
  const curState = cur ? (await q1(`select state from governance.cm_release_candidates where candidate_id = $1 and version = $2`, [cur.id, cur.v])).state : null;
  if (curState !== 'attested') bad('the new candidate is not attested — nothing is withdrawn');
  else {
    const live = await q(`select c.candidate_id::text id, c.version, c.state, c.label, c.head_sha from governance.cm_release_candidates c
      where c.version = (select max(version) from governance.cm_release_candidates x where x.candidate_id = c.candidate_id)
        and c.state in ('assembled', 'conformant', 'refused', 'held', 'attested') and c.candidate_id::text <> $1 order by c.label`, [cur.id]);
    if (live.length === 0) note('no superseded candidate is live: stands — an earlier run');
    for (const c of live) {
      const reason = `superseded by the candidate ${short(cur.id)} at the deployed head ${String(BUILD.head).slice(0, 12)} (0120); this one is bound to head ${String(c.head_sha).slice(0, 12)} (SYNTHETIC)`;
      const r = await wr(steward, `${CM}/candidates/${c.id}/withdraw`, 'governance.conformance.candidate.withdraw', { version: c.version, reason }, 'RCN', c.id);
      if (!r.ok) fail(`P. Castellano withdraws ${short(c.id)}`, r);
      else ok(`P. Castellano (conformance steward) WITHDREW ${short(c.id)} v${c.version} "${String(c.label).slice(0, 56)}…" (was ${c.state}): ${r.body.candidate?.holds_lifted ?? r.body.holds_lifted ?? 0} hold(s) lifted — ${reason}`);
    }
    const m = await wr(steward, `${CM}/monitor/run`, 'governance.conformance.monitor', {}, 'RCN');
    if (!m.ok) fail('the monitor', m); else note(`the monitor again: open ${m.body.monitor?.open ?? m.body.open}, resolved ${m.body.monitor?.resolved ?? m.body.resolved}`);
    const open = await q(`select kind, count(*)::int n from governance.cm_findings where state = 'open' group by 1 order by 1`);
    (open.length === 0 ? ok : bad)(`open conformance findings: ${open.length === 0 ? 'none — the live candidate is bound to the deployed head, manifest, migration and policy' : open.map((x) => `${x.kind} ${x.n}`).join(', ')}`);
  }
}
note('LIMITS — CONSTRUCTION: §CM (0115) and its harness; DEMONSTRATED OPERATION: this act (SYNTHETIC vendor personas; every record claim = demonstration); the candidate is a local conformance record (B65 substituted) — NEVER a release; production admission is R1.');
await su.end();
const n = failureCount();
console.log(n === 0 ? '\nALL SCENES HELD' : `\n${n} FAILURE(S)`);
process.exit(n === 0 ? 0 : 1);
