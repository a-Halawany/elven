#!/usr/bin/env node
/**
 * CP-6 batch B16 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): the GOVERNED
 * IMPORT and the NORDWERK export → import → re-export ROUND TRIP between two domains of the tenant, the VERSIONED closure (Codex
 * B15-F1) and HELD recipients (Codex B14-F1) — migration 0076 — exercised by the personas through the REAL HTTP path, each scene
 * stating the effect it produced on the host and in the ledgers, and where nothing happened, saying so.
 *
 *   1. THE VERSIONED RELATIONSHIP IN THE ORIGIN DOMAIN: a REL claim C with an asserted edge on a NORDWERK internal record; the
 *      administrator challenges it (a review case) and decides a CORRECTION (the confidence) → C@v+1 with its own lineage row, the
 *      edge still resting on C@v. On the demonstration the relationships subscriber runs: after the correction the ledger MAY hold the
 *      C@v edge SUPERSEDED and a new edge asserted on C@v+1 — the act waits for the delivery to settle and prints what it finds.
 *   2. THE EXPORT E1 WITH ITS VERSIONED CLOSURE: P. Novák opens a customer export of the records that carry that knowledge, H. Bergmann
 *      approves, executed, verified — links.json is eye-customer-export-links/2: C@v AND C@v+1 listed as EXACT versions, each edge naming
 *      its pair; the verifier's pair check passes; on scratch copies the B15-F1 counterexample (the closure carrying C@v+1 alone while
 *      the edge names C@v) FAILS the pair check, and an edge REBASED onto another carried version fails the signed chain — the closure is
 *      inside the signature. Then H. Bergmann delivers E1 to the transfer station; the demonstration recipient verifies and answers;
 *      collected: ACKNOWLEDGED — the package the importing domain will read.
 *   3. THE DESTINATION DOMAIN: 'NORDWERK Exchange Mirror (SYNTHETIC)' created by the administrator (idempotent by name); the personas
 *      M. Keller (retention steward) and U. Fischer (collection manager) created (a 409 logs them in); the INTAKE SOURCE CONTRACT
 *      nordwerk-exchange-intake (upload kind, ceiling internal, rights confirmed, residency EU, licence internal) registered by the
 *      administrator, approved and activated by U. Fischer; the transfer station declared in the mirror domain; the import of E1 opened
 *      from the station BEFORE ANY PARTNER holds the key → QUARANTINED ("no exchange partner of this domain holds key ed25519:…"), the
 *      request and its evidence kept; then the EXCHANGE PARTNER nordwerk-origin declared by the administrator with the demonstration
 *      public key and the intake contract. (A re-run retires the partner first, with a reason, so that the scene holds on every run.)
 *   4. THE EXCHANGE: M. Keller opens the import from the same station package (delivery.json the exchange) → VERIFIED, the fifteen checks
 *      printed; the opener's own approval refused (403); H. Bergmann approves ON THE PACKAGE DIGEST; the approver's own admission refused
 *      (403); M. Keller admits → ADMITTED: the map printed (origin id@v → the id this installation minted, C'@v and C'@v+1 under ONE
 *      new id), custody.imported per record, the mirror's manifests under the intake contract, the evidence download route in the
 *      mirror returning the bytes with the origin digest (custody.retrieved naming the intake contract), the graph's edge in the mirror
 *      resting on C'@v, the entities with their identifiers, the import's receipt (verified: true).
 *   5. THE RE-EXPORT E2 FROM THE MIRROR: M. Keller opens a customer export of the imported manifests, H. Bergmann approves, executed,
 *      verified; the customer's ROUND-TRIP tool (scripts/retention/compare-round-trip.mjs) on E1, E2 and the import's record → ROUND
 *      TRIP OK; E2's closure carries C'@v and C'@v+1 with the edge on version v; payload.imported_from recovers the origin identities.
 *   6. HELD RECIPIENTS (Codex B14-F1): a one-record export E3 delivered to the station; the demonstration recipient answers with a WRONG
 *      DIGEST → collected → MISMATCHED; a delivery to the production destination nordwerk-exports → FAILED credential_unbound before any
 *      egress; H. Bergmann revokes E3 → the station is among the recipients NOTIFIED with held: confirmed (a mismatched receipt proves
 *      the package reached it); nordwerk-exports is absent (nothing is known to have reached it) and the notify route for it answers
 *      409; the recipient answers the notice → collected → ACKNOWLEDGED; the mismatched receipt still on the delivery row.
 *   7. THE STATE and the STATED limits: the inline intake over the real listener is bounded by the JSON body limit (the act used the
 *      station; the import tool refuses a larger body before sending it, naming the station path); the revocation check is decided on
 *      the origin's ledger only because the origin is this installation (a foreign origin's is a note on unsigned data, its revocation
 *      reaching this domain through its partner's notice); the positive https exchange remains the harness's (the demonstration's
 *      egress refuses loopback by design).
 *
 * Every run opens NEW exports and a NEW import; the mirror domain, its personas, its intake source, its station and its partner are
 * reused when present (the partner retired and declared again so that scene 3's pre-partner quarantine is shown on every run). Nothing is
 * cleaned. Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createDomain, createPersona } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`; const I = `${X}/intelligence`;
const short = (id) => `${String(id).slice(0, 8)}…`;
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);
const PUB_PEM_PATH = resolvePath(ROOT, env.EYE_DEMO_SIGNING_PUBLIC_PEM ?? '.eye-local/export-signing-demo.pub.pem');
const STATION = resolvePath(ROOT, env.EYE_DEMO_TRANSFER_STATION ?? '.eye-local/transfer-station-demo');
const STATION_KEY = 'nordwerk-transfer-station'; const STATION_RECIPIENT_NAME = 'NORDWERK GmbH — demonstration transfer station';
const PROD_KEY = 'nordwerk-exports';
const D2_NAME = 'NORDWERK Exchange Mirror (SYNTHETIC)'; const INTAKE_KEY = 'nordwerk-exchange-intake'; const PARTNER_KEY = 'nordwerk-origin';
const VERIFIER = join(ROOT, 'scripts', 'retention', 'verify-export.mjs');
const STATION_RECIPIENT = join(ROOT, 'scripts', 'retention', 'transfer-station-recipient.mjs');
const COMPARE = join(ROOT, 'scripts', 'retention', 'compare-round-trip.mjs');
const publicPem = existsSync(PUB_PEM_PATH) ? readFileSync(PUB_PEM_PATH, 'utf8') : null;
const scratch = mkdtempSync(join(tmpdir(), 'eye-act-b16-'));
const indent = (text) => String(text ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n');

/* ── the governed acts (the origin domain) ───────────────────────────────── */
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const exportGet = (id) => call(`${R}/actions/${id}/export/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const deliver = (id, destinationKey) => call(`${R}/actions/${id}/export/deliver`, hb({ action: 'retention.export.deliver', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const collectReceipt = (id, deliveryId) => call(`${R}/actions/${id}/export/deliveries/${deliveryId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const deliveriesList = (id) => call(`${R}/actions/${id}/export/deliveries/list`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const revoke = (id, reason) => call(`${R}/actions/${id}/export/revoke`, hb({ action: 'retention.export.revoke', objectType: 'RTA', objectId: id, consequence: 'C2' }), { reason }, bergmann.token);
const notify = (id, destinationKey) => call(`${R}/actions/${id}/export/revocation-notices`, hb({ action: 'retention.export.notify', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const collectNotice = (id, noticeId) => call(`${R}/actions/${id}/export/revocation-notices/${noticeId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const listDestinations = () => call(`${R}/destinations/list`, pn({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, novak.token);
const requestReview = (claimObjectId, claimVersion, reason) => call(`${I}/review/request`, adm({ action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId, claimVersion, reason }, admin.token);
const decideReview = (caseId, payload) => call(`${I}/review/${caseId}/decide`, adm({ action: 'intelligence.review.decide', objectType: 'REV', objectId: caseId, consequence: 'C2' }), payload, admin.token);

/* ── the ledgers ─────────────────────────────────────────────────────────── */
const packageRow = async (id) => (await q(`select object_count::int, byte_total::int, package_digest, archive_digest, manifest_digest, signing_key_id, revoked_at from retention.export_packages where action_id = $1`, [id]))[0] ?? null;
const lastEvent = async (id, event) => (await q(`select details, occurred_at from retention.action_events where action_id = $1 and event = $2 order by occurred_at desc limit 1`, [id, event]))[0] ?? null;
const deliveryRows = (id) => q(`select d.delivery_id::text, d.attempt::int, d.state, d.failure_class, d.receipt, d.receipt_digest, x.destination_key, x.kind from retention.export_deliveries d join retention.export_destinations x on x.destination_id = d.destination_id where d.action_id = $1 order by d.delivered_at`, [id]);
const ELIGIBLE = `o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed' and s.source_key = 'nordwerk-internal'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)`;
/** The current NORDWERK internal evidence records with confirmed rights that carry derived knowledge (claims by lineage, edges), most derived first. */
const targetsWithKnowledge = (limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier,
      (select count(distinct l.claim_object_id) from intelligence.claim_lineage l where l.evidence_object_id = o.object_id)::int claims,
      (select count(*) from graph.edges_current e where e.evidence_object_id = o.object_id)::int edges
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where ${ELIGIBLE} order by 6 desc, 7 desc, o.recorded_at desc limit $3`, [T, D, limit]);
const targetsIn = (tier, limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where ${ELIGIBLE} and ($3::text is null or observation.manifest_tier(m.manifest_id) = $3) order by o.recorded_at desc limit $4`, [T, D, tier, limit]);
/**
 * A REL claim C with an ASSERTED edge whose lineage row names an exportable NORDWERK internal record by the BYTES digest (the pair rule of the
 * /2 closure); the edge on the claim's latest version preferred, so that the correction below leaves the edge on the prior version.
 */
const relationshipToCorrect = () => q(`select c.object_id::text claim_id, e.claim_version::int edge_version, e.edge_id::text, e.predicate, e.state,
      (select max(x.object_version)::int from objects.canonical_objects x where x.object_id = c.object_id) latest,
      (select x.payload ->> 'confidence' from objects.canonical_objects x where x.object_id = c.object_id order by x.object_version desc limit 1) latest_confidence,
      (select canonical_name from graph.entities_current x where x.entity_id = e.subject_entity_id) subject,
      (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object,
      o.object_id::text evd_id, o.object_version::int evd_version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int
    from graph.edges_current e
    join objects.canonical_objects c on c.object_id = e.claim_object_id and c.object_version = e.claim_version and c.object_type = 'REL'
    join intelligence.claim_lineage l on l.claim_object_id = e.claim_object_id and l.claim_version = e.claim_version
    join objects.canonical_objects o on o.object_id = l.evidence_object_id and l.evidence_digest = (o.payload ->> 'content_digest')
    join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' and e.evidence_object_id = o.object_id and e.evidence_digest = (o.payload ->> 'content_digest') and ${ELIGIBLE}
    order by (e.claim_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = c.object_id)) desc, e.asserted_at desc limit 1`, [T, D]);
const edgesOfClaim = (claimId) => q(`select e.edge_id::text, e.claim_version::int, e.state, e.superseded_by::text, e.asserted_at, e.superseded_at, e.asserted_by::text from graph.edges_current e where e.claim_object_id = $1 order by e.asserted_at`, [claimId]);
const runVerifier = (target, ...extra) => {
  const args = [VERIFIER, ...(target.endsWith('.tar') ? ['--tar', target] : [target]), '--json', ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), ...extra];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let parsed = null; try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  const checks = parsed?.checks ?? [];
  return { exit: r.status, ok: parsed?.ok ?? null, checks, links: checks.filter((c) => String(c.name).startsWith('links:')), failed: checks.filter((c) => c.ok === false), closureFormat: parsed?.closure_format ?? null, stderr: String(r.stderr ?? '').slice(0, 300) };
};
/** A customer export opened by the steward, approved by H. Bergmann on the resolved scope digest, executed by the steward and verified; the package row. */
async function runExport(acts, manifestIds, reason, rationale, label) {
  const o = await acts.open({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal', destination: 'export', expiresAfter: '7 days' }, retentionProfile: null, reason });
  if (!o.ok) { fail(`open export ${label}`, o); return null; }
  const id = o.body.action.actionId;
  const rs = await acts.resolve(id);
  const ap = rs.ok ? await acts.approve(id, rs.body.scope.scope_digest, rationale) : null;
  if (!rs.ok || ap === null || !ap.ok) { fail(`resolve/approve export ${label}`, rs.ok ? ap : rs); return null; }
  const ex = await acts.execute(id);
  if (!ex.ok) { fail(`execute export ${label}`, ex); return null; }
  const vf = await acts.verify(id);
  const pkg = await packageRow(id);
  if (!(vf.ok && vf.body.verification.verified === true && pkg !== null)) { bad(`the export ${label} did not verify: ${JSON.stringify(vf.body?.verification ?? vf.body).slice(0, 300)}`); return null; }
  return { id, pkg };
}
const originActs = { open, resolve, approve, execute, verify };

console.log(`THE EYE — CP-6 B16 on the demonstration: the governed import, the NORDWERK export → import → re-export round trip, the versioned closure and held recipients (migration 0076)`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} · origin domain ${short(D)} · ${new Date().toISOString()}`);
console.log(`prepared by the runner: the demonstration signing key ${rel(PUB_PEM_PATH)} (${publicPem === null ? 'ABSENT' : 'present'}); the transfer station ${rel(STATION)}`);

/* ── 1. THE VERSIONED RELATIONSHIP IN THE ORIGIN DOMAIN ───────────────────── */
console.log('\n1. THE VERSIONED RELATIONSHIP — a REL claim C with an asserted edge is challenged and corrected: C@v+1 with its own lineage, the edge still resting on C@v');
let C = null; let cv = null; let cvNew = null;
{
  const rows = await relationshipToCorrect();
  if (rows.length === 0) bad('no asserted relationship edge on an exportable NORDWERK internal record with a lineage row that resolves by the bytes digest');
  else {
    const r = rows[0]; C = r.claim_id; cv = r.edge_version;
    note(`claim C ${short(C)} (REL "${r.subject}" ${r.predicate} "${r.object}"): the edge ${short(r.edge_id)} rests on C@${r.edge_version}; the claim's latest version is ${r.latest} (confidence ${r.latest_confidence ?? '—'}); its lineage names record ${short(r.evd_id)}@${r.evd_version} (${r.byte_length} bytes) by the bytes digest`);
    const current = Number(r.latest_confidence ?? 0); const corrected = Math.abs(current - 0.9) < 1e-9 ? 0.85 : 0.9;
    const t0 = Date.now();
    let caseId = null;
    const rq = await requestReview(C, r.latest, `the corridor review re-weighs this relationship: the confidence recorded at version ${r.latest} is challenged (the B16 demonstration)`);
    if (rq.ok) { caseId = rq.body.review.caseId; ok(`the administrator challenged C@${r.latest}: review case ${short(caseId)} queued (${rq.body.review.reason})`); }
    else if (rq.status === 409 || /already queued/.test(rq.body?.message ?? '')) {
      caseId = (await q(`select case_id::text from intelligence.review_current where claim_object_id = $1 and state = 'queued' order by opened_at desc limit 1`, [C]))[0]?.case_id ?? null;
      if (caseId === null) fail('review/request (admin)', rq); else note(`C@${r.latest} was already queued for review (case ${short(caseId)}, a previous run that did not decide it): decided now`);
    } else fail('review/request (admin)', rq);
    if (caseId !== null) {
      const dec = await decideReview(caseId, { decision: 'correct', reason: `the corridor review sets the confidence of this relationship to ${corrected} (the B16 demonstration of a corrected version)`, correctedValue: { confidence: corrected } });
      if (!dec.ok) fail('review/decide (admin)', dec);
      else {
        cvNew = Number(dec.body.review.newVersion);
        const lineage = await q(`select claim_version::int, evidence_object_id::text, evidence_digest from intelligence.claim_lineage where claim_object_id = $1 order by claim_version`, [C]);
        const hasNew = lineage.some((l) => l.claim_version === cvNew);
        if (cvNew === r.latest + 1 && hasNew) ok(`the administrator corrected C@${r.latest} → C@${cvNew} (confidence ${corrected}; state ${dec.body.review.state}); the lineage rows of C: ${lineage.map((l) => `v${l.claim_version} → ${short(l.evidence_object_id)}`).join(', ')} — every version has its own row`);
        else bad(`the correction: newVersion ${cvNew}, lineage ${JSON.stringify(lineage)}`);
        // N9: the relationships subscriber runs on the demonstration — the act waits for its delivery to settle and prints what the ledger holds.
        let outbox = null; let deliveries = [];
        for (let i = 0; i < 10 && outbox === null; i += 1) {
          outbox = (await q(`select id::text, status from objects.object_outbox where event_type = 'MemoryCorrected' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload -> 'claims' ? $4 order by created_at desc limit 1`, [T, D, new Date(t0 - 1000), C]))[0] ?? null;
          if (outbox === null) await sleep(1000);
        }
        if (outbox !== null) {
          for (let i = 0; i < 30; i += 1) {
            deliveries = await q(`select consumer_kind, state, items_applied, last_error from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [outbox.id]);
            if (deliveries.length > 0 && deliveries.every((d) => ['applied', 'failed', 'refused'].includes(d.state))) { await sleep(1500); break; }
            await sleep(1000);
          }
        }
        const edges = await edgesOfClaim(C);
        const original = edges.find((e) => e.edge_id === r.edge_id) ?? null;
        const successor = edges.find((e) => e.claim_version === cvNew) ?? null;
        note(`MemoryCorrected/claim.corrected ${outbox === null ? 'not seen in the outbox within 10 s' : `${short(outbox.id)} ${outbox.status}; deliveries: ${deliveries.length === 0 ? 'none' : deliveries.map((d) => `${d.consumer_kind} ${d.state}${(d.items_applied ?? []).length > 0 ? ` (${d.items_applied.map((x) => x.effect).join(', ')})` : ''}`).join(', ')}`}`);
        if (original !== null && original.claim_version === cv) ok(`what the ledger holds: the edge ${short(original.edge_id)} STILL NAMES C@${cv} — state ${original.state}${original.superseded_by ? `, superseded by ${short(original.superseded_by)}` : ''}; ${successor === null ? `no edge rests on C@${cvNew} (the subscriber asserted no successor)` : `a successor edge ${short(successor.edge_id)} asserted on C@${cvNew} by the subscription's principal (${short(successor.asserted_by)})`} — an edge is never reinterpreted as resting on another version; the closure will carry BOTH versions`);
        else bad(`the edge after the correction: ${JSON.stringify(original)}`);
      }
    }
  }
}

/* ── 2. THE EXPORT E1 WITH ITS VERSIONED CLOSURE ─────────────────────────── */
console.log('\n2. THE EXPORT E1 WITH ITS VERSIONED CLOSURE — P. Novák exports the records that carry the knowledge; approved; executed; verified — links.json /2 lists C@v and C@v+1 as exact versions; the pair check; the counterexample; then delivered to the station and acknowledged');
let E1 = null; let e1Dir = null; let e1Links = null; let station = null;
{
  const withKnowledge = await targetsWithKnowledge(4);
  const ofClaim = C === null ? [] : await q(`select distinct o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier
      from intelligence.claim_lineage l join objects.canonical_objects o on o.object_id = l.evidence_object_id join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
      join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version where l.claim_object_id = $3 and ${ELIGIBLE}`, [T, D, C]);
  const targets = []; for (const t of [...ofClaim, ...withKnowledge]) if (!targets.some((x) => x.manifest_id === t.manifest_id) && targets.length < 4) targets.push(t);
  if (targets.length === 0) bad('no current NORDWERK internal evidence with confirmed rights to export');
  else {
    note(`the targets: ${targets.map((t) => `evidence ${short(t.id)}@${t.version} (${t.byte_length} bytes, tier ${t.tier})`).join(', ')}`);
    E1 = await runExport(originActs, targets.map((t) => t.manifest_id), 'the customer asks for its internal records WITH the knowledge derived from them, every exact claim version an edge or a lineage row names (B16: the versioned closure)', 'internal records and their derived knowledge under the internal ceiling; the customer\'s own tenant; the package to be exchanged with the mirror domain', 'E1 (p.novak)');
  }
  if (E1 !== null) {
    ok(`export E1 ${short(E1.id)}: ${E1.pkg.object_count} record(s), ${E1.pkg.byte_total} bytes — opened by P. Novák, approved by H. Bergmann, executed and verified; package digest ${String(E1.pkg.package_digest).slice(0, 16)}…, signed by ${E1.pkg.signing_key_id ?? 'no key'}`);
    e1Dir = join(vaultRoot('export'), T, D, E1.id);
    const manifest = readJson(join(e1Dir, 'manifest.json')); e1Links = readJson(join(e1Dir, 'links.json'));
    const block = manifest?.package?.links ?? null;
    if (block !== null && e1Links !== null && block.format === 'eye-customer-export-links/2' && e1Links.format === block.format) ok(`the closure: links.json format ${block.format} — ${block.claims} claim version(s), ${block.edges} edge(s), ${block.entities} entit${block.entities === 1 ? 'y' : 'ies'}, ${block.excluded} excluded — named by package.links inside the signed chain`);
    else bad(`the closure block: ${JSON.stringify(block)}; links.json format ${e1Links?.format}`);
    if (e1Links !== null && C !== null) {
      const versions = (e1Links.claims ?? []).filter((c) => c.object_id === C).map((c) => c.object_version).sort((a, b) => a - b);
      const edgesOnC = (e1Links.edges ?? []).filter((e) => e.claim?.object_id === C);
      const excludedOfC = (e1Links.excluded ?? []).filter((x) => x.object_id === C || x.claim?.object_id === C);
      if (versions.includes(cv) && versions.includes(cvNew) && edgesOnC.some((e) => e.claim.object_version === cv)) ok(`C ${short(C)} is listed as EXACT versions ${versions.map((v) => `C@${v}`).join(' and ')} (each with the lineage row of its own version); the edge(s) on C: ${edgesOnC.map((e) => `${short(e.edge_id)} → C@${e.claim.object_version} (${e.state})`).join(', ')} — the edge asserted on C@${cv} names C@${cv}, never C@${cvNew}${excludedOfC.length > 0 ? `; excluded of C: ${excludedOfC.map((x) => `${x.kind} ${x.gate}`).join(', ')}` : ''}`);
      else bad(`the closure's versions of C: ${JSON.stringify(versions)}; edges on C: ${JSON.stringify(edgesOnC.map((e) => [e.edge_id, e.claim.object_version, e.state]))}; excluded: ${JSON.stringify(excludedOfC)}`);
      const other = (e1Links.excluded ?? []).filter((x) => !(x.object_id === C || x.claim?.object_id === C));
      note(`the closure in all: ${(e1Links.claims ?? []).length} claim version(s) of ${new Set((e1Links.claims ?? []).map((c) => c.object_id)).size} claim(s); ${(e1Links.edges ?? []).length} edge(s); ${(e1Links.entities ?? []).length} entit(ies) with ${(e1Links.entities ?? []).reduce((n, e) => n + (e.identifiers?.length ?? 0), 0)} identifier(s) under ${(e1Links.identifier_systems ?? []).length} system(s); excluded ${other.length === 0 ? 'nothing else' : other.map((x) => `${x.kind} ${x.object_id ?? x.edge_id ?? x.entity_id ? short(x.object_id ?? x.edge_id ?? x.entity_id) : ''}${x.object_version !== undefined ? `@${x.object_version}` : ''} (${x.gate}${x.reason ? `: ${x.reason}` : ''})`).join('; ')}`);
    }
    const vd = runVerifier(e1Dir);
    if (vd.exit === 0 && vd.ok === true && vd.links.length === 3 && vd.links.every((c) => c.ok === true) && vd.closureFormat === 'eye-customer-export-links/2') ok(`the verifier on E1 (with the public key): PACKAGE OK — the pair check "${vd.links[2].name.slice(0, 60)}…": ${vd.links[2].detail}`);
    else bad(`the verifier on E1: exit ${vd.exit}, ok ${vd.ok}; links ${JSON.stringify(vd.links)} ${vd.stderr}`);
    // THE COUNTEREXAMPLE (Codex B15-F1) on scratch copies — each copy's links.json altered and the manifest's package.links block re-pointed at it
    // (the digest, the size, the counts), so that the closure's own checks run and what fails is what the alteration breaks: (a) the closure
    // carrying C@v+1 alone while the edge names C@v — the /1 shape — fails the PAIR check by content, and the chain by digest; (b) the edge REBASED
    // onto C@v+1 keeps the closure self-consistent (the pair check passes by membership) and still fails the signed chain: the closure is inside
    // the signature, so a rebase cannot be smuggled past it.
    if (e1Links !== null && C !== null && cv !== null) {
      const copy = (name, links) => {
        const d = join(scratch, name); mkdirSync(d);
        for (const f of readdirSync(e1Dir)) if (f !== 'links.json' && f !== 'manifest.json') copyFileSync(join(e1Dir, f), join(d, f));
        const bytes = Buffer.from(`${JSON.stringify(links, null, 2)}\n`, 'utf8'); writeFileSync(join(d, 'links.json'), bytes);
        const m = readJson(join(e1Dir, 'manifest.json'));
        m.package.links = { ...m.package.links, links_digest: createHash('sha256').update(bytes).digest('hex'), byte_length: bytes.byteLength, claims: links.claims.length, edges: links.edges.length, entities: links.entities.length, excluded: links.excluded.length };
        writeFileSync(join(d, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`); return d;
      };
      const chainFailed = (v) => v.failed.some((c) => /^chain: .*package_digest/.test(c.name)); const signatureFailed = (v) => v.failed.some((c) => /^signature: .*--public-key/.test(c.name));
      const la = { ...e1Links, claims: e1Links.claims.filter((c) => !(c.object_id === C && c.object_version === cv)) }; la.counts = { ...la.counts, claims: la.claims.length };
      const va = runVerifier(copy('b15-f1-shape', la));
      const pair = va.links.find((c) => /object_version/.test(c.name)) ?? null;
      if (va.ok === false && pair !== null && pair.ok === false && /never rebased|does not carry/.test(pair.detail ?? '') && chainFailed(va)) ok(`the counterexample (a scratch copy carrying C@${cvNew} alone while the edge names C@${cv} — the /1 shape; the manifest's package.links re-pointed at it): PACKAGE FAILED — the pair check: "${pair.detail}"; the chain fails too${publicPem !== null && signatureFailed(va) ? ', and the signature' : ''} (the closure is named inside the signed chain)`);
      else bad(`the counterexample: ok ${va.ok}; pair ${JSON.stringify(pair)}; failed ${JSON.stringify(va.failed.map((c) => c.name.slice(0, 40)))}`);
      const lb = { ...e1Links, edges: e1Links.edges.map((e) => (e.claim?.object_id === C && e.claim.object_version === cv ? { ...e, claim: { ...e.claim, object_version: cvNew } } : e)) };
      const vb = runVerifier(copy('rebased', lb));
      const pairB = vb.links.find((c) => /object_version/.test(c.name)) ?? null;
      if (vb.ok === false && pairB !== null && pairB.ok === true && chainFailed(vb)) ok(`the rebase (a scratch copy whose edge is moved onto C@${cvNew}, both versions carried, the manifest re-pointed): PACKAGE FAILED — the pair check passes by membership (the closure is self-consistent), the chain fails${publicPem !== null && signatureFailed(vb) ? ' and the signature does not verify' : ''}: a rebase cannot pass the signature`);
      else bad(`the rebase: ok ${vb.ok}; pair ${JSON.stringify(pairB)}; failed ${JSON.stringify(vb.failed.map((c) => c.name.slice(0, 40)))}`);
    }
    // C10: E1 delivered to the station at the end of scene 2 — the package the mirror domain reads.
    const ds = await listDestinations();
    station = ds.ok ? (ds.body.destinations ?? []).find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null : null;
    if (station === null) bad(`the transfer station ${STATION_KEY} of B13 is not declared in the origin domain`);
    else {
      const endpoint = String(field(station, 'endpoint') ?? STATION);
      const sdir = join(endpoint, T, D, E1.id);
      const dv = await deliver(E1.id, STATION_KEY);
      if (!dv.ok) fail(`export/deliver E1 to ${STATION_KEY} (h.bergmann)`, dv);
      else {
        const dl = dv.body.delivery ?? {}; const tar = join(sdir, 'package.tar');
        if (field(dl, 'state') === 'delivered' && existsSync(tar) && sha256File(tar) === E1.pkg.archive_digest) ok(`H. Bergmann delivered E1 to the station: delivery ${short(field(dl, 'delivery_id'))} attempt ${field(dl, 'attempt')} — ${rel(sdir)}/package.tar (${statSync(tar).size} bytes, sha256 the archive digest), package.sig, delivery.json`);
        else bad(`the station delivery of E1: ${JSON.stringify(dl).slice(0, 300)}`);
        const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, E1.id, ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
        console.log(indent(rc.stdout));
        const col = await collectReceipt(E1.id, String(field(dl, 'delivery_id')));
        if (rc.status === 0 && col.ok && field(col.body.delivery, 'state') === 'acknowledged') ok(`the demonstration recipient verified E1 (the links checks among the passes); H. Bergmann collected the receipt: ACKNOWLEDGED — the station holds the package the mirror domain will import`);
        else if (col.ok) bad(`the collect act: recipient exit ${rc.status}; ${JSON.stringify(col.body.delivery).slice(0, 200)}`); else fail('collect-receipt E1', col);
      }
    }
  }
}

/* ── 3. THE DESTINATION DOMAIN ───────────────────────────────────────────── */
console.log('\n3. THE DESTINATION DOMAIN — the mirror domain, its personas, the intake source contract, the station declared there; the import opened BEFORE any partner → QUARANTINED; the exchange partner declared');
let D2 = null; let keller = null; let fischer = null; let intake = null; let partner = null;
const X2 = () => `/v1/tenants/${T}/domains/${D2}`; const R2 = () => `${X2()}/retention`; const O2 = () => `${X2()}/observation`; const G2 = () => `${X2()}/graph`;
const adm2 = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', ...over });
const mk = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${keller.principalId}`, purposeId: 'retention', ...over });
const uf = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${fischer.principalId}`, purposeId: 'observation', ...over });
const hb2 = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const importOpen = (source) => call(`${R2()}/imports/open`, mk({ action: 'retention.import.open', objectType: 'RIM', consequence: 'C2' }), { source }, keller.token);
const importApprove = (id, packageDigest, rationale, envOver = hb2, token = bergmann.token) => call(`${R2()}/imports/${id}/approve`, envOver({ action: 'retention.import.approve', objectType: 'RIM', objectId: id, consequence: 'C2' }), { packageDigest, rationale }, token);
const importAdmit = (id, envOver = mk, token = keller.token) => call(`${R2()}/imports/${id}/admit`, envOver({ action: 'retention.import.admit', objectType: 'RIM', objectId: id, consequence: 'C2' }), {}, token);
const importGet = (id) => call(`${R2()}/imports/${id}/get`, mk({ action: 'retention.read', objectType: 'RIM', objectId: id, sideEffect: 'none' }), {}, keller.token);
const importsList = () => call(`${R2()}/imports/list`, mk({ action: 'retention.read', objectType: 'RIM', sideEffect: 'none' }), {}, keller.token);
const partnersList = () => call(`${R2()}/partners/list`, mk({ action: 'retention.read', objectType: 'RXP', sideEffect: 'none' }), {}, keller.token);
const partnerDeclare = (payload) => call(`${R2()}/partners/declare`, adm2({ action: 'retention.partner.declare', objectType: 'RXP', consequence: 'C2' }), payload, admin.token);
const partnerRetire = (id, reason) => call(`${R2()}/partners/${id}/retire`, adm2({ action: 'retention.partner.retire', objectType: 'RXP', objectId: id, consequence: 'C2' }), { reason }, admin.token);
const failedChecks = (checks) => (Array.isArray(checks) ? checks.filter((c) => c.ok === false) : []);
const checkLine = (c) => `${c.ok === null || c.ok === undefined ? 'note' : c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`;
/** The intake source contract of the mirror domain — the NORDWERK upload shape, declared for what it holds: the origin domain's signed packages. */
const intakeContract = () => ({
  source_key: INTAKE_KEY, name: 'NORDWERK exchange intake — packages admitted from the origin domain (SYNTHETIC)', publisher: 'NORDWERK ANTRIEBSTECHNIK GmbH (synthetic)',
  authority_class: 'authoritative', connector_kind: 'upload', acquisition_mode: 'replay', data_origin: 'synthetic',
  identity: { source_identity: INTAKE_KEY, publisher_identity: 'SYN-ORG-NORDWERK (synthetic entity; does not exist)', endpoints: [], scheme_allowlist: ['https'], cadence_seconds: 86_400, jitter_seconds: 0, collection_window: null },
  authority_and_rights: {
    owner: 'observation.operations', steward: 'm.keller', authority: 'Records admitted from the origin domain\'s signed export packages (synthetic)', legal_basis: 'Internal synthetic data exchanged between two domains of the same tenant for demonstration',
    rights_state: 'confirmed', licence: 'internal', permitted_use: ['internal analysis'], robots_policy: 'not applicable', purposes: ['observation'],
    classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none',
  },
  security_and_operations: {
    credential_ref: null,
    authentication_method: 'the governed import: a key-signed package from a declared exchange partner, opened by a retention steward, approved by the retention authority, admitted by the steward',
    authenticity_method: {
      transport_endpoint: 'not applicable — the package is read from a transfer station or presented inline; no transport was performed by this system',
      byte_integrity: 'SHA-256 digest verified against the package manifest at intake, at admission and on every read',
      source_origin: 'the exchange partner\'s Ed25519 signature over the package digest, verified against the declared public key',
      content_authenticity: 'the origin domain\'s own record, carried verbatim as digest-bound provenance (payload.imported_from)',
    },
    budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
    expected_schema: { media_types: ['text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'], required_fields: [], drift_tolerance: 0, max_bytes: 16_777_216 },
    freshness_expectation: { threshold_seconds: 604_800, expected_interval: 'weekly' },
    coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one package per exchange', expected_items_per_window: null, not_applicable_dimensions: ['latency', 'correction_lag', 'authenticity'], not_applicable_reason: 'the records are the origin domain\'s synthetic internal data carried by a signed package: there is no publisher to lag behind, no corrections channel, and no external origin beyond the partner\'s signature' },
    correction_channel: 'a corrected package from the origin domain, imported under the same gate',
    replay_set: 'nordwerk-uploads',
  },
  lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
});
{
  try {
    const d = await createDomain(admin, T, D2_NAME);
    D2 = d.domain.id; ok(`the mirror domain ${JSON.stringify(D2_NAME)}: ${short(D2)} ${d.created ? 'CREATED by the administrator (tenancy.domain.create)' : 'present (a previous run) — reused by name'}`);
  } catch (e) { bad(`the mirror domain: ${e.message}`); }
  if (D2 !== null) {
    const k = await createPersona(admin, T, { displayName: 'M. Keller — retention steward (mirror)', loginName: 'm.keller', password: PW, roleCode: 'retention_steward', domainId: D2 });
    const f = await createPersona(admin, T, { displayName: 'U. Fischer — collection manager (mirror)', loginName: 'u.fischer', password: PW, roleCode: 'collection_manager', domainId: D2 });
    keller = k.session; fischer = f.session;
    if (keller !== null && fischer !== null) ok(`the personas: M. Keller (retention_steward, mirror) ${k.created ? 'created' : 'present'}; U. Fischer (collection_manager, mirror) ${f.created ? 'created' : 'present'} — each opens a session with its own credential`);
    else { bad(`the personas: m.keller ${k.session === null ? `NOT available (${k.status} ${k.message ?? ''})` : 'ok'}; u.fischer ${f.session === null ? `NOT available (${f.status} ${f.message ?? ''})` : 'ok'}`); }
  }
  if (keller !== null && fischer !== null) {
    // THE INTAKE SOURCE CONTRACT: registered by the administrator, approved and activated by U. Fischer (a registrar never approves their own registration).
    const ls = await call(`${O2()}/sources/list`, uf({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), {}, fischer.token);
    let src = ls.ok ? (ls.body.sources ?? []).find((s) => s.source_key === INTAKE_KEY) ?? null : null;
    if (src === null) {
      const rg = await call(`${O2()}/sources/register`, adm2({ action: 'observation.source.register', objectType: 'SRC' }), { contract: intakeContract() }, admin.token);
      if (!rg.ok) fail('sources/register (admin, mirror)', rg);
      else {
        const sourceId = rg.body.source.sourceId;
        const ap = await call(`${O2()}/sources/${sourceId}/approve`, uf({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }), { contractVersion: 1, decision: 'approve', reason: 'the intake contract reviewed: the origin domain\'s packages, signed by the declared partner, under the internal ceiling' }, fischer.token);
        const tr = ap.ok ? await call(`${O2()}/sources/${sourceId}/transition`, uf({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }), { contractVersion: 1, target: 'active', reason: 'approved for the exchange' }, fischer.token) : null;
        if (!ap.ok || tr === null || !tr.ok) fail('sources approve/transition (u.fischer)', ap.ok ? tr : ap);
        const again = await call(`${O2()}/sources/list`, uf({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), {}, fischer.token);
        src = again.ok ? (again.body.sources ?? []).find((s) => s.source_key === INTAKE_KEY) ?? null : null;
      }
    } else note(`the intake source ${INTAKE_KEY} is already registered (a previous run): ${src.lifecycle_state}, rights ${src.rights_state}`);
    if (src !== null && src.lifecycle_state === 'active' && src.rights_state === 'confirmed' && src.connector_kind === 'upload') { intake = { sourceId: src.source_id, contractVersion: Number(src.contract_version) }; ok(`the intake source contract ${INTAKE_KEY}@${intake.contractVersion} (${short(intake.sourceId)}): upload kind, ACTIVE, rights CONFIRMED, ceiling ${src.classification_ceiling}, residency ${src.residency} — the contract the imported manifests are recorded under; its ceiling is the import's policy gate`); }
    else bad(`the intake source: ${JSON.stringify(src === null ? null : { state: src.lifecycle_state, rights: src.rights_state, kind: src.connector_kind }).slice(0, 200)}`);
    // THE STATION declared in the mirror domain (the same directory; a destination is per domain).
    const dl = await call(`${R2()}/destinations/list`, mk({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, keller.token);
    let st2 = dl.ok ? (dl.body.destinations ?? []).find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null : null;
    if (st2 === null) {
      const r = await call(`${R2()}/destinations/declare`, adm2({ action: 'retention.destination.declare', objectType: 'RDS', consequence: 'C2' }), { destinationKey: STATION_KEY, kind: 'transfer_station', endpoint: STATION, recipient: STATION_RECIPIENT_NAME, purpose: 'the transfer station the origin domain delivers to; the mirror domain reads its packages from here (the disconnected exchange tier)' }, admin.token);
      if (!r.ok) fail('destinations/declare (admin, mirror)', r); else { st2 = r.body.destination ?? r.body; ok(`the transfer station declared in the mirror domain: ${STATION_KEY} → ${rel(String(field(st2, 'endpoint')))} (the same directory the origin domain delivers to)`); }
    } else note(`the transfer station ${STATION_KEY} is already declared in the mirror domain (a previous run)`);
    // A RE-RUN: the partner already holds the key — retired with a reason so that the pre-partner quarantine is shown on every run.
    const pl = await partnersList();
    if (!pl.ok) fail('partners/list (m.keller)', pl);
    const active = pl.ok ? (pl.body.partners ?? []).find((p) => field(p, 'partner_key') === PARTNER_KEY && field(p, 'retired_at') === null) ?? null : null;
    if (active !== null) {
      const rt = await partnerRetire(String(field(active, 'partner_id')), 'the B16 act re-run: the pre-partner quarantine is shown again and the partner is declared afresh below');
      if (rt.ok) note(`the partner ${PARTNER_KEY} was declared on a previous run: RETIRED by the administrator (${short(field(active, 'partner_id'))}; its history kept) so that the import opened next finds no partner`); else fail('partners/retire (admin)', rt);
    }
    // THE IMPORT BEFORE ANY PARTNER: quarantined — no exchange partner of the mirror domain holds the key that signed E1.
    if (E1 !== null && st2 !== null) {
      const io = await importOpen({ kind: 'station', destinationKey: STATION_KEY, origin: { tenantId: T, domainId: D, actionId: E1.id } });
      if (!io.ok) fail('imports/open before the partner (m.keller)', io);
      else {
        const row = io.body.import ?? {}; const checks = io.body.checks ?? row.checks ?? [];
        const partnerCheck = checks.find((c) => /^partner:/.test(c.name) && c.ok === false) ?? null;
        if (row.state === 'quarantined' && row.verified === false && partnerCheck !== null && /no exchange partner/.test(partnerCheck.detail ?? '')) ok(`the import ${short(row.import_id)} opened from the station BEFORE any partner: QUARANTINED — "${partnerCheck.detail}"; ${failedChecks(checks).length} check(s) failed (${failedChecks(checks).map((c) => c.name.split(':')[0]).join(', ')}); the request and its evidence kept (archive ${String(row.archive_digest).slice(0, 12)}…, ${row.archive_size} bytes; manifest in quarantine ${row.manifest_locator ? 'yes' : 'no'}); the station package stays where it is`);
        else bad(`the pre-partner import: state ${row.state}; failed ${JSON.stringify(failedChecks(checks).map((c) => c.name))}`);
        for (const c of failedChecks(checks)) console.log(`      ${checkLine(c)}`);
      }
    }
    // THE PARTNER: the origin domain's key, declared by the administrator with the intake contract.
    if (publicPem === null) bad('no demonstration public key to declare the partner with');
    else if (intake !== null) {
      const r = await partnerDeclare({ partnerKey: PARTNER_KEY, party: 'NORDWERK ANTRIEBSTECHNIK GmbH — the origin domain "Supply Corridor Intelligence" (SYNTHETIC)', purpose: 'the mirror domain admits the origin domain\'s customer export packages signed by the demonstration key', publicKeyPem: publicPem, intakeSourceId: intake.sourceId, intakeContractVersion: intake.contractVersion });
      if (!r.ok) fail('partners/declare (admin, mirror)', r);
      else { partner = r.body.partner ?? r.body; ok(`the exchange partner ${PARTNER_KEY} declared by the administrator: key ${field(partner, 'key_id')} (${field(partner, 'algorithm')}), intake ${INTAKE_KEY}@${field(partner, 'intake_contract_version')}, party "${String(field(partner, 'party')).slice(0, 40)}…" — a partner IS a key; the public material only`); }
    }
  }
}

/* ── 4. THE EXCHANGE ─────────────────────────────────────────────────────── */
console.log('\n4. THE EXCHANGE — M. Keller opens the import from the station: VERIFIED (the fifteen checks); the opener\'s approval refused; H. Bergmann approves on the digest; the approver\'s admission refused; M. Keller admits: ADMITTED — the map, the host, the receipt');
let imp = null; let impGet = null; let mapOf = null; let admittedRecords = [];
if (E1 === null || partner === null || keller === null) bad('no export, no partner or no steward: nothing to import');
else {
  const io = await importOpen({ kind: 'station', destinationKey: STATION_KEY, origin: { tenantId: T, domainId: D, actionId: E1.id } });
  if (!io.ok) fail('imports/open (m.keller)', io);
  else {
    imp = io.body.import ?? {}; const checks = io.body.checks ?? imp.checks ?? [];
    for (const c of checks) console.log(`      ${checkLine(c)}`);
    const passes = checks.filter((c) => c.ok === true).length; const notes = checks.filter((c) => c.ok === null || c.ok === undefined).length;
    if (imp.state === 'verified' && imp.verified === true && imp.package_digest === E1.pkg.package_digest && failedChecks(checks).length === 0) ok(`the import ${short(imp.import_id)} opened from the station (delivery.json the exchange): VERIFIED — ${checks.length} checks (${passes} passed, ${notes} note${notes === 1 ? '' : 's'}); the package digest recomputed ${String(imp.package_digest).slice(0, 16)}… = E1's; the partner ${PARTNER_KEY} holds the key; ${(io.body.items ?? []).length} item(s) planned (${[...new Set((io.body.items ?? []).map((i) => `${i.kind}/${i.disposition}`))].join(', ')})`);
    else bad(`the import: state ${imp.state}; failed ${JSON.stringify(failedChecks(checks).map((c) => `${c.name} — ${c.detail}`))}`);
    if (imp.state === 'verified') {
      const self = await importApprove(imp.import_id, imp.package_digest, 'the opener approving its own import', mk, keller.token);
      if (self.status === 403) ok(`the opener's own approval refused: 403 — "${self.body?.message ?? ''}"`); else bad(`the opener's approval: ${self.status} ${self.body?.message ?? ''}`);
      const ap = await importApprove(imp.import_id, imp.package_digest, 'the origin domain\'s package, verified against the partner\'s key; the records under the internal ceiling of the intake contract');
      if (ap.ok && ap.body.import?.state === 'approved') ok(`H. Bergmann approved on the package digest ${String(imp.package_digest).slice(0, 16)}…: state approved at ${iso(ap.body.import.approved_at)}`); else fail('imports/approve (h.bergmann)', ap);
      const selfAdmit = await importAdmit(imp.import_id, hb2, bergmann.token);
      if (selfAdmit.status === 403) ok(`the approver's own admission refused: 403 — "${selfAdmit.body?.message ?? ''}"`); else bad(`the approver's admission: ${selfAdmit.status} ${selfAdmit.body?.message ?? ''}`);
      const ad = await importAdmit(imp.import_id);
      if (!ad.ok) fail('imports/admit (m.keller)', ad);
      else {
        imp = ad.body.import ?? imp;
        if (imp.state === 'admitted') ok(`M. Keller admitted: ADMITTED at ${iso(imp.admitted_at)} after ${imp.attempts} attempt(s) — batches ${(ad.body.batches ?? []).map((b) => `${b.kind} ×${b.count}`).join(', ')}; counts ${JSON.stringify(imp.counts ?? {})}`);
        else bad(`the admission: state ${imp.state}; ${JSON.stringify(ad.body).slice(0, 300)}`);
      }
    }
    // THE MAP: origin id@version → the id this installation minted; C'@v and C'@v+1 under ONE new id.
    const g = await importGet(imp.import_id);
    if (!g.ok) fail('imports/get (m.keller)', g);
    else {
      impGet = g.body; const items = impGet.items ?? [];
      writeFileSync(join(scratch, `import-${imp.import_id}.json`), JSON.stringify(impGet, null, 2));
      const idOf = (it) => { const a = it.admitted ?? it.planned ?? {}; return a.object_id ?? a.entity_id ?? a.edge_id ?? a.identifier_id ?? null; };
      mapOf = new Map(items.filter((it) => it.disposition === 'admitted' || it.disposition === 'reused').map((it) => [it.origin_ref, idOf(it)]));
      const records = items.filter((it) => it.kind === 'record'); admittedRecords = records.filter((it) => it.disposition === 'admitted' || it.disposition === 'reused');
      const claims = items.filter((it) => it.kind === 'claim'); const entities = items.filter((it) => it.kind === 'entity'); const edges = items.filter((it) => it.kind === 'edge'); const identifiers = items.filter((it) => it.kind === 'identifier'); const exclusions = items.filter((it) => it.kind === 'exclusion');
      const byDisp = (xs) => [...xs.reduce((m, it) => m.set(it.disposition + (it.gate ? ` (${it.gate})` : ''), (m.get(it.disposition + (it.gate ? ` (${it.gate})` : '')) ?? 0) + 1), new Map()).entries()].map(([k, n]) => `${n} ${k}`).join(', ');
      note(`the items: records ${byDisp(records)}; claim versions ${byDisp(claims)}; entities ${byDisp(entities)}; edges ${byDisp(edges)}; identifiers ${byDisp(identifiers)}; origin exclusions ${exclusions.length}`);
      for (const it of records) console.log(`      record ${it.origin_ref} → ${idOf(it) ?? '(no id)'}@${it.admitted?.object_version ?? String(it.origin_ref).split('@')[1]}  ${it.disposition}${it.gate ? ` (${it.gate}: ${it.reason ?? ''})` : ''}`);
      const cItems = claims.filter((it) => String(it.origin_ref).startsWith(`${C}@`));
      const cIds = new Set(cItems.map(idOf).filter((x) => x !== null));
      for (const it of claims) console.log(`      claim  ${it.origin_ref} → ${idOf(it) ?? '(no id)'}@${it.admitted?.object_version ?? String(it.origin_ref).split('@')[1]}  ${it.disposition}${it.gate ? ` (${it.gate}: ${it.reason ?? ''})` : ''}`);
      if (C !== null && cItems.length >= 2 && cIds.size === 1 && cItems.every((it) => it.disposition === 'admitted' || it.disposition === 'reused') && cItems.every((it) => Number(it.admitted?.object_version ?? String(it.origin_ref).split('@')[1]) === Number(String(it.origin_ref).split('@')[1]))) ok(`the map keeps the versions: ${cItems.map((it) => `C@${String(it.origin_ref).split('@')[1]} → C'@${it.admitted?.object_version ?? String(it.origin_ref).split('@')[1]}`).join(', ')} under ONE new id ${short([...cIds][0])} — a new id per origin id, version numbers preserved (DP-47-003: identity recoverable through imported_from and this map)`);
      else bad(`the map of C: ${JSON.stringify(cItems.map((it) => [it.origin_ref, idOf(it), it.disposition, it.gate]))}`);
      const eventsLine = (impGet.events ?? []).map((e) => e.event.replace('import.', '')).join(' → ');
      note(`the import's events: ${eventsLine || 'none listed'}${(impGet.events ?? []).some((e) => e.event === 'import.finalized') ? ` (the admitted records' quarantine copies tombstoned: ${JSON.stringify((impGet.events ?? []).find((e) => e.event === 'import.finalized')?.details ?? {})})` : ''}`);
      const receipt = impGet.receipt ?? io.body.importReceipt ?? null;
      if (receipt !== null && receipt.verified === true && receipt.package_digest === E1.pkg.package_digest) ok(`the import's receipt: receipt ${short(receipt.receipt_id)} — verified true, package digest E1's, recipient ${JSON.stringify(receipt.recipient ?? '?')}, verifier ${JSON.stringify(receipt.verifier ?? '?')} (the importer's record of the exchange; ES-08-004)`); else bad(`the import's receipt: ${JSON.stringify(receipt).slice(0, 300)}`);
    }
    // THE HOST: custody.imported per record; the mirror's manifests under the intake contract; the evidence download route in the mirror; the graph.
    if (imp.state === 'admitted' && intake !== null && admittedRecords.length > 0) {
      const cust = await q(`select count(*)::int n from observation.custody_events where event = 'custody.imported' and domain_id = $1 and details ->> 'import_id' = $2`, [D2, imp.import_id]);
      const mans = await q(`select count(*)::int n from observation.blob_manifests where tenant_id = $1 and domain_id = $2 and source_id = $3 and contract_version = $4`, [T, D2, intake.sourceId, intake.contractVersion]);
      const admittedOnly = admittedRecords.filter((it) => it.disposition === 'admitted').length;
      if (cust[0].n === admittedOnly && mans[0].n >= admittedRecords.length) ok(`the host: custody.imported ${cust[0].n} row(s) for this import (one per admitted record); ${mans[0].n} manifest(s) in the mirror under the intake contract ${INTAKE_KEY}@${intake.contractVersion}`); else bad(`the host: custody.imported ${cust[0].n} (admitted ${admittedOnly}); manifests under the intake ${mans[0].n} (records ${admittedRecords.length})`);
      const first = admittedRecords[0]; const newId = first.admitted?.object_id ?? first.planned?.object_id; const originId = String(first.origin_ref).split('@')[0];
      const originObject = (readJson(join(e1Dir, 'manifest.json'))?.objects ?? []).find((o) => o.object_id === originId) ?? null;
      const dl = await call(`${O2()}/evidence/${newId}/download`, uf({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: newId, sideEffect: 'none' }), {}, fischer.token);
      if (dl.ok && originObject !== null && dl.body.download?.integrity === 'verified' && createHash('sha256').update(Buffer.from(dl.body.download.base64, 'base64')).digest('hex') === originObject.bytes.content_digest) {
        const newManifestId = first.admitted?.manifest_id ?? (await q(`select (o.payload ->> 'manifest_id') manifest_id from objects.canonical_objects o where o.domain_id = $1 and o.object_id = $2 order by o.object_version desc limit 1`, [D2, newId]))[0]?.manifest_id ?? null;
        const retrieved = newManifestId === null ? null : (await q(`select source_id::text, contract_version::int from observation.custody_events where event = 'custody.retrieved' and manifest_id = $1 order by occurred_at desc limit 1`, [newManifestId]))[0] ?? null;
        ok(`U. Fischer downloaded the imported record ${short(newId)} through the mirror's evidence route: ${dl.body.download.byteLength} bytes, integrity verified, sha256 = the origin record's bytes digest ${String(originObject.bytes.content_digest).slice(0, 16)}…; custody.retrieved ${retrieved === null ? 'not found' : `names the intake contract ${retrieved.source_id === intake.sourceId ? `${INTAKE_KEY}@${retrieved.contract_version}` : `${short(retrieved.source_id)}@${retrieved.contract_version} (NOT the intake)`}`}`);
      } else bad(`the evidence download in the mirror: ${dl.status} ${dl.body?.message ?? JSON.stringify(dl.body?.download ?? {}).slice(0, 200)}`);
      const el = await call(`${G2()}/edges/list`, mk({ action: 'graph.read', objectType: 'EDG', sideEffect: 'none' }), { limit: 500 }, keller.token);
      const cNew = C === null ? null : mapOf.get(`${C}@${cv}`) ?? null;
      const onC = el.ok && cNew !== null ? (el.body.edges ?? []).filter((e) => String(e.claim_object_id) === String(cNew)) : [];
      const dbEdges = cNew === null ? [] : await q(`select edge_id::text, claim_version::int, state from graph.edges_current where domain_id = $1 and claim_object_id = $2 order by asserted_at`, [D2, cNew]);
      if (el.ok && cNew !== null && dbEdges.some((e) => e.claim_version === cv)) ok(`the mirror's graph: ${el.body.total} edge(s) visible now; the edge(s) on C' ${short(cNew)} in the ledger: ${dbEdges.map((e) => `${short(e.edge_id)} → C'@${e.claim_version} (${e.state})`).join(', ')}${onC.length > 0 ? ` — graph/edges/list shows ${onC.map((e) => `${short(e.edge_id)} claim_version ${e.claim_version}`).join(', ')}` : ' — the superseded one is not in the visible-now view, as recorded'}`);
      else bad(`the mirror's graph: ${el.status}; edges on C' ${JSON.stringify(dbEdges)}`);
      const ents = await q(`select e.entity_id::text, e.entity_type, e.canonical_name, (select string_agg(i.system_key || ' ' || i.identifier_value, ', ') from graph.entity_identifiers i where i.entity_id = e.entity_id) ids from graph.entities_current e where e.domain_id = $1 and e.entity_id = any($2::uuid[]) order by e.canonical_name`, [D2, [...mapOf.entries()].filter(([k]) => k.startsWith('entity:')).map(([, v]) => v)]);
      if (ents.length > 0) ok(`the mirror's entities: ${ents.map((e) => `${e.canonical_name} (${e.entity_type}${e.ids ? `; ${e.ids}` : ''})`).join('; ')}`); else note('no entity was carried by this import (the closure named none)');
    }
  }
}

/* ── 5. THE RE-EXPORT E2 FROM THE MIRROR ─────────────────────────────────── */
console.log('\n5. THE RE-EXPORT E2 FROM THE MIRROR — M. Keller exports the imported manifests; H. Bergmann approves; executed; verified; the customer\'s round-trip tool on E1, E2 and the import\'s record');
let E2 = null;
if (imp === null || imp.state !== 'admitted' || admittedRecords.length === 0) bad('no admitted import to re-export');
else {
  const mirrorActs = {
    open: (payload) => call(`${R2()}/actions/open`, mk({ action: 'retention.action.open', objectType: 'RTA' }), payload, keller.token),
    resolve: (id) => call(`${R2()}/actions/${id}/resolve`, mk({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, keller.token),
    approve: (id, digest, rationale) => call(`${R2()}/actions/${id}/approve`, hb2({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token),
    execute: (id) => call(`${R2()}/actions/${id}/execute`, mk({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, keller.token),
    verify: (id) => call(`${R2()}/actions/${id}/verify`, mk({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, keller.token),
  };
  // The imported manifests, read from the mirror's canonical records under the ids the import minted (the map's `admitted` carries them too).
  const newIds = admittedRecords.map((it) => it.admitted?.object_id ?? it.planned?.object_id).filter((x) => typeof x === 'string');
  const manifestIds = (await q(`select distinct (o.payload ->> 'manifest_id') manifest_id from objects.canonical_objects o where o.domain_id = $1 and o.object_type = 'EVD' and o.object_id = any($2::uuid[])`, [D2, newIds])).map((r) => r.manifest_id).filter((m) => typeof m === 'string');
  E2 = await runExport(mirrorActs, manifestIds, 'the mirror domain re-exports the records it admitted from the origin, with the knowledge carried: the round trip (B16)', 'the imported records under the intake contract\'s internal ceiling; the customer\'s own tenant', 'E2 (m.keller)');
  if (E2 !== null) {
    ok(`export E2 ${short(E2.id)} from the mirror: ${E2.pkg.object_count} record(s), ${E2.pkg.byte_total} bytes — opened by M. Keller, approved by H. Bergmann, executed and verified; signed by ${E2.pkg.signing_key_id ?? 'no key'} (the tenant's key signs both domains' packages)`);
    const e2Dir = join(vaultRoot('export'), T, D2, E2.id);
    const mapFile = join(scratch, `import-${imp.import_id}.json`);
    const cr = spawnSync(process.execPath, [COMPARE, '--origin', e1Dir, '--reexport', e2Dir, '--map', mapFile, ...(publicPem === null ? [] : ['--origin-public-key', PUB_PEM_PATH, '--reexport-public-key', PUB_PEM_PATH])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    console.log(indent(cr.stdout));
    if (cr.status === 0 && /ROUND TRIP OK/.test(cr.stdout)) ok(`the customer's round-trip tool (scripts/retention/compare-round-trip.mjs): ${String(cr.stdout).trim().split('\n').pop()} — the bytes unchanged, the headers preserved, the provenance recovering every origin identity, the claim versions never renumbered, the edges on their exact versions (DP-47-006 "round-trip fixtures" as a tool the customer runs)`);
    else bad(`the round-trip tool: exit ${cr.status} ${String(cr.stderr ?? '').slice(0, 300)}`);
    const l2 = readJson(join(e2Dir, 'links.json')); const m2 = readJson(join(e2Dir, 'manifest.json'));
    const cNew = C === null ? null : mapOf?.get(`${C}@${cv}`) ?? null;
    if (l2 !== null && cNew !== null) {
      const versions = (l2.claims ?? []).filter((c) => c.object_id === cNew).map((c) => c.object_version).sort((a, b) => a - b);
      const edgesOnC = (l2.edges ?? []).filter((e) => e.claim?.object_id === cNew);
      if (versions.includes(cv) && versions.includes(cvNew) && edgesOnC.some((e) => e.claim.object_version === cv)) ok(`E2's closure (${l2.format}): C' ${short(cNew)} listed as ${versions.map((v) => `C'@${v}`).join(' and ')}; the edge(s) on C': ${edgesOnC.map((e) => `${short(e.edge_id)} → C'@${e.claim.object_version} (${e.state})`).join(', ')} — the edge rests on version ${cv} in the mirror as it did in the origin`);
      else bad(`E2's closure of C': versions ${JSON.stringify(versions)}; edges ${JSON.stringify(edgesOnC.map((e) => [e.edge_id, e.claim.object_version]))}`);
      const pf = (m2?.objects ?? [])[0]?.payload?.imported_from ?? null;
      if (pf !== null && pf.format === 'eye-import-provenance/1' && pf.import_id === imp.import_id && pf.package?.package_digest === E1.pkg.package_digest && typeof pf.object?.object_id === 'string' && Object.keys(pf.header ?? {}).length === 43) ok(`payload.imported_from on E2's first record: format ${pf.format}, import ${short(pf.import_id)}, partner ${pf.partner_key}, the origin package ${short(pf.package.action_id)} (digest ${String(pf.package.package_digest).slice(0, 12)}…, signed ${pf.package.signature?.key_id ?? '?'}), the origin object ${short(pf.object.object_id)}@${pf.object.object_version} (${pf.object.schema_ref}, canonical digest ${String(pf.object.content_digest).slice(0, 12)}…), the original 43-field header and payload verbatim — the identity recovered from the record itself`);
      else bad(`imported_from on E2's first record: ${JSON.stringify(pf).slice(0, 300)}`);
    }
  }
}

/* ── 6. HELD RECIPIENTS (Codex B14-F1) ───────────────────────────────────── */
console.log('\n6. HELD RECIPIENTS — a one-record export E3 delivered to the station; the recipient answers with a WRONG DIGEST: MISMATCHED; a delivery to the production destination: credential_unbound; the revocation notifies the station (held: confirmed), not the production destination');
if (station === null) bad('no transfer station in the origin domain');
else {
  let targets = await targetsIn('hot', 1);
  if (targets.length === 0) { targets = await targetsIn(null, 1); }
  const E3 = targets.length === 0 ? null : await runExport(originActs, targets.map((t) => t.manifest_id), 'a one-record export for the demonstration of held recipients (B16; Codex B14-F1)', 'one internal record under the ceiling; the customer\'s own tenant; the package to be revoked', 'E3 (p.novak)');
  if (E3 === null) bad('no export E3');
  else {
    ok(`export E3 ${short(E3.id)}: ${E3.pkg.object_count} record — opened, approved, executed and verified; archive digest ${String(E3.pkg.archive_digest).slice(0, 16)}…`);
    const endpoint = String(field(station, 'endpoint') ?? STATION); const sdir = join(endpoint, T, D, E3.id);
    const dv = await deliver(E3.id, STATION_KEY);
    const dl = dv.ok ? dv.body.delivery ?? {} : {};
    if (dv.ok && field(dl, 'state') === 'delivered') ok(`H. Bergmann delivered E3 to the station: delivery ${short(field(dl, 'delivery_id'))} attempt ${field(dl, 'attempt')} — delivered`); else fail('export/deliver E3 (h.bergmann)', dv);
    const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, E3.id, ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), '--recipient', STATION_RECIPIENT_NAME, '--wrong-digest'], { encoding: 'utf8' });
    console.log(indent(rc.stdout));
    const receipt = readJson(join(sdir, 'receipt.json'));
    const col = dv.ok ? await collectReceipt(E3.id, String(field(dl, 'delivery_id'))) : null;
    const evm = await lastEvent(E3.id, 'export.mismatched');
    if (rc.status === 0 && receipt !== null && receipt.control_mode === 'wrong-digest' && receipt.archive_digest !== E3.pkg.archive_digest && col !== null && col.ok && field(col.body.delivery, 'state') === 'mismatched' && evm !== null) ok(`the demonstration recipient answered with the archive digest's first byte flipped (control mode wrong-digest; verifier verdict ${receipt.verified ? 'OK' : 'FAILED'} beside it); H. Bergmann collected: MISMATCHED — export.mismatched carries both sides; the receipt kept on the delivery row (the package REACHED the station: a mismatched receipt proves it — Codex B14-F1)`);
    else bad(`the wrong-digest exchange: recipient exit ${rc.status}; receipt ${JSON.stringify(receipt).slice(0, 200)}; collect ${col === null ? 'not run' : `${col.status} ${JSON.stringify(col.body.delivery ?? col.body).slice(0, 200)}`}; export.mismatched ${evm === null ? 'NONE' : 'present'}`);
    const dp = await deliver(E3.id, PROD_KEY);
    const dlp = dp.body?.delivery ?? null;
    if (dp.ok && field(dlp, 'state') === 'failed' && field(dlp, 'failure_class') === 'credential_unbound') ok(`a delivery to the production destination ${PROD_KEY}: FAILED credential_unbound before any egress (the reference EYE_DST_NORDWERK is unbound on this host) — nothing is known to have reached it`);
    else note(`the delivery to ${PROD_KEY}: ${dp.status} ${field(dlp, 'state') ?? dp.body?.message ?? ''} ${field(dlp, 'failure_class') ?? ''} (${PROD_KEY} ${(await listDestinations()).body?.destinations?.some((x) => field(x, 'destination_key') === PROD_KEY && field(x, 'retired_at') === null) ? 'is declared' : 'is NOT declared on this demonstration'})`);
    const rv = await revoke(E3.id, 'the customer withdrew its request; every copy is to be destroyed (the B16 demonstration of held recipients)');
    if (!rv.ok) fail('export/revoke E3 (h.bergmann)', rv);
    else {
      const recipients = rv.body.revocation?.recipients ?? []; const notices = rv.body.notices ?? [];
      const st = recipients.find((r) => r.destination_key === STATION_KEY) ?? null; const ns = notices.find((n) => field(n.destination, 'destination_key') === STATION_KEY) ?? null;
      if (st !== null && st.held === 'confirmed' && st.delivery_state === 'mismatched' && !recipients.some((r) => r.destination_key === PROD_KEY) && ns !== null && ns.state === 'notified') ok(`H. Bergmann revoked E3: the destinations that HOLD the package: ${recipients.map((r) => `${r.destination_key} (delivery ${short(r.delivery_id)} attempt ${r.attempt}, ${r.delivery_state}; held: ${r.held})`).join(', ')} — the station notified (notice ${short(ns.notice_id)} attempt ${ns.attempt}, ${ns.state}); ${PROD_KEY} absent: nothing reached it`);
      else bad(`the revocation's recipients: ${JSON.stringify({ recipients, notices: notices.map((n) => ({ key: field(n.destination, 'destination_key'), state: n.state })) }).slice(0, 400)}`);
      const nx = await notify(E3.id, PROD_KEY);
      if (nx.status === 409 && /never received/.test(nx.body?.message ?? '')) ok(`a notice to ${PROD_KEY}: 409 — "${nx.body.message}"${/nothing is known to have reached it/.test(nx.body.message) ? ' (the refusal says what is proven, not what is assumed)' : ''}`); else bad(`the notice to ${PROD_KEY}: ${nx.status} ${nx.body?.message ?? ''}`);
      const rc2 = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, E3.id, '--revocation', '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
      console.log(indent(rc2.stdout));
      if (ns !== null) {
        const c1 = await collectNotice(E3.id, ns.notice_id);
        if (rc2.status === 0 && c1.ok && field(c1.body.notice, 'state') === 'acknowledged') ok(`the demonstration recipient answered the notice (the product had removed its copies); H. Bergmann collected: ACKNOWLEDGED at ${iso(field(c1.body.notice, 'acknowledged_at'))}`); else if (c1.ok) bad(`the notice's collect act: ${JSON.stringify(c1.body.notice).slice(0, 200)}`); else fail('revocation-notices/collect-receipt (h.bergmann)', c1);
      }
      const rows = await deliveryRows(E3.id);
      const stRow = rows.find((r) => r.destination_key === STATION_KEY) ?? null;
      if (stRow !== null && stRow.state === 'mismatched' && typeof stRow.receipt?.archive_digest === 'string' && stRow.receipt.archive_digest !== E3.pkg.archive_digest) ok(`the delivery ledger after the revocation: ${rows.map((r) => `${r.destination_key} attempt ${r.attempt} ${r.state}${r.failure_class ? ` (${r.failure_class})` : ''}`).join('; ')} — the mismatched receipt still on the station's delivery row (archive digest ${String(stRow.receipt.archive_digest).slice(0, 12)}… ≠ ${String(E3.pkg.archive_digest).slice(0, 12)}…${stRow.receipt.control_mode ? `; control mode ${stRow.receipt.control_mode} recorded in it` : ''}): the evidence preserved (DP-47-005)`);
      else bad(`the delivery ledger: ${JSON.stringify(rows.map((r) => [r.destination_key, r.state, r.failure_class, r.receipt?.archive_digest?.slice(0, 12)]))}`);
    }
  }
}

/* ── 7. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n7. THE STATE — and the two stated limits');
if (keller !== null && D2 !== null) {
  const il = await importsList();
  if (il.ok) for (const r of (il.body.imports ?? il.body.rows ?? []).slice(0, 8)) note(`import ${short(r.import_id)} — ${r.state}; origin action ${short(r.origin?.action_id)}; partner ${r.partner_id ? short(r.partner_id) : 'none'}; opened ${iso(r.opened_at)}${r.admitted_at ? `, admitted ${iso(r.admitted_at)}` : ''}${r.counts && Object.keys(r.counts).length > 0 ? `; counts ${JSON.stringify(r.counts)}` : ''}`); else fail('imports/list', il);
  const pl = await partnersList();
  if (pl.ok) for (const p of pl.body.partners ?? []) note(`partner ${field(p, 'partner_key')} — key ${field(p, 'key_id')}; intake ${field(p, 'intake_source_id') ? short(field(p, 'intake_source_id')) : '?'}@${field(p, 'intake_contract_version')}; ${field(p, 'retired_at') ? `RETIRED ${iso(field(p, 'retired_at'))}` : 'active'}`);
}
if (E1 !== null) { const rd = await exportGet(E1.id); if (rd.ok) note(`export E1 ${short(E1.id)}: package.links ${JSON.stringify(rd.body.manifest?.package?.links ?? null)}; deliveries ${(rd.body.deliveries ?? []).map((d) => `${field(d, 'destination_key')} attempt ${field(d, 'attempt')} ${field(d, 'state')}`).join(', ') || 'none'}`); }
if (E2 !== null) note(`export E2 ${short(E2.id)} from the mirror: ${E2.pkg.object_count} record(s), package digest ${String(E2.pkg.package_digest).slice(0, 16)}…`);
note('STATED LIMIT 1: the INLINE intake (the archive as base64 inside the governed payload) is bounded over the real listener by its JSON body limit — Nest\'s express default of 100 KiB, not changed by B16 — so the act imported from the TRANSFER STATION, which the product reads entry by entry; the customer\'s tool (scripts/retention/import-package.mjs open --file) measures the governed body and refuses one above the limit before sending it, naming the station path to use instead; the inline path is the harness\'s (phase6-retention-b16 I1, the controller driven in process)');
note('STATED (the revocation check): check 14 is decided on the origin\'s own export ledger only when the origin is THIS installation — as here, the mirror being a second domain of the tenant; for a foreign origin the check is a NOTE on the sender\'s unsigned exchange statement (delivery.json), never a pass on unsigned data, and the origin\'s revocation reaches this domain only through its partner\'s notice; the origin\'s revocation of a package already ADMITTED is not propagated into the importing domain (remaining work, stated in the records)');
note('STATED LIMIT 2: the positive https exchange — a delivery acknowledged over TLS, the held classification of a mismatched https receipt, a notice retried — remains the harness\'s (phase6-retention-b14 H1–H3, phase6-retention-b16 R1): the demonstration\'s egress refuses every loopback and private address by design, so its https destinations record FAILED transport/credential_unbound with nothing sent; a delivery through the production egress needs a recipient on a public address — the activation step');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: a relationship corrected into a second version and exported as EXACT versions with the edge on the version it rests on; the closure's counterexample caught by the customer's pair check and the rebase by the signature; a second domain of the tenant admitting the origin's signed package through the two-person gate — quarantined while no partner held the key, verified once the partner was declared, approved on the digest, admitted under new ids with the origin identity recoverable from every record and from the import's map; the same records re-exported from the mirror and the customer's round-trip tool proving the trip; a mismatched station receipt counted as a HELD copy at the revocation and the production destination that nothing reached left out, with the refusal saying so.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-retention-b16 on a fresh database): the inline intake through the controller; the refusals with the evidence preserved (a key no partner holds, a flipped record, a tampered closure, a chain-only package, a record above the intake ceiling, an edge naming a version not carried, a duplicate, a revoked origin, a withdrawn import); a 272 MB package imported from the station in constant memory (a sampled measurement); the https recipient's held classifications (mismatched, receipt_invalid, a 500 answer, a redirect after the body) and the pre-egress refusals that are not recipients; the entity reuse by authoritative identifier; the projection rebuild without drift. STATED, NOT DONE: a foreign installation as the partner (the activation step); subscribers do not learn of imported knowledge (the next batch).`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
