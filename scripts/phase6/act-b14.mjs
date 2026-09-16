#!/usr/bin/env node
/**
 * CP-6 batch B14 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): the destination's
 * TRUST ANCHOR, the HTTPS path through the PRODUCTION egress, the transfer-station exchange and the REVOCATION NOTICE (migration 0074) —
 * exercised by the personas through the REAL HTTP path, each scene stating the effect it produced on the host and in the ledgers, what is
 * DEMONSTRATION and what is PRODUCTION, and where nothing happened, saying so.
 *
 * PREPARED BY THE RUNNER, NOT BY THIS ACT (the header of the output restates it): the demonstration signing key and the transfer station
 * of B13 (already on the host); a bearer for the demonstration https recipient generated at run time and bound BY REFERENCE
 * EYE_DST_NORDWERK_DEMO in the API process's environment (the local handoff; never printed); the DEMONSTRATION HTTPS RECIPIENT
 * (scripts/retention/https-recipient.mjs — NOT the product, NOT a production recipient) started on this host on a loopback port with a
 * self-signed certificate for nordwerk-exports.demo.invalid and the demonstration public key; `scripts/ops/demo-restart.sh --build` so the
 * API process runs the B14 build with the reference bound. The act reads the recipient's URL, certificate path and reference from
 * EYE_DEMO_HTTPS_RECIPIENT_URL / _CERT / _REF; it never reads, prints or records the bearer's value — it presents it to the RECIPIENT's
 * inspection route only (the recipient is the customer's side; the value is the customer's to know).
 *
 *   1. THE DESTINATION WITH ITS TRUST ANCHOR: the platform administrator declares `nordwerk-exports-demo` (https; the recipient's hostname
 *      and port; the credential reference EYE_DST_NORDWERK_DEMO — bound in the API process; the recipient's certificate as the trust anchor)
 *      → readiness active, the anchor shown by subject and fingerprint (compared here with the certificate file's own fingerprint); the
 *      B13 production destination `nordwerk-exports` stays blocked-credential (its reference unbound: production activation).
 *   2. THE SIGNED EXPORT: P. Novák opens a customer export of the two hot NORDWERK internal records, H. Bergmann approves, P. Novák
 *      executes (scheme eye-customer-export/2, the demonstration key) and verifies.
 *   3. THE HTTPS PATH THROUGH THE PRODUCTION EGRESS: H. Bergmann delivers to `nordwerk-exports-demo` → recorded FAILED transport
 *      (dns_failure: on this host the recipient's name resolves nowhere, and its loopback address is one the production vetting refuses
 *      by design — B13 H1) — nothing reached the recipient (its inspection route says so). STATED: the positive exchange over TLS with
 *      this recipient — the delivery acknowledged, the stale receipt held as evidence (Codex B13-F1), the wrong answers classified — is the
 *      harness's (phase6-retention-b14 H1–H3, the product's pinned transport on a real socket, the address vetting the ONE substituted
 *      step); a delivery through the production egress needs a recipient on a public address, the activation step.
 *   4. THE STATION EXCHANGE: H. Bergmann delivers to `nordwerk-transfer-station` → delivered; the DEMONSTRATION RECIPIENT (the station
 *      script) verifies and writes receipt.json; collected → ACKNOWLEDGED.
 *   5. THE REVOCATION NOTICE: H. Bergmann revokes → in the same act the station is NOTIFIED (revocation.json beside delivery.json: the
 *      digests, the delivery it holds, the reason, the instant, the obligation), the https destination never received the package and
 *      is not notified (the answer says which); after the commit the product's package.tar and package.sig are removed from the station
 *      (the answer says which; the host confirms); export.revoked / export.revocation_notified; custody.revocation_notified per record;
 *      the DEMONSTRATION RECIPIENT in --revocation mode answers (the copies already gone) with revocation-receipt.json; collected →
 *      ACKNOWLEDGED. A further notice (the notify act) → attempt 2; the recipient with --refuse → collected → MISMATCHED (the obligation
 *      refused, both sides on the event, the evidence kept). The download and a further delivery refused.
 *   6. THE STATE: the destinations with their anchors, the deliveries and the notices of the action.
 *
 * Idempotence: the demonstration destination is reused by key when already declared (with a note); every run opens a NEW export. The
 * act cleans nothing on the demonstration (the station directory keeps delivery.json, receipt.json, revocation.json and
 * revocation-receipt.json as the record — the package files are gone by the revocation). Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
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
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`;
const short = (id) => `${String(id).slice(0, 8)}…`;
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann');
const pn = (over) => as(novak, scope, { purposeId: 'retention', ...over });
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const adm = (over) => as(admin, scope, { purposeId: 'platform.administration', ...over });
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const rel = (p) => p.replace(ROOT + '/', '');
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const field = (o, k) => (o === null || o === undefined ? null : (o[k] ?? o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null));
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/* ── what the runner prepared (read here, never written) ─────────────────── */
const PUB_PEM_PATH = resolvePath(ROOT, env.EYE_DEMO_SIGNING_PUBLIC_PEM ?? '.eye-local/export-signing-demo.pub.pem');
const STATION = resolvePath(ROOT, env.EYE_DEMO_TRANSFER_STATION ?? '.eye-local/transfer-station-demo');
const STATION_KEY = 'nordwerk-transfer-station'; const STATION_RECIPIENT_NAME = 'NORDWERK GmbH — demonstration transfer station';
const PROD_KEY = 'nordwerk-exports';
const DEMO_KEY = 'nordwerk-exports-demo'; const DEMO_HOST = 'nordwerk-exports.demo.invalid';
const RECIPIENT_URL = env.EYE_DEMO_HTTPS_RECIPIENT_URL ?? null; const RECIPIENT_CERT = env.EYE_DEMO_HTTPS_RECIPIENT_CERT ?? null; const DEMO_REF = env.EYE_DEMO_HTTPS_RECIPIENT_REF ?? 'EYE_DST_NORDWERK_DEMO';
const STATION_RECIPIENT = join(ROOT, 'scripts', 'retention', 'transfer-station-recipient.mjs');
const publicPem = existsSync(PUB_PEM_PATH) ? readFileSync(PUB_PEM_PATH, 'utf8') : null;
const recipientPort = RECIPIENT_URL === null ? null : Number(new URL(RECIPIENT_URL).port);
const recipientCertPem = RECIPIENT_CERT !== null && existsSync(RECIPIENT_CERT) ? readFileSync(RECIPIENT_CERT, 'utf8') : null;
const recipientBearer = process.env[DEMO_REF] ?? env[DEMO_REF] ?? null;

