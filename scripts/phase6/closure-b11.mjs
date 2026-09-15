#!/usr/bin/env node
/**
 * The B11 CLOSURE on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name):
 * Codex's B11-F1 and B11-F2 closed by migration 0071, the corrected executor and the corrected verifier, exercised by
 * the personas through the REAL HTTP path, each scene stating the effect it produced.
 *
 *   1. OVERLAPPING ARCHIVES (B11-F1): two archive actions on the same NORDWERK internal evidence — A over P and Q,
 *      B over P — both approved while the bytes are hot, EXECUTED CONCURRENTLY. The manifest's lock orders them: one
 *      moves P (its own copy, the move recorded), the other finds P archived under the lock, verifies the archive copy
 *      and records the move as already made; one tier record; the archive path present, the hot path gone; both
 *      verify; A. Hoffmann downloads P from the archive tier; no advisory lock outlives its transaction. The FAILURE
 *      interleaving — the loser's copy adopted, then removed by the loser's rollback — is proven by the harness
 *      (apps/api/test/int/phase6-retention-b11-closure.test.ts: red on the unfixed executor, green after), whose holds
 *      exist in the test profile only; here the serialization under real concurrency on the demonstration.
 *   2. THE VERIFIER (B11-F2): a customer export of the same two records — now read from the ARCHIVE tier — verified
 *      by the corrected verifier (PACKAGE OK with the expected digest); then, on COPIES of the package whose
 *      manifest.json is replaced by `null` and by `[]`, the verifier AS SHIPPED AT 1e3e4be (taken from git into a
 *      scratch file) answers exit 0 / ok:true — the finding on this host — and the corrected verifier exit 1 /
 *      ok:false / complete:false, and with --expect-package-digest a failed authenticity check; the export is then
 *      revoked by H. Bergmann as the B11 act revoked its own.
 *   3. UN COMTRADE: the readiness register's entry for the contract — registered, approved, rights confirmed, the
 *      credential reference unbound in this process — and the exact remaining binding step.
 *
 * Idempotence: every scene creates its own new actions; scene 1 moves two manifests once (a second run picks the next
 * two hot records, or says there are none). The script is an act, not a seed. Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`; const O = `${X}/observation`;
const short = (id) => `${String(id).slice(0, 8)}…`;
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann'); const hoffmann = await who('a.hoffmann'); const dvorak = await who('m.dvorak');
const pn = (over) => as(novak, scope, { purposeId: 'retention', ...over });
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const ah = (over) => as(hoffmann, scope, { purposeId: 'observation', ...over });
const cm = (over) => as(dvorak, scope, { purposeId: 'observation', ...over });
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
// The vault roots AS THE API RESOLVES THEM (a relative root against the workspace root; an absolute EYE_VAULT_*_ROOT as it is).
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);

const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const download = (evdId) => call(`${O}/evidence/${evdId}/download`, ah({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const checksOf = (id) => q(`select check_name, passed from retention.verifications where action_id = $1 order by check_name`, [id]);
/** OPEN → RESOLVE → APPROVE, printing each; null when a step failed. */
const approved = async (label, payload, rationale) => {
  const o = await open(payload);
  if (!o.ok) { fail(`open ${label} (p.novak)`, o); return null; }
  const id = o.body.action.actionId;
  const rs = await resolve(id);
  if (!rs.ok) { fail(`resolve ${label}`, rs); return null; }
  const sc = rs.body.scope;
  const ap = await approve(id, sc.scope_digest, rationale);
  if (!ap.ok) { fail(`approve ${label} (h.bergmann)`, ap); return null; }
  ok(`${label}: P. Novák opened ${short(id)}; scope resolved (${sc.items} item(s), ${sc.execute} to execute, ${sc.held} held; digest ${String(sc.scope_digest).slice(0, 12)}…); H. Bergmann approved`);
  return { id, digest: sc.scope_digest };
};
const VERIFIER = join(ROOT, 'scripts', 'retention', 'verify-export.mjs');
const runVerifier = (script, dir, ...extra) => {
  const r = spawnSync(process.execPath, [script, dir, '--json', ...extra], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { j = null; }
  return { exit: r.status, ok: j?.ok ?? null, complete: j?.complete ?? '(no field)', failed: j?.failed ?? null, verdictLine: (spawnSync(process.execPath, [script, dir, ...extra], { encoding: 'utf8' }).stdout.trim().split('\n').at(-1) ?? '') };
};

console.log(`\n=== B11 closure on the demonstration (${env.EYE_DB_NAME ?? 'eye_demo'} at ${process.env.EYE_API ?? 'http://localhost:3401'}) — B11-F1 the manifests' locks, B11-F2 the verifier ===\n`);

/* ── 1. OVERLAPPING ARCHIVES ─────────────────────────────────────────────── */
console.log('1. OVERLAPPING ARCHIVES — two approved archive actions on the same NORDWERK evidence executed concurrently; the lock orders them; one tier record; the bytes present');
const hotTargets = async (sourceKey) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.locator, m.content_digest, m.byte_length, o.retention_profile, s.source_key
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed' and m.legal_hold = false
      and ($3::text is null or s.source_key = $3) and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and observation.manifest_tier(m.manifest_id) = 'hot'
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 2`, [T, D, sourceKey]);
let targets = await hotTargets('nordwerk-internal');
if (targets.length < 2) { note('fewer than two hot current NORDWERK internal records: the two most recent hot internal records of any source are taken'); targets = await hotTargets(null); }
let P = null; let Q = null;
if (targets.length < 2) bad('no two hot current internal evidence records to archive (an earlier run archived them)');
else {
  [P, Q] = targets;
  note(`the targets: P = evidence ${short(P.id)}@${P.version} (${P.source_key}, ${P.byte_length} bytes, manifest ${short(P.manifest_id)}), Q = evidence ${short(Q.id)}@${Q.version} (${Q.source_key}, ${Q.byte_length} bytes, manifest ${short(Q.manifest_id)}); both hot`);
  const a = await approved('archive A over P and Q', { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [P.manifest_id, Q.manifest_id] }, retentionProfile: P.retention_profile, reason: 'the records are past their hot window; kept cold' }, 'the records are kept cold; still retrievable');
  const b = await approved('archive B over P', { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [P.manifest_id] }, retentionProfile: P.retention_profile, reason: 'the same record, a second archive opened before the first executed' }, 'the same record, approved on its own scope');
  if (a !== null && b !== null) {
    const started = Date.now();
    const [ea, eb] = await Promise.all([execute(a.id), execute(b.id)]);
    const ms = Date.now() - started;
    for (const [label, r] of [['A', ea], ['B', eb]]) {
      if (r.ok) ok(`${label} executed: HTTP ${r.status} — ${r.body.execution.executed} archived, ${r.body.execution.refused} refused; hot copies removed after the commit ${r.body.execution.bytes?.removed?.length ?? 0}, failed ${r.body.execution.bytes?.failed?.length ?? 0}`);
      else fail(`${label} execute (p.novak)`, r);
    }
    note(`both executions returned after ${ms} ms, started together`);
    const rows = await q(`select e.action_id::text action_id, e.outcome, e.evidence from retention.executions e where e.action_id in ($1, $2) and e.evidence ->> 'locator' = $3 order by e.executed_at`, [a.id, b.id, P.locator]);
    for (const r of rows) note(`  P by action ${r.action_id === a.id ? 'A' : 'B'} (${short(r.action_id)}): ${r.outcome} — copy_created ${r.evidence.copy_created}, already_archived ${r.evidence.already_archived}, tier_record ${r.evidence.tier_record_id ? short(r.evidence.tier_record_id) : 'none'}, digest_verified ${r.evidence.digest_verified}`);
    const created = rows.filter((r) => r.evidence.copy_created === true).length; const found = rows.filter((r) => r.evidence.already_archived === true).length;
    if (rows.length === 2 && created === 1 && found === 1) ok('exactly one execution made the copy and the move; the other found P archived under the lock and recorded the move as already made'); else bad(`expected one mover and one finder for P, got ${rows.length} row(s): ${created} created, ${found} found archived`);
    const ledger = await q(`select count(*)::int n, min(action_id::text) action_id from observation.blob_tier_records where manifest_id = $1`, [P.manifest_id]);
    if (ledger[0].n === 1) ok(`the tier ledger holds ONE record for P (by ${ledger[0].action_id === a.id ? 'A' : ledger[0].action_id === b.id ? 'B' : short(ledger[0].action_id)})`); else bad(`the tier ledger holds ${ledger[0].n} record(s) for P`);
    const archivePresent = existsSync(join(vaultRoot('archive'), P.locator)); const hotPresent = existsSync(join(vaultRoot('evidence'), P.locator));
    if (archivePresent && !hotPresent) ok(`the host: P's archive path PRESENT, hot path ABSENT (${join(vaultRoot('archive'), P.locator).replace(ROOT + '/', '')})`); else bad(`the host: archive ${archivePresent ? 'PRESENT' : 'ABSENT'}, hot ${hotPresent ? 'PRESENT' : 'ABSENT'}`);
    note(`Q: tier ${(await q('select observation.manifest_tier($1::uuid) t', [Q.manifest_id]))[0].t}, archive path ${existsSync(join(vaultRoot('archive'), Q.locator)) ? 'PRESENT' : 'ABSENT'}`);
    for (const [label, act] of [['A', a], ['B', b]]) {
      const vf = await verify(act.id);
      if (vf.ok && vf.body.verification.verified === true) ok(`${label} verified against the archive contract: ${(await checksOf(act.id)).filter((c) => c.passed).length}/${(await checksOf(act.id)).length} checks`); else if (vf.ok) bad(`${label} verification did not pass: ${JSON.stringify(vf.body.verification).slice(0, 200)}`); else fail(`${label} verify`, vf);
    }
    const dl = await download(P.id);
    if (dl.ok && dl.body.download?.contentDigest === P.content_digest) ok(`A. Hoffmann downloads P: HTTP ${dl.status}, ${dl.body.download.byteLength} bytes, digest the manifest's, tier ${dl.body.download.tier}, availability ${dl.body.download.availability}, integrity ${dl.body.download.integrity}`); else bad(`the download after the archives: ${dl.status} ${dl.body?.message ?? ''}`);
    const locks = (await q(`select count(*)::int n from pg_locks where locktype = 'advisory'`))[0].n;
    if (locks === 0) ok('no advisory lock outlives its transaction (pg_locks: 0 advisory locks held)'); else note(`${locks} advisory lock(s) held by other sessions at this instant`);
  }
}

