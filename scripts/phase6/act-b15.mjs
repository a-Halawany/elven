#!/usr/bin/env node
/**
 * CP-6 batch B15 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): the RELATIONSHIP
 * CLOSURE in the customer export (graph links) and the STREAMED archive (migration 0075) — exercised by the personas through the REAL
 * HTTP path, each scene stating the effect it produced on the host and in the ledgers, and where nothing happened, saying so.
 *
 *   1. THE EXPORT WITH ITS CLOSURE: P. Novák opens a customer export of the NORDWERK internal records that carry derived knowledge (the
 *      claims whose lineage names them, the graph's edges asserted on them), H. Bergmann approves, P. Novák executes and verifies —
 *      the package holds links.json beside manifest.json and the object files; the manifest's package.links names it (its sha256, size,
 *      format and counts) INSIDE the digest chain; the execution ledger's retention.export_links row; the product's verification counts
 *      the closure (links_present, links_digest_ok); links.json read: the claims by type with their lineage rows, the edges by predicate
 *      with their provenance, the entities with their identifiers, what was excluded under the ceiling and why.
 *   2. THE CUSTOMER'S CHECKS: the verifier on the package directory with the demonstration public key — the links checks (the digest and
 *      size, the counts, the consistency) among the passes; the customer's FETCH tool (scripts/retention/fetch-export.mjs) streams the
 *      archive from the STREAM route through the real HTTP path to a file, compares the streamed sha256 with the announced digest, and
 *      verifies the tar (scanned in constant memory); the JSON download still serves this small package (its ceiling 256 MiB).
 *   3. THE STREAMED DELIVERY: H. Bergmann delivers to the transfer station — package.tar streamed to the station (its sha256 the archive
 *      digest; the closure inside); the demonstration recipient verifies with the public key (the links checks) and answers; collected →
 *      ACKNOWLEDGED. STATED: a package above the in-memory ceiling is the harness's proof (phase6-retention-b15 S2: 272 MB streamed to
 *      the route, the station and the https recipient) — the demonstration's records are small and no synthetic bulk is added to it.
 *   4. THE STATE: the export read's closure counts; the deliveries.
 *
 * Every run opens a NEW export; nothing is cleaned (the station keeps the delivery's files as the record). Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`;
const short = (id) => `${String(id).slice(0, 8)}…`;
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann');
const pn = (over) => as(novak, scope, { purposeId: 'retention', ...over });
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const rel = (p) => p.replace(ROOT + '/', '');
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const field = (o, k) => (o === null || o === undefined ? null : (o[k] ?? o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null));
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);
const PUB_PEM_PATH = resolvePath(ROOT, env.EYE_DEMO_SIGNING_PUBLIC_PEM ?? '.eye-local/export-signing-demo.pub.pem');
const STATION = resolvePath(ROOT, env.EYE_DEMO_TRANSFER_STATION ?? '.eye-local/transfer-station-demo');
const STATION_KEY = 'nordwerk-transfer-station'; const STATION_RECIPIENT_NAME = 'NORDWERK GmbH — demonstration transfer station';
const VERIFIER = join(ROOT, 'scripts', 'retention', 'verify-export.mjs');
const FETCH = join(ROOT, 'scripts', 'retention', 'fetch-export.mjs');
const STATION_RECIPIENT = join(ROOT, 'scripts', 'retention', 'transfer-station-recipient.mjs');
const publicPem = existsSync(PUB_PEM_PATH);
const scratch = mkdtempSync(join(tmpdir(), 'eye-act-b15-'));

/* ── the governed acts ───────────────────────────────────────────────────── */
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const exportGet = (id) => call(`${R}/actions/${id}/export/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const download = (id) => call(`${R}/actions/${id}/export/download`, pn({ action: 'retention.export.download', objectType: 'RTA', objectId: id }), {}, novak.token);
const deliver = (id, destinationKey) => call(`${R}/actions/${id}/export/deliver`, hb({ action: 'retention.export.deliver', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const collectReceipt = (id, deliveryId) => call(`${R}/actions/${id}/export/deliveries/${deliveryId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const listDestinations = () => call(`${R}/destinations/list`, pn({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, novak.token);

/* ── the ledgers ─────────────────────────────────────────────────────────── */
const packageRow = async (id) => (await q(`select object_count::int, byte_total::int, package_digest, archive_digest, manifest_digest, signing_key_id from retention.export_packages where action_id = $1`, [id]))[0] ?? null;
const executions = (id) => q(`select port, outcome, evidence from retention.executions where action_id = $1 order by executed_at`, [id]);
const packageCheck = async (id) => (await q(`select check_name, passed, observed from retention.verifications where action_id = $1 and check_name like 'the export package%' order by verified_at desc limit 1`, [id]))[0] ?? null;
const lastEvent = async (id, event) => (await q(`select details, occurred_at from retention.action_events where action_id = $1 and event = $2 order by occurred_at desc limit 1`, [id, event]))[0] ?? null;
/** The current NORDWERK internal evidence records with confirmed rights that carry derived knowledge (claims by lineage, edges), most derived first. */
const targetsWithKnowledge = (limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier,
      (select count(distinct l.claim_object_id) from intelligence.claim_lineage l where l.evidence_object_id = o.object_id)::int claims,
      (select count(*) from graph.edges_current e where e.evidence_object_id = o.object_id)::int edges
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed' and s.source_key = 'nordwerk-internal'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by 6 desc, 7 desc, o.recorded_at desc limit $3`, [T, D, limit]);
const runVerifier = (target, ...extra) => {
  const args = [VERIFIER, ...(target.endsWith('.tar') ? ['--tar', target] : [target]), '--json', ...(publicPem ? ['--public-key', PUB_PEM_PATH] : []), ...extra];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let parsed = null; try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  return { exit: r.status, ok: parsed?.ok ?? null, checks: parsed?.checks ?? [], links: (parsed?.checks ?? []).filter((c) => String(c.name).startsWith('links:')), stderr: String(r.stderr ?? '').slice(0, 300) };
};

console.log(`THE EYE — CP-6 B15 on the demonstration: the relationship closure in the customer export and the streamed archive (migration 0075)`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} domain ${short(D)} · ${new Date().toISOString()}`);

/* ── 1. THE EXPORT WITH ITS CLOSURE ──────────────────────────────────────── */
console.log('\n1. THE EXPORT WITH ITS CLOSURE — P. Novák exports the NORDWERK internal records that carry derived knowledge; approved; executed; verified — links.json beside the manifest, named inside the digest chain');
let exp = null; let pkg = null; let links = null; let linksBlock = null; let dir = null;
{
  const targets = await targetsWithKnowledge(4);
  if (targets.length === 0) bad('no current NORDWERK internal evidence with confirmed rights to export');
  else {
    note(`the targets: ${targets.map((t) => `evidence ${short(t.id)}@${t.version} (${t.byte_length} bytes, tier ${t.tier}; ${t.claims} claim(s) by lineage, ${t.edges} edge(s))`).join(', ')}`);
    const o = await open({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: targets.map((t) => t.manifest_id), classificationCeiling: 'internal', destination: 'export', expiresAfter: '7 days' }, retentionProfile: null, reason: 'the customer asks for its internal records WITH the knowledge derived from them — the relationship closure (B15)' });
    if (!o.ok) fail('open export (p.novak)', o);
    else {
      const id = o.body.action.actionId;
      const rs = await resolve(id);
      const ap = rs.ok ? await approve(id, rs.body.scope.scope_digest, 'internal records and their derived knowledge, under the internal ceiling; the customer\'s own tenant') : null;
      if (!rs.ok || ap === null || !ap.ok) fail('resolve/approve export', rs.ok ? ap : rs);
      else {
        const ex = await execute(id);
        if (!ex.ok) fail('execute export (p.novak)', ex);
        else {
          const vf = await verify(id);
          pkg = await packageRow(id);
          if (vf.ok && vf.body.verification.verified === true && pkg !== null) { exp = { id }; ok(`export ${short(id)}: ${pkg.object_count} record(s), ${pkg.byte_total} bytes — opened, approved, executed and verified; archive digest ${String(pkg.archive_digest).slice(0, 16)}…, signed by ${pkg.signing_key_id ?? 'no key'}`); }
          else bad(`the export did not verify: ${JSON.stringify(vf.body?.verification ?? vf.body).slice(0, 300)}`);
        }
      }
    }
  }
  if (exp !== null) {
    dir = join(vaultRoot('export'), T, D, exp.id);
    const manifest = readJson(join(dir, 'manifest.json'));
    linksBlock = manifest?.package?.links ?? null;
    const linksPath = join(dir, 'links.json');
    if (linksBlock !== null && existsSync(linksPath) && sha256File(linksPath) === linksBlock.links_digest && statSync(linksPath).size === linksBlock.byte_length) ok(`the host: ${rel(dir)}/links.json (${linksBlock.byte_length} bytes, sha256 ${linksBlock.links_digest}) — named by the manifest's package.links: format ${linksBlock.format}, ${linksBlock.claims} claim(s), ${linksBlock.edges} edge(s), ${linksBlock.entities} entit${linksBlock.entities === 1 ? 'y' : 'ies'}, ${linksBlock.excluded} excluded; the package block is inside the package digest chain, so the closure is covered by the signature`);
    else bad(`links.json / package.links: ${JSON.stringify(linksBlock)} ${existsSync(linksPath) ? `(file ${statSync(linksPath).size} bytes, sha256 ${sha256File(linksPath)})` : '(file ABSENT)'}`);
    links = readJson(linksPath);
    if (links !== null) {
      const byType = {}; for (const c of links.claims ?? []) byType[c.object_type] = (byType[c.object_type] ?? 0) + 1;
      const preds = {}; for (const e of links.edges ?? []) preds[e.predicate] = (preds[e.predicate] ?? 0) + 1;
      const lineageRows = (links.claims ?? []).reduce((n, c) => n + (c.lineage?.length ?? 0), 0);
      const withIds = (links.entities ?? []).filter((e) => (e.identifiers?.length ?? 0) > 0).length;
      note(`links.json: claims by type ${JSON.stringify(byType)} (${lineageRows} lineage row(s) naming the exported records' bytes); edges by predicate ${JSON.stringify(preds)} (each with its claim, evidence digest, validity, state); entities ${(links.entities ?? []).map((e) => `${e.canonical_name} (${e.entity_type}${(e.identifiers?.length ?? 0) > 0 ? `, ${e.identifiers.map((i) => `${i.system_key} ${i.value}`).join(', ')}` : ''})`).join('; ') || 'none'} — ${withIds} with identifiers; excluded ${(links.excluded ?? []).length === 0 ? 'nothing' : links.excluded.map((x) => `${x.kind} ${x.object_id ?? x.edge_id ?? x.entity_id} (${x.gate}: ${x.reason})`).join('; ')}`);
      const consistent = (links.claims ?? []).every((c) => (c.lineage ?? []).every((l) => (links.evidence ?? []).includes(l.evidence_object_id))) && (links.edges ?? []).every((e) => (links.claims ?? []).some((c) => c.object_id === e.claim?.object_id) && (links.entities ?? []).some((n) => n.entity_id === e.subject_entity_id) && (links.entities ?? []).some((n) => n.entity_id === e.object_entity_id));
      if (consistent) ok('the closure is consistent: every claim\'s lineage names an exported record; every edge names an included claim and included entities (DP-47-002 "object and relationship closure"; DP-47-003 "graph links")'); else bad('the closure is not consistent with itself');
    } else bad('links.json does not parse');
    const ex = await executions(exp.id);
    const lrow = ex.find((e) => e.port === 'retention.export_links') ?? null;
    if (lrow !== null && lrow.outcome === 'done' && lrow.evidence?.links_digest === linksBlock?.links_digest) ok(`the execution ledger: retention.export_links done — ${JSON.stringify(lrow.evidence)}; the rows in order: ${ex.map((e) => e.port).join(' → ')}`); else bad(`the execution ledger has no retention.export_links row: ${ex.map((e) => e.port).join(', ')}`);
    const chk = await packageCheck(exp.id);
    if (chk !== null && chk.passed && chk.observed?.links_named === true && chk.observed?.links_present === true && chk.observed?.links_digest_ok === true && Number(chk.observed?.files_present) === Number(pkg.object_count) + 2) ok(`the product's verification: "${chk.check_name}" PASSED — files_present ${chk.observed.files_present} (manifest.json + links.json + ${pkg.object_count} object file(s)), links_named, links_present, links_digest_ok`);
    else bad(`the product's package check: ${JSON.stringify(chk).slice(0, 300)}`);
    const rd = await exportGet(exp.id);
    if (rd.ok && (rd.body.files ?? []).includes('links.json') && rd.body.manifest?.package?.links?.links_digest === linksBlock?.links_digest) ok(`the read route lists the package's files ${JSON.stringify(rd.body.files)} and the manifest's package.links`); else if (rd.ok) bad(`the read route: files ${JSON.stringify(rd.body.files)}`); else fail('export/get', rd);
  }
}

/* ── 2. THE CUSTOMER'S CHECKS ────────────────────────────────────────────── */
console.log('\n2. THE CUSTOMER\'S CHECKS — the verifier on the directory (the links checks); the fetch tool streams the archive from the stream route through the real HTTP path and verifies the tar; the JSON download still serves this small package');
if (exp === null || pkg === null) bad('no export to check');
else {
  const vd = runVerifier(dir);
  if (vd.exit === 0 && vd.ok === true && vd.links.length === 3 && vd.links.every((c) => c.ok === true)) ok(`the verifier on the directory: PACKAGE OK (exit 0) — the links checks: ${vd.links.map((c) => `"${c.name}" ${c.detail ?? ''}`).join(' | ')}`);
  else bad(`the verifier on the directory: exit ${vd.exit}, ok ${vd.ok}; links checks ${JSON.stringify(vd.links)} ${vd.stderr}`);
  const out = join(scratch, `${exp.id}.tar`);
  const f = spawnSync(process.execPath, [FETCH, '--api', API, '--token', novak.token, '--tenant', T, '--domain', D, '--action', exp.id, '--principal', `principal:${novak.principalId}`, '--out', out, ...(publicPem ? ['--public-key', PUB_PEM_PATH] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log(String(f.stdout ?? '').trim().split('\n').filter((l) => !/^\s+(PASS|note)/.test(l)).map((l) => `      ${l}`).join('\n'));
  if (f.status === 0 && existsSync(out) && sha256File(out) === pkg.archive_digest) ok(`the customer's fetch tool (scripts/retention/fetch-export.mjs): the STREAM route answered the raw tar through the real HTTP path — ${statSync(out).size} bytes streamed to ${out}, sha256 the recorded archive digest ${pkg.archive_digest}; the verifier on the tar: PACKAGE OK`);
  else bad(`the fetch tool: exit ${f.status} ${String(f.stderr ?? '').slice(0, 300)}`);
  const evd = await lastEvent(exp.id, 'export.downloaded');
  if (evd !== null && evd.details?.archive_digest === pkg.archive_digest) ok(`export.downloaded on the action at ${iso(evd.occurred_at)} — the stream is the same governed, audited act as the JSON download`); else bad('no export.downloaded event for the stream');
  const dl = await download(exp.id);
  if (dl.ok && dl.body.download?.archiveDigest === pkg.archive_digest && Buffer.from(dl.body.download.base64, 'base64').byteLength === statSync(out).size) ok(`the JSON download (the in-memory answer, its ceiling 256 MiB) still serves this ${dl.body.download.byteLength}-byte package with the same digest`); else bad(`the JSON download: ${dl.status} ${dl.body?.message ?? JSON.stringify(dl.body).slice(0, 200)}`);
  note('STATED: a package ABOVE the in-memory ceiling — 272 MB, seventeen records — is the harness\'s proof (phase6-retention-b15 S2: the JSON download refused with the ceiling named, the stream route serving it hashed as it arrives, the verifier scanning it in constant memory, the station and https deliveries streaming it, the heap under 256 MiB); the demonstration\'s records are small and no synthetic bulk is added to NORDWERK');
}

/* ── 3. THE STREAMED DELIVERY ────────────────────────────────────────────── */
console.log('\n3. THE STREAMED DELIVERY — H. Bergmann delivers to the transfer station: package.tar streamed to the station; the demonstration recipient verifies (the links checks) and answers; collected: ACKNOWLEDGED');
if (exp === null || pkg === null) bad('no export to deliver');
else {
  const ds = await listDestinations();
  const station = ds.ok ? (ds.body.destinations ?? []).find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null : null;
  if (station === null) bad(`the transfer station ${STATION_KEY} is not declared`);
  else {
    const endpoint = String(field(station, 'endpoint') ?? STATION);
    const sdir = join(endpoint, T, D, exp.id);
    const dv = await deliver(exp.id, STATION_KEY);
    if (!dv.ok) fail(`export/deliver to ${STATION_KEY} (h.bergmann)`, dv);
    else {
      const dl = dv.body.delivery ?? {};
      const tar = join(sdir, 'package.tar');
      if (field(dl, 'state') === 'delivered' && existsSync(tar) && sha256File(tar) === pkg.archive_digest) ok(`H. Bergmann delivered: delivery ${short(field(dl, 'delivery_id'))} attempt ${field(dl, 'attempt')} — package.tar streamed to ${rel(sdir)}/ (${statSync(tar).size} bytes, sha256 the archive digest; assembled from the files as it was written, never held whole)`);
      else bad(`the station delivery: ${JSON.stringify(dl).slice(0, 300)}`);
      const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, exp.id, ...(publicPem ? ['--public-key', PUB_PEM_PATH] : []), '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
      console.log(String(rc.stdout ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n'));
      const vt = runVerifier(tar);
      if (rc.status === 0 && vt.links.length === 3 && vt.links.every((c) => c.ok === true)) ok(`the demonstration recipient: exit 0 (verified true); the verifier on the station's tar passes the links checks — the recipient holds the closure with the records`); else bad(`the recipient: exit ${rc.status}; links checks ${JSON.stringify(vt.links)}`);
      const col = await collectReceipt(exp.id, String(field(dl, 'delivery_id')));
      if (col.ok && field(col.body.delivery, 'state') === 'acknowledged') ok(`H. Bergmann collected the receipt: ACKNOWLEDGED (receipt digest ${field(col.body.delivery, 'receipt_digest')})`); else if (col.ok) bad(`the collect act: ${JSON.stringify(col.body.delivery).slice(0, 200)}`); else fail('collect-receipt', col);
    }
  }
}

/* ── 4. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n4. THE STATE');
if (exp !== null) {
  const rd = await exportGet(exp.id);
  if (rd.ok) note(`export ${short(exp.id)}: ${rd.body.files?.length ?? '?'} file(s); package.links ${JSON.stringify(rd.body.manifest?.package?.links ?? null)}; deliveries ${(rd.body.deliveries ?? []).map((d) => `${field(d, 'destination_key')} attempt ${field(d, 'attempt')} ${field(d, 'state')}`).join(', ') || 'none'}`);
}
console.log(`\nWHAT THE DEMONSTRATION SHOWED: the customer export carries the knowledge derived from its records — the claims by lineage, the graph's edges and the entities they connect, under the ceiling, in links.json named inside the signed digest chain — verified by the product and by the customer's verifier; the archive streamed from the stream route through the real HTTP path by the customer's fetch tool and to the transfer station, verified at both ends.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-retention-b15 on a fresh database): a package above the in-memory ceiling (272 MB) built by streaming, refused by the JSON download, served by the stream route, verified in constant memory, delivered by stream to a station and to the synthetic https recipient; ustarStream byte-equal to the in-memory build; a tampered object file refused before any byte; a tampered links.json failing the product's check and the verifier.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