/** The recipient's inspection route, as the customer's side would read it — TLS against the recipient's own certificate, the bearer presented to the recipient only. */
const recipientReceived = () => new Promise((res) => {
  if (recipientPort === null || recipientCertPem === null || recipientBearer === null) { res(null); return; }
  const req = httpsRequest({ host: '127.0.0.1', port: recipientPort, servername: DEMO_HOST, path: '/_received', method: 'GET', ca: recipientCertPem, rejectUnauthorized: true, headers: { authorization: `Bearer ${recipientBearer}` } }, (r) => {
    const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => { try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { res(null); } });
  });
  req.on('error', () => res(null)); req.end();
});

/* ── the governed acts ───────────────────────────────────────────────────── */
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const declareDestination = (payload) => call(`${R}/destinations/declare`, adm({ action: 'retention.destination.declare', objectType: 'RDS', consequence: 'C2' }), payload, admin.token);
const listDestinations = () => call(`${R}/destinations/list`, pn({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, novak.token);
const deliver = (id, destinationKey) => call(`${R}/actions/${id}/export/deliver`, hb({ action: 'retention.export.deliver', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const deliveriesList = (id) => call(`${R}/actions/${id}/export/deliveries/list`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const collectReceipt = (id, deliveryId) => call(`${R}/actions/${id}/export/deliveries/${deliveryId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const revoke = (id, reason) => call(`${R}/actions/${id}/export/revoke`, hb({ action: 'retention.export.revoke', objectType: 'RTA', objectId: id, consequence: 'C2' }), { reason }, bergmann.token);
const notify = (id, destinationKey) => call(`${R}/actions/${id}/export/revocation-notices`, hb({ action: 'retention.export.notify', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const noticesList = (id) => call(`${R}/actions/${id}/export/revocation-notices/list`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const collectNotice = (id, noticeId) => call(`${R}/actions/${id}/export/revocation-notices/${noticeId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const download = (id) => call(`${R}/actions/${id}/export/download`, pn({ action: 'retention.export.download', objectType: 'RTA', objectId: id }), {}, novak.token);

/* ── the ledgers ─────────────────────────────────────────────────────────── */
const lastEvent = async (id, event) => (await q(`select details, occurred_at from retention.action_events where action_id = $1 and event = $2 order by occurred_at desc limit 1`, [id, event]))[0] ?? null;
const packageRow = async (id) => (await q(`select object_count::int, package_digest, archive_digest, signing_key_id, revoked_at, revoke_reason from retention.export_packages where action_id = $1`, [id]))[0] ?? null;
const deliveryRows = (id) => q(`select d.delivery_id::text, d.attempt::int, d.state, d.failure_class, d.receipt, d.receipt_digest, d.acknowledged_at, x.destination_key, x.kind from retention.export_deliveries d join retention.export_destinations x on x.destination_id = d.destination_id where d.action_id = $1 order by d.delivered_at`, [id]);
const noticeRows = (id) => q(`select n.notice_id::text, n.delivery_id::text, n.attempt::int, n.state, n.failure_class, n.notice, n.receipt, n.receipt_digest, n.notified_at, n.acknowledged_at, x.destination_key, x.kind from retention.export_revocation_notices n join retention.export_destinations x on x.destination_id = n.destination_id where n.action_id = $1 order by n.notified_at`, [id]);
const custodyOf = (event, key, value) => q(`select manifest_id::text, details from observation.custody_events where event = $1 and details ->> $2 = $3 order by occurred_at`, [event, key, value]);
const targetsIn = (tier, limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed' and s.source_key = 'nordwerk-internal'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and ($3::text is null or observation.manifest_tier(m.manifest_id) = $3)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit $4`, [T, D, tier, limit]);
const destinationLine = (d) => `${field(d, 'destination_key')} (${field(d, 'kind')}; ${field(d, 'endpoint')}; recipient "${field(d, 'recipient')}"; credential ${field(d, 'credential_ref') ?? 'none'}; readiness ${field(d, 'readiness')}; anchor ${anchorLine(field(d, 'trust_anchor'))})`;
const anchorLine = (a) => (a === null || a === undefined || a.declared !== true ? 'none (the deployment\'s trust store)' : (a.certificates ?? []).map((c) => `${c.subject} · ${String(c.fingerprint256).slice(0, 23)}…`).join('; '));
const noticeLine = (n) => `notice ${short(n.notice_id)} attempt ${n.attempt} to ${n.destination_key} (${n.kind}) — ${n.state}${n.failure_class ? ` (${n.failure_class})` : ''}, notified ${iso(n.notified_at)}${n.acknowledged_at ? `, acknowledged ${iso(n.acknowledged_at)}` : ''}`;

console.log(`THE EYE — CP-6 B14 on the demonstration: the trust anchor, the https path through the production egress, the station exchange and the revocation notice (migration 0074)`);
console.log(`target ${env.EYE_API ?? 'http://localhost:3401'} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} domain ${short(D)} · ${new Date().toISOString()}`);
console.log(`prepared by the runner: the demonstration https recipient ${RECIPIENT_URL ?? 'NOT RUNNING'} (certificate ${RECIPIENT_CERT ? rel(RECIPIENT_CERT) : 'none'}; the bearer bound by reference ${DEMO_REF} in the API process — its value never printed); the transfer station ${rel(STATION)}; the demonstration public key ${rel(PUB_PEM_PATH)}`);

/* ── 1. THE DESTINATION WITH ITS TRUST ANCHOR ─────────────────────────────── */
console.log('\n1. THE DESTINATION WITH ITS TRUST ANCHOR — the platform administrator declares the demonstration https destination with the recipient\'s certificate as its trust anchor; the production destination stays blocked-credential');
let demoDest = null; let station = null;
{
  const before = await listDestinations();
  if (!before.ok) fail('destinations/list', before);
  const rows = before.ok ? (before.body.destinations ?? []) : [];
  station = rows.find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null;
  if (station === null) bad(`the transfer station ${STATION_KEY} of B13 is not declared on this demonstration`); else ok(`the transfer station of B13: ${destinationLine(station)}`);
  const prod = rows.find((x) => field(x, 'destination_key') === PROD_KEY && field(x, 'retired_at') === null) ?? null;
  if (prod !== null && field(prod, 'readiness') === 'blocked-credential') ok(`the PRODUCTION destination of B13: ${destinationLine(prod)} — its reference stays unbound on this host (production activation: the customer's endpoint, its credential, its anchor)`);
  else note(`the production destination ${PROD_KEY}: ${prod === null ? 'not declared' : destinationLine(prod)}`);
  demoDest = rows.find((x) => field(x, 'destination_key') === DEMO_KEY && field(x, 'retired_at') === null) ?? null;
  if (recipientCertPem === null || recipientPort === null) bad('the demonstration https recipient is not running (EYE_DEMO_HTTPS_RECIPIENT_URL / _CERT unset): the runner starts it before the act');
  else if (demoDest !== null) note(`${DEMO_KEY} is already declared (a previous run): ${destinationLine(demoDest)} — reused`);
  else {
    const r = await declareDestination({ destinationKey: DEMO_KEY, kind: 'https', endpoint: `https://${DEMO_HOST}:${recipientPort}/receive`, credentialRef: DEMO_REF, trustAnchorPem: recipientCertPem, recipient: 'NORDWERK GmbH — demonstration https recipient (this host)', purpose: 'the https kind exercised against the demonstration recipient: the anchor, the credential, the production egress' });
    if (!r.ok) fail('destinations/declare (platform-admin)', r);
    else { demoDest = r.body.destination ?? r.body; ok(`the platform administrator declared: HTTP ${r.status} — ${destinationLine(demoDest)}`); }
  }
  if (demoDest !== null && recipientCertPem !== null) {
    const cert = new X509Certificate(recipientCertPem);
    const a = field(demoDest, 'trust_anchor');
    if (a !== null && a.declared === true && a.certificates?.[0]?.fingerprint256 === cert.fingerprint256 && String(a.certificates[0].subject).includes(DEMO_HOST)) ok(`the anchor as recorded is the recipient's certificate: subject ${cert.subject}, sha-256 fingerprint ${cert.fingerprint256} (the file's own), valid until ${cert.validTo}; readiness ${field(demoDest, 'readiness')} (the reference ${DEMO_REF} is bound in the API process)`);
    else bad(`the anchor as recorded: ${JSON.stringify(a)} — expected the recipient's certificate (${cert.fingerprint256})`);
    if (/Bearer |EYE_DST_[A-Z0-9_]+=/.test(JSON.stringify(demoDest))) bad('the destination row carries a credential value'); else note('no credential VALUE in the destination row or the answer (the reference name and its readiness only); the anchor is PUBLIC material');
    note('DEMONSTRATION vs PRODUCTION: TLS verification is never disabled — the anchor NARROWS trust to the declared party (a customer endpoint on its own PKI: the on-premise and disconnected modes of ES-53-004); a production destination declares the customer\'s real certificate chain, or none and trusts the deployment\'s store');
  }
}

/* ── 2. THE SIGNED EXPORT ────────────────────────────────────────────────── */
console.log('\n2. THE SIGNED EXPORT — P. Novák opens a customer export of the two hot NORDWERK internal records; H. Bergmann approves; executed with the demonstration key; verified');
let exp = null; let pkg = null;
{
  let targets = await targetsIn('hot', 2);
  if (targets.length < 2) { note(`fewer than two hot NORDWERK internal records with confirmed rights (${targets.length}): the two most recent in any tier are taken`); targets = await targetsIn(null, 2); }
  if (targets.length === 0) bad('no current NORDWERK internal evidence with confirmed rights to export');
  else {
    const o = await open({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: targets.map((t) => t.manifest_id), classificationCeiling: 'internal', destination: 'export', expiresAfter: '7 days' }, retentionProfile: null, reason: 'the customer asks for its internal records as a signed package; the B14 demonstration of the exchange and the revocation notice' });
    if (!o.ok) fail('open export (p.novak)', o);
    else {
      const id = o.body.action.actionId;
      const rs = await resolve(id);
      const ap = rs.ok ? await approve(id, rs.body.scope.scope_digest, 'internal records only, under the ceiling; the customer\'s own tenant; the package expires in 7 days') : null;
      if (!rs.ok || ap === null || !ap.ok) fail('resolve/approve export', rs.ok ? ap : rs);
      else {
        const ex = await execute(id);
        if (!ex.ok) fail('execute export (p.novak)', ex);
        else {
          const vf = await verify(id);
          pkg = await packageRow(id);
          if (vf.ok && vf.body.verification.verified === true && pkg !== null && pkg.archive_digest !== null) { exp = { id }; ok(`export ${short(id)}: ${targets.length} record(s) — P. Novák opened, H. Bergmann approved, P. Novák executed and verified; package digest ${String(pkg.package_digest).slice(0, 16)}…, archive digest ${String(pkg.archive_digest).slice(0, 16)}…, signed by ${pkg.signing_key_id ?? 'no key (scheme /1)'}`); }
          else bad(`the export did not verify or has no archive digest: ${JSON.stringify(vf.body?.verification ?? vf.body).slice(0, 200)} / ${JSON.stringify(pkg)}`);
        }
      }
    }
  }
}

/* ── 3. THE HTTPS PATH THROUGH THE PRODUCTION EGRESS ─────────────────────── */
console.log('\n3. THE HTTPS PATH THROUGH THE PRODUCTION EGRESS — H. Bergmann delivers to the demonstration https destination: the credential bound, the anchor declared, the egress reached — and refused by the production vetting on this host');
if (exp === null || demoDest === null) bad('no export or no demonstration https destination');
else {
  const beforeCount = (await recipientReceived())?.received?.length ?? null;
  const dv = await deliver(exp.id, DEMO_KEY);
  const dl = dv.body?.delivery ?? null;
  const f = field(dl, 'receipt')?.failure ?? null;
  if (dv.ok && field(dl, 'state') === 'failed' && ['transport', 'egress_refused'].includes(field(dl, 'failure_class')) && f !== null && ['dns_failure', 'address_not_public'].includes(f.egress)) {
    ok(`the delivery answered HTTP ${dv.status}: delivery ${short(field(dl, 'delivery_id'))} state ${field(dl, 'state')}, class ${field(dl, 'failure_class')}, the egress's refusal ${f.egress} — "${f.message}"; attempt ${field(dl, 'attempt')}; a FAILED delivery is a recorded fact`);
    note(`what happened, exactly: the credential gate PASSED (${DEMO_REF} is bound — the B13 refusal credential_unbound did not fire), the production egress RESOLVED ${DEMO_HOST} and found ${f.egress === 'dns_failure' ? 'no address (an .invalid name resolves nowhere, on this host or any other)' : 'a loopback address, which the vetting refuses'}; nothing left the process — the recipient's inspection route ${beforeCount === null ? 'was not asked' : `counts ${(await recipientReceived())?.received?.length ?? '?'} delivery(ies), as before (${beforeCount})`}`);
    note('STATED: the demonstration recipient listens on a loopback address of this host, which the production address vetting refuses BY DESIGN (every private, loopback, link-local and reserved address; B13 H1, B14 H3) — the positive exchange over TLS with this same recipient (the delivery acknowledged; a stale receipt held as evidence, not acknowledged — Codex B13-F1; the wrong answers classified; the anchor the only trust) is the harness\'s proof, phase6-retention-b14 H1–H3, where the product\'s own pinned transport runs on a real socket and the address vetting is the ONE substituted step; a delivery through the production egress needs a recipient on a public address — the activation step, with the customer\'s endpoint, credential and certificate chain');
  } else bad(`expected a failed delivery refused by the egress (dns_failure or address_not_public); the route answered ${dv.status} ${dv.body?.message ?? JSON.stringify(dl).slice(0, 300)}`);
}

/* ── 4. THE STATION EXCHANGE ─────────────────────────────────────────────── */
console.log('\n4. THE STATION EXCHANGE — H. Bergmann delivers to the transfer station; the demonstration recipient verifies and answers; collected: ACKNOWLEDGED');
let stationDelivery = null; let stationDirOf = null;
if (exp === null || pkg === null || station === null) bad('no export or no transfer station');
else {
  const endpoint = String(field(station, 'endpoint') ?? STATION);
  stationDirOf = join(endpoint, T, D, exp.id);
  const dv = await deliver(exp.id, STATION_KEY);
  if (!dv.ok) fail(`export/deliver to ${STATION_KEY} (h.bergmann)`, dv);
  else {
    stationDelivery = dv.body.delivery ?? {};
    const tar = join(stationDirOf, 'package.tar');
    if (field(stationDelivery, 'state') === 'delivered' && existsSync(tar) && sha256File(tar) === pkg.archive_digest) ok(`H. Bergmann delivered: delivery ${short(field(stationDelivery, 'delivery_id'))} attempt ${field(stationDelivery, 'attempt')} — the host holds ${rel(stationDirOf)}/package.tar (${statSync(tar).size} bytes, sha256 the archive digest), package.sig, delivery.json`);
    else bad(`the station delivery: ${JSON.stringify(stationDelivery).slice(0, 300)}`);
    const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, exp.id, ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
    console.log(String(rc.stdout ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n'));
    const receipt = readJson(join(stationDirOf, 'receipt.json'));
    if (rc.status !== 0 || receipt === null || receipt.verified !== true) bad(`the demonstration recipient: exit ${rc.status}; receipt ${JSON.stringify(receipt).slice(0, 200)}`);
    const col = await collectReceipt(exp.id, String(field(stationDelivery, 'delivery_id')));
    if (!col.ok) fail('collect-receipt (h.bergmann)', col);
    else if (field(col.body.delivery, 'state') === 'acknowledged') ok(`H. Bergmann collected the receipt: ACKNOWLEDGED (receipt ${short(receipt?.receipt_id)}, verified ${receipt?.verified}, digest ${field(col.body.delivery, 'receipt_digest')})`);
    else bad(`the collect act: ${JSON.stringify(col.body.delivery).slice(0, 200)}`);
  }
}

/* ── 5. THE REVOCATION NOTICE ────────────────────────────────────────────── */
console.log('\n5. THE REVOCATION NOTICE — H. Bergmann revokes: the station notified in the same act; the product\'s copies removed from the station after the commit; the recipient answers; collected: ACKNOWLEDGED; a further notice refused by the recipient: MISMATCHED');
if (exp === null || pkg === null || stationDelivery === null || stationDirOf === null) bad('no station exchange to revoke');
else {
  const reason = 'the customer withdrew its request; every copy of the package is to be destroyed (the B14 demonstration)';
  const rv = await revoke(exp.id, reason);
  if (!rv.ok) fail('export/revoke (h.bergmann)', rv);
  else {
    const notices = rv.body.notices ?? []; const stations = rv.body.stations ?? []; const recipients = rv.body.revocation?.recipients ?? [];
    const ns = notices.find((n) => field(n.destination, 'destination_key') === STATION_KEY) ?? null;
    if (recipients.length === 1 && recipients[0].destination_key === STATION_KEY && ns !== null && ns.state === 'notified' && ns.attempt === 1) ok(`H. Bergmann revoked: HTTP ${rv.status} — revoked at ${iso(rv.body.revocation.revoked_at)}, bytes removed ${rv.body.bytes.removed}; the destinations that RECEIVED the package: ${recipients.map((r) => `${r.destination_key} (delivery ${short(r.delivery_id)} attempt ${r.attempt}, ${r.delivery_state})`).join(', ')} — ${DEMO_KEY} never received it and is not notified; the notice to ${STATION_KEY}: ${short(ns.notice_id)} attempt 1, state ${ns.state} (a station's recipient answers later)`);
    else bad(`the revocation's notices: ${JSON.stringify({ recipients, notices: notices.map((n) => ({ key: field(n.destination, 'destination_key'), state: n.state, failure: n.failure_class })) }).slice(0, 400)}`);
    const st = stations.find((s) => s.destination_key === STATION_KEY) ?? null;
    const tarGone = !existsSync(join(stationDirOf, 'package.tar')) && !existsSync(join(stationDirOf, 'package.sig'));
    const kept = ['delivery.json', 'receipt.json', 'revocation.json'].filter((f) => existsSync(join(stationDirOf, f)));
    if (st !== null && st.removed?.length === 2 && st.failed?.length === 0 && tarGone && kept.length === 3) ok(`after the commit the product removed what it placed at the station: ${st.removed.join(', ')} (absent ${JSON.stringify(st.absent)}, failed ${JSON.stringify(st.failed)}); the host: package.tar and package.sig gone, ${kept.join(', ')} kept as the record`);
    else bad(`the station after the revocation: ${JSON.stringify(st)}; tar gone ${tarGone}; kept ${kept.join(', ')}`);
    const written = readJson(join(stationDirOf, 'revocation.json'));
    if (ns !== null && written !== null && written.notice_id === ns.notice_id && written.package_digest === pkg.package_digest && written.archive_digest === pkg.archive_digest && written.delivery?.delivery_id === field(stationDelivery, 'delivery_id') && written.reason === reason && typeof written.revoked_at === 'string') ok(`revocation.json — the notice as written: notice ${short(written.notice_id)} attempt ${written.attempt}, action ${short(written.action_id)}, the delivery it concerns ${short(written.delivery.delivery_id)} (attempt ${written.delivery.attempt}, ${written.delivery.state}), package ${String(written.package_digest).slice(0, 12)}…, archive ${String(written.archive_digest).slice(0, 12)}…, revoked ${iso(written.revoked_at)}, reason "${written.reason}"; the obligation: "${written.obligation}"`);
    else bad(`revocation.json: ${JSON.stringify(written).slice(0, 300)}`);
    const evr = await lastEvent(exp.id, 'export.revoked'); const evn = await lastEvent(exp.id, 'export.revocation_notified');
    const cust = ns === null ? [] : await custodyOf('custody.revocation_notified', 'notice_id', ns.notice_id);
    if (evr !== null && evn !== null && cust.length === Number(pkg.object_count)) ok(`the ledgers: export.revoked at ${iso(evr.occurred_at)}; export.revocation_notified at ${iso(evn.occurred_at)} (${JSON.stringify(evn.details).slice(0, 160)}…); custody.revocation_notified per exported record: ${cust.length} row(s)`);
    else bad(`the ledgers: revoked ${evr === null ? 'NONE' : 'present'}, notified ${evn === null ? 'NONE' : 'present'}, custody rows ${cust.length} (the package holds ${pkg.object_count})`);
    // THE DEMONSTRATION RECIPIENT answers the notice: its copies are already gone (the product removed what it placed); it writes revocation-receipt.json.
    const endpoint = String(field(station, 'endpoint') ?? STATION);
    const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, exp.id, '--revocation', '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
    console.log(String(rc.stdout ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n'));
    const rr = readJson(join(stationDirOf, 'revocation-receipt.json'));
    if (rc.status === 0 && rr !== null && ns !== null && rr.notice_id === ns.notice_id && rr.copies_destroyed === true && rr.package_digest === pkg.package_digest) ok(`the demonstration recipient (NOT the product): exit 0; revocation-receipt.json — receipt ${short(rr.receipt_id)} for notice ${short(rr.notice_id)}, copies_destroyed ${rr.copies_destroyed} (destroyed here: ${JSON.stringify(rr.destroyed)} — the product had removed them), recipient "${rr.recipient}"`);
    else bad(`the recipient's revocation receipt: exit ${rc.status}; ${JSON.stringify(rr).slice(0, 300)}`);
    if (ns !== null) {
      const c1 = await collectNotice(exp.id, ns.notice_id);
      const eva = await lastEvent(exp.id, 'export.revocation_acknowledged');
      if (c1.ok && field(c1.body.notice, 'state') === 'acknowledged' && eva !== null) ok(`H. Bergmann collected the notice's receipt: ACKNOWLEDGED at ${iso(field(c1.body.notice, 'acknowledged_at'))} (receipt digest ${field(c1.body.notice, 'receipt_digest')}); export.revocation_acknowledged at ${iso(eva.occurred_at)} — the recipient's obligation confirmed (ES-29-005: the revocation context carried to the recipient; DP-47-005: the request and evidence preserved)`);
      else if (c1.ok) bad(`the collect act: ${JSON.stringify(c1.body.notice).slice(0, 200)}`); else fail('revocation-notices/collect-receipt (h.bergmann)', c1);
    }
    // A further notice (the notify act): attempt 2; the recipient REFUSES the obligation → mismatched, the evidence kept.
    const n2 = await notify(exp.id, STATION_KEY);
    if (!n2.ok) fail('revocation-notices (h.bergmann)', n2);
    else {
      const nn = n2.body.notice ?? {};
      if (field(nn, 'state') === 'notified' && Number(field(nn, 'attempt')) === 2) ok(`a further notice by the notify act (retention.export.notify, human-gated): ${short(field(nn, 'notice_id'))} attempt 2, notified — revocation.json replaced`);
      else bad(`the further notice: ${JSON.stringify(nn).slice(0, 200)}`);
      const rc2 = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, exp.id, '--revocation', '--refuse', '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
      console.log(String(rc2.stdout ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n'));
      const c2 = await collectNotice(exp.id, String(field(nn, 'notice_id')));
      const evm = await lastEvent(exp.id, 'export.revocation_mismatched');
      if (c2.ok && field(c2.body.notice, 'state') === 'mismatched' && evm !== null && evm.details?.received?.copies_destroyed === false) ok(`the recipient refused the obligation (--refuse: copies_destroyed false) → collected → MISMATCHED; the event export.revocation_mismatched carries both sides: expected ${JSON.stringify(evm.details.expected)}, received ${JSON.stringify(evm.details.received)} — the exchange denied, the request and the evidence preserved`);
      else if (c2.ok) bad(`the second collect act: ${JSON.stringify(c2.body.notice).slice(0, 200)}; event ${evm === null ? 'NONE' : JSON.stringify(evm.details).slice(0, 200)}`); else fail('revocation-notices/collect-receipt 2 (h.bergmann)', c2);
    }
    // A notice to a destination that never received the package; the download and a further delivery refused.
    const nx = await notify(exp.id, DEMO_KEY);
    if (nx.status === 409 && /never received/.test(nx.body?.message ?? '')) ok(`a notice to ${DEMO_KEY}, which never received the package: 409 — "${nx.body.message}"`); else bad(`the notice to ${DEMO_KEY}: ${nx.status} ${nx.body?.message ?? ''}`);
    const dl = await download(exp.id); const dv = await deliver(exp.id, STATION_KEY);
    if (dl.status === 409 && dv.status === 409) ok(`the revoked package: the download refused (409 — "${dl.body?.message ?? ''}"), a further delivery refused (409 — "${dv.body?.message ?? ''}")`); else bad(`after the revocation: download ${dl.status}, deliver ${dv.status}`);
  }
}

/* ── 6. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n6. THE STATE — the destinations with their anchors, the deliveries and the notices of the action');
{
  const ds = await listDestinations();
  if (ds.ok) for (const d of (ds.body.destinations ?? []).filter((x) => field(x, 'retired_at') === null)) note(destinationLine(d));
  if (exp !== null) {
    const dv = await deliveriesList(exp.id);
    if (dv.ok) for (const d of dv.body.deliveries ?? []) note(`delivery ${short(field(d, 'delivery_id'))} attempt ${field(d, 'attempt')} to ${field(d, 'destination_key')} (${field(d, 'kind')}) — ${field(d, 'state')}${field(d, 'failure_class') ? ` (${field(d, 'failure_class')})` : ''}`);
    const nl = await noticesList(exp.id);
    if (nl.ok) for (const n of nl.body.notices ?? []) note(noticeLine(n));
    const rows = await noticeRows(exp.id);
    if (rows.length === 2 && rows[0].state === 'acknowledged' && rows[1].state === 'mismatched') ok(`the notice ledger (retention.export_revocation_notices): ${rows.map((n) => noticeLine(n)).join('; ')}`);
    else bad(`the notice ledger: ${rows.map((n) => noticeLine(n)).join('; ')}`);
  }
}

console.log(`\nWHAT THE DEMONSTRATION SHOWED: the trust anchor declared and recorded (the recipient's certificate, by fingerprint); the https path through the PRODUCTION egress — the credential bound, the anchor declared, the egress reached and refused by the vetting on this host (nothing left the process); the station exchange acknowledged; the revocation NOTICE — the station told in the revoke act, the product's copies removed after the commit, the recipient's confirmation collected and the exchange closed acknowledged, a refusal recorded mismatched with both sides.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-retention-b14 on a fresh database): the positive https exchange over TLS with the synthetic recipient — acknowledged in one act; a stale receipt (Codex B13-F1) held as evidence and NOT acknowledged; wrong-digest, denied, unverified, not-JSON, 500, redirect and 401 answers classified; the anchor the only trust (the same endpoint without it refused: TLS); the https revocation notice acknowledged in the revoke act and its failure retried — with the address vetting the ONE substituted step. PRODUCTION ACTIVATION (not done): a recipient on a public address with the customer's endpoint, credential and certificate chain; the production signing key.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