/* ── 2. THE VERIFIER ────────────────────────────────────────────────────── */
console.log('\n2. THE VERIFIER — the same two records exported (read from the archive tier), verified by the corrected verifier; the shipped verifier\'s false success on a manifest that is not a package, and the corrected one\'s refusal; the export revoked');
if (P === null) bad('no export target (scene 1 found no records)');
else {
  const e = await approved('customer export of P and Q', { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [P.manifest_id, Q.manifest_id], classificationCeiling: 'internal', destination: 'export' }, retentionProfile: null, reason: 'the customer asks for its internal records as an open package' }, 'internal records only, under the ceiling; the customer\'s own tenant');
  if (e !== null) {
    const ex = await execute(e.id);
    if (!ex.ok) fail('execute export (p.novak)', ex);
    else {
      const p = ex.body.execution.package ?? null;
      if (p === null) bad('no package recorded');
      else {
        ok(`executed: ${ex.body.execution.executed} exported, ${ex.body.execution.refused} refused; package ${p.locator_prefix} — ${p.objects} object(s), ${p.bytes} bytes, package digest ${String(p.package_digest).slice(0, 16)}…`);
        const tiers = await q(`select details ->> 'tier' tier, count(*)::int n from observation.custody_events where manifest_id in ($1, $2) and event = 'custody.exported' and details ->> 'action_id' = $3 group by 1`, [P.manifest_id, Q.manifest_id, e.id]);
        note(`the bytes were read from: ${tiers.map((t) => `${t.tier ?? 'tier not recorded'} ×${t.n}`).join(', ') || 'no custody.exported rows'}`);
        const dir = join(vaultRoot('export'), p.locator_prefix);
        const good = runVerifier(VERIFIER, dir, '--expect-package-digest', p.package_digest);
        if (good.exit === 0 && good.ok === true && good.complete === true) ok(`the corrected verifier on the package: exit 0, ok true, complete true — "${good.verdictLine}"`); else bad(`the corrected verifier on the real package: exit ${good.exit}, ok ${good.ok}, complete ${good.complete} — ${good.verdictLine}`);
        // The shipped verifier (1e3e4be) from git, into a scratch file; the copies with a manifest that is not a package.
        const shipped = spawnSync('git', ['show', '1e3e4be:scripts/retention/verify-export.mjs'], { cwd: ROOT, encoding: 'utf8' });
        const scratch = mkdtempSync(join(tmpdir(), 'eye-b11-closure-'));
        const OLD = join(scratch, 'verify-export-1e3e4be.mjs');
        if (shipped.status !== 0) bad('the shipped verifier could not be read from git');
        else {
          writeFileSync(OLD, shipped.stdout);
          for (const [label, text] of [['null', 'null'], ['[]', '[]']]) {
            const copy = join(scratch, `copy-${label === 'null' ? 'null' : 'list'}`); cpSync(dir, copy, { recursive: true }); writeFileSync(join(copy, 'manifest.json'), text);
            const o1 = runVerifier(OLD, copy); const n1 = runVerifier(VERIFIER, copy);
            const o2 = runVerifier(OLD, copy, '--expect-package-digest', p.package_digest); const n2 = runVerifier(VERIFIER, copy, '--expect-package-digest', p.package_digest);
            note(`manifest.json = ${label}: SHIPPED verifier exit ${o1.exit}, ok ${o1.ok}, failed ${o1.failed} — "${o1.verdictLine}"; with the expected digest exit ${o2.exit}, ok ${o2.ok}`);
            if (o1.exit === 0 && o1.ok === true) ok(`  the finding on this host: the shipped verifier reports success for a manifest that is ${label}`); else note(`  the shipped verifier answered exit ${o1.exit} here`);
            if (n1.exit === 1 && n1.ok === false && n1.complete === false && n2.exit === 1 && n2.ok === false) ok(`  the corrected verifier: exit 1, ok false, complete false, failed ${n1.failed} — "${n1.verdictLine}"; with the expected digest exit 1 (the comparison that could not run is a failed check)`); else bad(`  the corrected verifier on ${label}: exit ${n1.exit}, ok ${n1.ok}, complete ${n1.complete}; with the digest exit ${n2.exit}`);
          }
        }
        const vf = await verify(e.id);
        if (vf.ok && vf.body.verification.verified === true) ok('the export verified by the product'); else if (vf.ok) bad(`the export's verification: ${JSON.stringify(vf.body.verification).slice(0, 200)}`); else fail('verify export', vf);
        const rv = await call(`${R}/actions/${e.id}/export/revoke`, hb({ action: 'retention.export.revoke', objectType: 'RTA', objectId: e.id, consequence: 'C2' }), { reason: 'the package was handed over; it is not to be served again' }, bergmann.token);
        if (rv.ok) ok(`H. Bergmann revoked the package; bytes removed ${rv.body.bytes?.removed}; the directory is ${existsSync(dir) ? 'PRESENT' : 'GONE'}`); else fail('revoke (h.bergmann)', rv);
      }
    }
  }
}

/* ── 3. UN COMTRADE ─────────────────────────────────────────────────────── */
console.log('\n3. UN COMTRADE — the contract\'s readiness in this process, and the exact remaining binding step');
{
  // The readiness read is retried a few times: on a freshly-restored rehearsal PROCESS it has answered 500 once under the load of the
  // preceding scenes (a context GUC on a pooled connection — pre-existing Phase-0/1 machinery, unrelated to this closure, never on the
  // demonstration and never on a lone probe; recorded as a follow-up in PHASE6_REPORT §25.5). A persistent failure is a note, not the act's
  // failure — the binding step it prints is known from the contract row regardless.
  let rd = null;
  for (let i = 0; i < 5; i += 1) {
    rd = await call(`${O}/sources/readiness`, cm({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
    if (rd.ok) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const row = (rd.body?.sources ?? []).find((s) => s.source_key === 'un-comtrade') ?? null;
  const rowFromDb = row === null ? (await q(`select s.source_key, s.contract_version, s.rights_state, s.lifecycle_state from observation.source_contracts_current s where s.source_key = 'un-comtrade' order by s.contract_version desc limit 1`))[0] ?? null : null;
  if (!rd.ok && rowFromDb !== null) note(`the readiness read answered ${rd.status} on this freshly-restored process (a context GUC under load, unrelated to B11; PHASE6_REPORT §25.5); the contract row: un-comtrade v${rowFromDb.contract_version}, ${rowFromDb.lifecycle_state}, rights ${rowFromDb.rights_state}`);
  else if (!rd.ok) fail('readiness (m.dvorak)', rd);
  if (rd.ok && row === null) bad('un-comtrade is not in the readiness register');
  else {
    const r = row === null ? {} : (row.readiness ?? row);
    if (row !== null) note(`un-comtrade v${row.contract_version ?? '?'}: verdict ${r.verdict ?? '?'} (${r.reason ?? '?'}); rights ${row.rights_state ?? '?'}; credential: ${r.credential ?? '(no credential line)'}`);
    const bound = typeof process.env.EYE_SRC_COMTRADE_KEY === 'string' && process.env.EYE_SRC_COMTRADE_KEY.length > 0;
    if (!bound) ok('this process binds no EYE_SRC_COMTRADE_KEY (the key is not on this host); the remaining step is the owner\'s: add one line EYE_SRC_COMTRADE_KEY=<the key> to .eye-local/env (mode 0600), restart with scripts/ops/demo-restart.sh, then run node scripts/integrations/activate-comtrade.mjs — the act stops before activation until then');
    else note('this process binds EYE_SRC_COMTRADE_KEY (its value is never printed): run node scripts/integrations/activate-comtrade.mjs for the activation act');
  }
}

await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'the closure act completed with every scene producing its effect' : `${failureCount()} scene step(s) did not produce the effect claimed`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
