#!/usr/bin/env node
/**
 * CP-6 batch B17 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): IMPORTED KNOWLEDGE
 * PUBLISHED to the importing domain's subscribers, the ORIGIN'S REVOCATION PROPAGATED into the importing domain — the copies destroyed
 * where the product holds them, the SIGNED notice, the receipt on the origin's ledger — migration 0077 — exercised by the personas through
 * the REAL HTTP path, each scene stating the effect it produced on the host and in the ledgers, and where nothing happened, saying so.
 *
 *   1. THE SUBSCRIBERS: the origin domain's seven subscriptions checked against this process's consumers — the memory-mappings method
 *      changed in B17 (an import revoked → the identifiers of the entities it retired and the asserted edges with a retired end are
 *      proposed), so its live subscription is REVOKED and registered anew, the replacement replaying from the revoked cursor (the B8
 *      doctrine: a changed method is a new consumer); the MIRROR domain's seven subscribers registered by the administrator (the
 *      relationships subscriber with the demonstration's selection), owned by M. Keller; the status route in the mirror shows them and
 *      the worker that serves the domain's queue.
 *   2. THE STANDING IMPORT and the mirror building on it: the mirror's latest ADMITTED import of the NORDWERK knowledge (B16's on the
 *      first run; the previous run's E4 on a re-run) — its map read back; S. Roth declares an ASSUMPTION resting on a single-version
 *      imported REL claim (declared FIRST: a strategy.declared event names the claims it rests on, and a verified twin citing one would be
 *      marked unverified by it — the twins consumer selects by cited claim); K. Vogel declares a TWIN bounded by the imported NORDWERK
 *      entity, opens version 1 (known now; no world cut-off) and grounds ONE estimated element citing the imported RECORD that carries the
 *      claim (the twin route resolves a `claim` citation to a CLM object only — an imported REL claim is reached through the assumption and
 *      the walk, stated), admitted as incomplete (no run may use it) → VERIFIED.
 *   3. THE ORIGIN REVOKES the standing import's package: H. Bergmann revokes it — the answer names the RECIPIENTS (the station, held
 *      confirmed: the act prints the SIGNED revocation.json the product wrote there, runs the demonstration recipient with --revocation
 *      --public-key → "notice signature: VERIFIED by key …", then collects the receipt → ACKNOWLEDGED) and the IMPORTERS: the mirror's
 *      import notified with the same signed notice (recipient import:<tenant>/<domain>/<import>, held confirmed) and, after the origin's
 *      commit, the revocation EXECUTED in the mirror by the same principal — the imported edges RETRACTED with the reason, the created
 *      entities RETIRED (their identifiers kept), the claim versions and records WITHDRAWN by a new version each, the bytes tombstoned
 *      and gone from the evidence root, custody.tombstoned per record, the import REVOKED with its counts, the receipt ACKNOWLEDGED on the
 *      origin's notice row; the ONE GraphChanged/import.revoked with the walk, delivered to the mirror's six subscribers: the twin
 *      UNVERIFIED, the assumption in the walk's reach, the retrieval check verified, the memory-mappings proposals counted honestly.
 *   4. E4 → THE MIRROR: a NEW export of the same records with their derived knowledge (P. Novák; H. Bergmann approves) → delivered to the
 *      station, the recipient acknowledges → imported into the mirror by M. Keller (verified; H. Bergmann approves on the digest; admitted)
 *      — admitted AFRESH under NEW ids (a destroyed copy is never reused: the revoked import's items are not a reuse source) → the
 *      GraphChanged/import.admitted (the created identities, the edges, the claims and records; no walk) and its six deliveries, the
 *      ObservationRecorded rows counted. E4's import is LEFT admitted for the next run's scene 2.
 *   5. THE STATE and the stated limits.
 *
 * EACH RUN revokes the import the previous run (or B16) left admitted and leaves its own; the mirror never holds two live copies of the
 * NORDWERK knowledge. The mirror domain, its personas, its intake source, its station and its partner are reused when present (the partner
 * is NOT retired this time — B16's re-run rule served its pre-partner quarantine scene); the two new personas (K. Vogel, S. Roth) and the
 * mirror's subscriptions are the act's, idempotent by name and by kind. Nothing is cleaned. Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount, domainByName, createPersona } from '../phase4/governed.mjs';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann'); const weber = await who('j.weber');
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
const D2_NAME = 'NORDWERK Exchange Mirror (SYNTHETIC)'; const INTAKE_KEY = 'nordwerk-exchange-intake'; const PARTNER_KEY = 'nordwerk-origin';
const STATION_RECIPIENT = join(ROOT, 'scripts', 'retention', 'transfer-station-recipient.mjs');
const publicPem = existsSync(PUB_PEM_PATH) ? readFileSync(PUB_PEM_PATH, 'utf8') : null;
const indent = (text) => String(text ?? '').trim().split('\n').map((l) => `      ${l}`).join('\n');
// The seven subscriber kinds (B6; the relationships subscriber of B9) and the demonstration's selection for the seventh (register-subscriptions.mjs).
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'];
const SELECTION = { relationships: { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } };
const BROAD = KINDS.filter((k) => SELECTION[k] === undefined);

/* ── the governed acts (the origin domain) ───────────────────────────────── */
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const exportGet = (id) => call(`${R}/actions/${id}/export/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const deliver = (id, destinationKey) => call(`${R}/actions/${id}/export/deliver`, hb({ action: 'retention.export.deliver', objectType: 'RTA', objectId: id, consequence: 'C2' }), { destinationKey }, bergmann.token);
const collectReceipt = (id, deliveryId) => call(`${R}/actions/${id}/export/deliveries/${deliveryId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const revoke = (id, reason) => call(`${R}/actions/${id}/export/revoke`, hb({ action: 'retention.export.revoke', objectType: 'RTA', objectId: id, consequence: 'C2' }), { reason }, bergmann.token);
const collectNotice = (id, noticeId) => call(`${R}/actions/${id}/export/revocation-notices/${noticeId}/collect-receipt`, hb({ action: 'retention.export.acknowledge', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, bergmann.token);
const listDestinations = () => call(`${R}/destinations/list`, pn({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, novak.token);

/* ── the ledgers ─────────────────────────────────────────────────────────── */
const packageRow = async (id) => (await q(`select object_count::int, byte_total::int, package_digest, archive_digest, signing_key_id, revoked_at, revoke_reason from retention.export_packages where action_id = $1`, [id]))[0] ?? null;
const ELIGIBLE = `o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed' and s.source_key = 'nordwerk-internal'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)`;
/** The current NORDWERK internal evidence records with confirmed rights that carry derived knowledge (claims by lineage, edges), most derived first — B16's selection. */
const targetsWithKnowledge = (limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier,
      (select count(distinct l.claim_object_id) from intelligence.claim_lineage l where l.evidence_object_id = o.object_id)::int claims,
      (select count(*) from graph.edges_current e where e.evidence_object_id = o.object_id)::int edges
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where ${ELIGIBLE} order by 6 desc, 7 desc, o.recorded_at desc limit $3`, [T, D, limit]);
/** The same records by their origin ids (the standing import's record items name them) — those still current and exportable. */
const targetsByOrigin = (ids) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length::int, observation.manifest_tier(m.manifest_id) tier
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where ${ELIGIBLE} and o.object_id = any($3::uuid[]) order by o.recorded_at desc`, [T, D, ids]);
/** A customer export opened by the steward, approved by H. Bergmann on the resolved scope digest, executed by the steward and verified; the package row. */
async function runExport(manifestIds, reason, rationale, label) {
  const o = await open({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal', destination: 'export', expiresAfter: '7 days' }, retentionProfile: null, reason });
  if (!o.ok) { fail(`open export ${label}`, o); return null; }
  const id = o.body.action.actionId;
  const rs = await resolve(id);
  const ap = rs.ok ? await approve(id, rs.body.scope.scope_digest, rationale) : null;
  if (!rs.ok || ap === null || !ap.ok) { fail(`resolve/approve export ${label}`, rs.ok ? ap : rs); return null; }
  const ex = await execute(id);
  if (!ex.ok) { fail(`execute export ${label}`, ex); return null; }
  const vf = await verify(id);
  const pkg = await packageRow(id);
  if (!(vf.ok && vf.body.verification.verified === true && pkg !== null)) { bad(`the export ${label} did not verify: ${JSON.stringify(vf.body?.verification ?? vf.body).slice(0, 300)}`); return null; }
  return { id, pkg };
}

/* ── the subscriptions and their deliveries ──────────────────────────────── */
const subscriptionStatus = async (domainId, label) => {
  const r = await call(`/v1/tenants/${T}/domains/${domainId}/graph/subscriptions/status`, { scope: 'DOMAIN', tenantId: T, domainId, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }, {}, admin.token);
  if (!r.ok) { fail(`subscriptions/status (${label})`, r); return null; }
  return r.body.subscriptions;
};
/**
 * The subscribers of a domain, IDEMPOTENT by kind — register-subscriptions.mjs's idiom carried here because that script is hard-wired to
 * the origin domain and runs live scenes: a kind with an active subscription whose consumer identity (version, code digest) is this
 * process's is left; one registered for a consumer whose METHOD has since changed is REVOKED and the kind registered anew, the
 * replacement replaying from the revoked subscription's cursor (B8: a changed method is a new consumer; B17 changed memory-mappings);
 * a kind without one is registered — the administrator registers, the owner is the accountable human of the domain.
 */
async function ensureSubscriptions(domainId, ownerPrincipalId, label) {
  const G = `/v1/tenants/${T}/domains/${domainId}/graph`;
  const ad = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', ...over });
  let st = await subscriptionStatus(domainId, label);
  if (st === null) return null;
  for (const kind of KINDS) {
    const live = (st.subscriptions ?? []).find((s) => s.consumer_kind === kind && s.status === 'active');
    const current = (st.consumers ?? []).find((c) => c.kind === kind);
    if (live !== undefined && current !== undefined && (live.code_digest !== current.codeDigest || live.consumer_version !== current.version)) {
      const rv = await call(`${G}/subscriptions/${live.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: live.subscription_id, consequence: 'C2' }),
        { reason: `B17: the ${kind} consumer's method changed (${String(live.code_digest).slice(0, 12)}… → ${String(current.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
      if (!rv.ok) { bad(`${label}: ${kind}: the outdated subscription could not be revoked (${rv.status}) ${rv.body?.message ?? ''}`); continue; }
      note(`${label}: ${kind}: subscription ${short(live.subscription_id)} was registered for consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…; this process's ${kind} consumer is ${current.version} ${String(current.codeDigest).slice(0, 12)}… — REVOKED, registered anew (a changed method is a new consumer)`);
    } else if (live !== undefined) { ok(`${label}: ${kind}: subscription ${short(live.subscription_id)} already active (consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…)`); continue; }
    const r = await call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }),
      { consumerKind: kind, ownerPrincipalId, backlog: 'leave', ...(SELECTION[kind] ?? {}) }, admin.token);
    if (!r.ok) { bad(`${label}: ${kind}: registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); continue; }
    const s = r.body.subscription;
    ok(`${label}: ${kind}: registered subscription ${short(s.subscriptionId)}, principal ${short(s.principalId)} (role ${s.role}), consumer ${s.consumer.version} ${String(s.consumer.codeDigest).slice(0, 12)}…${SELECTION[kind] ? `, selection ${JSON.stringify(SELECTION[kind])}` : ''}; worker running ${r.body.served.workerRunning}`);
    if (live !== undefined) {
      const from = live.checkpoint_seq === null || live.checkpoint_seq === undefined ? {} : { fromSeq: Number(live.checkpoint_seq) };
      const rp = await call(`${G}/subscriptions/${s.subscriptionId}/replay`, ad({ action: 'graph.subscription.replay', objectType: 'SUB', objectId: s.subscriptionId, consequence: 'C2' }),
        { ...from, reason: `B17: the ${kind} consumer changed; the replacement replays from the revoked subscription's cursor` }, admin.token);
      if (!rp.ok) bad(`${label}: ${kind}: the replacement's replay was refused (${rp.status}) ${rp.body?.message ?? ''}`);
      else note(`${label}: ${kind}: replayed ${rp.body.replayed} event(s) to the replacement from ${from.fromSeq === undefined ? 'the retained beginning' : `sequence ${from.fromSeq}`}`);
    }
  }
  st = await subscriptionStatus(domainId, label);
  return st;
}
/** The newest published outbox row of a GraphChanged kind caused by a target (the import, the assumption) after a mark — read from the ledger, as B16 read its MemoryCorrected. */
async function waitOutbox(domainId, kind, targetId, notBefore, seconds = 30) {
  for (let i = 0; i < seconds; i += 1) {
    const row = (await q(`select id::text, status, partition_key, partition_seq::int, correlation_id::text, payload from objects.object_outbox
        where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and payload #>> '{change,kind}' = $3 and payload #>> '{cause,target_id}' = $4 and created_at >= $5
        order by created_at desc limit 1`, [T, domainId, kind, targetId, new Date(notBefore - 1000)]))[0] ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const deliveriesOf = (eventId) => q(`select consumer_kind, state, items, items_applied, attempts, last_error from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
/** Wait for every delivery of an event to be terminal (the B16 loop). */
async function settled(eventId, expected = BROAD.length, seconds = 90) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = await deliveriesOf(eventId);
    if (ds.length >= expected && ds.every((d) => ['applied', 'failed', 'refused'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
const effectsOf = (d) => [...new Set((d.items_applied ?? []).map((x) => x.effect))].join(', ');
const deliveryLine = (ds) => ds.map((d) => `${d.consumer_kind} ${d.state}${(d.items ?? []).length > 0 ? ` (${(d.items ?? []).length} item(s): ${effectsOf(d) || 'no effect recorded'})` : ' (no items)'}${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`).join('; ');

console.log(`THE EYE — CP-6 B17 on the demonstration: imported knowledge published to the importing domain's subscribers; the origin's revocation propagated into the importing domain; the signed notice (migration 0077)`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} · origin domain ${short(D)} · ${new Date().toISOString()}`);
console.log(`prepared by the runner: the demonstration signing key ${rel(PUB_PEM_PATH)} (${publicPem === null ? 'ABSENT' : 'present'}); the transfer station ${rel(STATION)}`);
console.log('each run revokes the import the previous run (or B16) left admitted and leaves its own; the mirror never holds two live copies of the NORDWERK knowledge');

/* ── 0. THE MIRROR ───────────────────────────────────────────────────────── */
console.log('\n0. THE MIRROR — the domain, its personas (two new: K. Vogel the twin owner, S. Roth the strategy owner), its intake source, its station and its exchange partner from B16, reused');
let D2 = null; let keller = null; let brandt = null; let roth = null; let intake = null; let station = null; let station2 = null; let partner = null;
const X2 = () => `/v1/tenants/${T}/domains/${D2}`; const R2 = () => `${X2()}/retention`; const G2 = () => `${X2()}/graph`; const W2 = () => `${X2()}/twins`;
const mk = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${keller.principalId}`, purposeId: 'retention', ...over });
const hb2 = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const lb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${brandt.principalId}`, purposeId: 'twin', ...over });
const sr = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${roth.principalId}`, purposeId: 'graph', ...over });
const importOpen = (source) => call(`${R2()}/imports/open`, mk({ action: 'retention.import.open', objectType: 'RIM', consequence: 'C2' }), { source }, keller.token);
const importApprove = (id, packageDigest, rationale) => call(`${R2()}/imports/${id}/approve`, hb2({ action: 'retention.import.approve', objectType: 'RIM', objectId: id, consequence: 'C2' }), { packageDigest, rationale }, bergmann.token);
const importAdmit = (id) => call(`${R2()}/imports/${id}/admit`, mk({ action: 'retention.import.admit', objectType: 'RIM', objectId: id, consequence: 'C2' }), {}, keller.token);
const importRevoke = (id, source) => call(`${R2()}/imports/${id}/revoke`, mk({ action: 'retention.import.revoke', objectType: 'RIM', objectId: id, consequence: 'C2' }), { source }, keller.token);
const importGet = (id) => call(`${R2()}/imports/${id}/get`, mk({ action: 'retention.read', objectType: 'RIM', objectId: id, sideEffect: 'none' }), {}, keller.token);
const importsList = () => call(`${R2()}/imports/list`, mk({ action: 'retention.read', objectType: 'RIM', sideEffect: 'none' }), {}, keller.token);
const partnersList = () => call(`${R2()}/partners/list`, mk({ action: 'retention.read', objectType: 'RXP', sideEffect: 'none' }), {}, keller.token);
const failedChecks = (checks) => (Array.isArray(checks) ? checks.filter((c) => c.ok === false) : []);
const checkLine = (c) => `${c.ok === null || c.ok === undefined ? 'note' : c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`;
/** The item map of an import: origin_ref → the id this installation minted (admitted or reused), and the items by kind. */
const mapOfItems = (items) => {
  const idOf = (it) => { const a = it.admitted ?? it.planned ?? {}; return a.object_id ?? a.entity_id ?? a.edge_id ?? a.identifier_id ?? null; };
  const live = (it) => it.disposition === 'admitted' || it.disposition === 'reused';
  const byKind = (kind) => items.filter((it) => it.kind === kind && live(it));
  return {
    idOf, records: byKind('record'), claims: byKind('claim'), entities: byKind('entity'), edges: byKind('edge'), identifiers: byKind('identifier'),
    reused: items.filter((it) => it.disposition === 'reused' && ['record', 'claim', 'entity', 'edge'].includes(it.kind)),  // an identifier system the domain already declared is 'reused' too; the copies are these four kinds
    line: `${byKind('record').length} record(s), ${byKind('claim').length} claim version(s) of ${new Set(byKind('claim').map(idOf)).size} claim(s), ${byKind('entity').length} entit${byKind('entity').length === 1 ? 'y' : 'ies'}, ${byKind('edge').length} edge(s), ${byKind('identifier').length} identifier(s)`,
  };
};
{
  try {
    const d = await domainByName(admin, T, D2_NAME);
    if (d === null) bad(`the mirror domain ${JSON.stringify(D2_NAME)} does not exist: B16's act has not run on this demonstration (it creates the domain, its intake source, its station and its partner); nothing is created here`);
    else { D2 = d.id; ok(`the mirror domain ${JSON.stringify(D2_NAME)}: ${short(D2)} present — reused by name`); }
  } catch (e) { bad(`the mirror domain: ${e.message}`); }
  if (D2 !== null) {
    const k = await createPersona(admin, T, { displayName: 'M. Keller — retention steward (mirror)', loginName: 'm.keller', password: PW, roleCode: 'retention_steward', domainId: D2 });
    const b = await createPersona(admin, T, { displayName: 'K. Vogel — twin owner (mirror)', loginName: 'k.vogel', password: PW, roleCode: 'twin_owner', domainId: D2 });
    const s = await createPersona(admin, T, { displayName: 'S. Roth — strategy owner (mirror)', loginName: 's.roth', password: PW, roleCode: 'strategy_owner', domainId: D2 });
    keller = k.session; brandt = b.session; roth = s.session;
    if (keller !== null && brandt !== null && roth !== null) ok(`the personas: M. Keller (retention_steward) ${k.created ? 'created' : 'present'}; K. Vogel (twin_owner) ${b.created ? 'CREATED by the administrator' : 'present (a previous run)'}; S. Roth (strategy_owner) ${s.created ? 'CREATED by the administrator' : 'present (a previous run)'} — each opens a session with its own credential`);
    else bad(`the personas: m.keller ${k.session === null ? `NOT available (${k.status} ${k.message ?? ''})` : 'ok'}; k.vogel ${b.session === null ? `NOT available (${b.status} ${b.message ?? ''})` : 'ok'}; s.roth ${s.session === null ? `NOT available (${s.status} ${s.message ?? ''})` : 'ok'}`);
  }
  if (keller !== null) {
    const src = (await q(`select source_id::text, contract_version::int, lifecycle_state, rights_state, authority_class, classification_ceiling from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by contract_version desc limit 1`, [T, D2, INTAKE_KEY]))[0] ?? null;
    if (src !== null && src.lifecycle_state === 'active' && src.rights_state === 'confirmed') { intake = { sourceId: src.source_id, contractVersion: src.contract_version, authorityClass: src.authority_class }; ok(`the intake source contract ${INTAKE_KEY}@${intake.contractVersion} (${short(intake.sourceId)}): ACTIVE, rights CONFIRMED, authority class ${src.authority_class}, ceiling ${src.classification_ceiling} — the contract the imported manifests are recorded under`); }
    else bad(`the intake source ${INTAKE_KEY}: ${JSON.stringify(src)}`);
    const ds = await listDestinations();
    station = ds.ok ? (ds.body.destinations ?? []).find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null : null;
    const dl = await call(`${R2()}/destinations/list`, mk({ action: 'retention.read', objectType: 'RDS', sideEffect: 'none' }), {}, keller.token);
    station2 = dl.ok ? (dl.body.destinations ?? []).find((x) => field(x, 'destination_key') === STATION_KEY && field(x, 'retired_at') === null) ?? null : null;
    if (station !== null && station2 !== null) ok(`the transfer station ${STATION_KEY}: declared in the origin domain (→ ${rel(String(field(station, 'endpoint')))}) and in the mirror (→ ${rel(String(field(station2, 'endpoint')))})`);
    else bad(`the transfer station ${STATION_KEY}: origin ${station === null ? 'ABSENT' : 'present'}, mirror ${station2 === null ? 'ABSENT' : 'present'}`);
    // THE PARTNER: reused AS IT IS when it holds the key that signs this installation's packages (the tenant's active export signing key —
    // the demonstration's case; B16's re-run retirement served its pre-partner quarantine scene, not needed here). Only when the active key
    // is ANOTHER key (a rehearsal copy binds its own key under the demonstration's reference and swaps the key row) is the partner retired
    // with the reason and declared again with the public key this act was given — otherwise E4 would be quarantined on a key no partner holds.
    const activeKey = (await q(`select key_id from retention.export_signing_keys where tenant_id = $1 and retired_at is null order by declared_at desc limit 1`, [T]))[0]?.key_id ?? null;
    const pl = await partnersList();
    partner = pl.ok ? (pl.body.partners ?? []).find((p) => field(p, 'partner_key') === PARTNER_KEY && field(p, 'retired_at') === null) ?? null : null;
    let redeclared = false;
    if (partner !== null && activeKey !== null && field(partner, 'key_id') !== activeKey && publicPem !== null && intake !== null) {
      const rt = await call(`${R2()}/partners/${field(partner, 'partner_id')}/retire`, { scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', action: 'retention.partner.retire', objectType: 'RXP', objectId: String(field(partner, 'partner_id')), consequence: 'C2' }, { reason: `the partner holds key ${field(partner, 'key_id')}, not the tenant's active export signing key ${activeKey} that signs this installation's packages (a rehearsal copy under its own key); declared again with the key in use` }, admin.token);
      const rd = rt.ok ? await call(`${R2()}/partners/declare`, { scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', action: 'retention.partner.declare', objectType: 'RXP', consequence: 'C2' }, { partnerKey: PARTNER_KEY, party: String(field(partner, 'party') ?? 'NORDWERK ANTRIEBSTECHNIK GmbH — the origin domain "Supply Corridor Intelligence" (SYNTHETIC)'), purpose: String(field(partner, 'purpose') ?? 'the mirror domain admits the origin domain\'s customer export packages'), publicKeyPem: publicPem, intakeSourceId: intake.sourceId, intakeContractVersion: intake.contractVersion }, admin.token) : null;
      if (rt.ok && rd !== null && rd.ok) { const prior = partner; partner = rd.body.partner ?? rd.body; redeclared = true; note(`the exchange partner ${PARTNER_KEY} held key ${field(prior, 'key_id')}, not the tenant's active signing key ${activeKey}: RETIRED by the administrator (${short(field(prior, 'partner_id'))}; its history kept — the standing import still names it) and declared again with the key in use: ${field(partner, 'key_id')} (this is the rehearsal copy's case; on the demonstration the partner holds the active key and is reused as it is)`); }
      else fail('partners retire/declare (admin, mirror)', rt.ok ? rd : rt);
    }
    if (redeclared) { /* stated above */ }
    else if (partner !== null && (activeKey === null || field(partner, 'key_id') === activeKey)) ok(`the exchange partner ${PARTNER_KEY}: active, key ${field(partner, 'key_id')} — the tenant's active export signing key; reused as it is (not retired this time: B16's re-run rule served its pre-partner quarantine scene)`);
    else if (partner === null) bad(`the exchange partner ${PARTNER_KEY} is not active in the mirror${pl.ok ? '' : ` (${pl.status} ${pl.body?.message ?? ''})`}`);
    else bad(`the exchange partner ${PARTNER_KEY} holds key ${field(partner, 'key_id')}; the tenant's active signing key is ${activeKey}${publicPem === null ? ' (no public key given to re-declare it with)' : ''}`);
  }
}
if (D2 === null || keller === null || brandt === null || roth === null || intake === null || station === null || station2 === null || partner === null) {
  console.log(`\n${failureCount()} FAILURE(S) — the mirror is not prepared (run scripts/phase6/act-b16.mjs first); nothing else is attempted`);
  await su.end(); process.exit(1);
}
const endpoint = String(field(station, 'endpoint') ?? STATION);

/* ── 1. THE SUBSCRIBERS ──────────────────────────────────────────────────── */
console.log('\n1. THE SUBSCRIBERS — the origin domain\'s subscriptions checked against this process\'s consumers (memory-mappings changed in B17: revoked, registered anew, replayed); the mirror\'s seven subscribers registered; the status route');
await ensureSubscriptions(D, weber.principalId, 'the origin');
const st2 = await ensureSubscriptions(D2, keller.principalId, 'the mirror');
if (st2 !== null) {
  const active = (st2.subscriptions ?? []).filter((s) => s.status === 'active').map((s) => s.consumer_kind);
  if (KINDS.every((k) => active.includes(k))) ok(`the mirror's status route: ${active.length} active subscription(s) — ${KINDS.join(', ')} — owned by M. Keller; ${(st2.deliveries ?? []).length} recent deliveries; ${(st2.retrieval_checks ?? []).length} retrieval check(s)`);
  else bad(`the mirror's active subscriptions: ${active.join(', ')}`);
  const consumers = (st2.consumers ?? []).filter((c) => c.registeredInThisProcess).map((c) => c.kind);
  if (consumers.length === KINDS.length && st2.runtime?.worker_running === true) ok(`all ${KINDS.length} consumers are registered into the dispatcher by their own modules; the mirror's queue ${st2.runtime.redis_queue} is served by this process (holder ${st2.runtime.serving?.holder ?? '—'})`);
  else bad(`consumers in this process: ${consumers.join(', ')}; worker running ${st2.runtime?.worker_running}`);
}

/* ── 2. THE STANDING IMPORT and the mirror building on it ────────────────── */
console.log('\n2. THE STANDING IMPORT — the mirror\'s latest admitted import of the NORDWERK knowledge; S. Roth\'s assumption rests on an imported claim; K. Vogel\'s twin is bounded by an imported entity and cites an imported record: VERIFIED');
let standing = null; let standingMap = null; let boundary = null; let claim = null; let record = null; let ASU = null; let TW = null; let twinVersion = null;
{
  standing = (await q(`select import_id::text, origin, partner_id::text, package_digest, admitted_at, counts, opened_at from retention.imports where tenant_id = $1 and domain_id = $2 and state = 'admitted' order by admitted_at desc limit 1`, [T, D2]))[0] ?? null;
  if (standing === null) bad('no admitted import in the mirror: nothing stands to build on and nothing to revoke (B16\'s act, or a previous run\'s scene 4, leaves one)');
  else {
    const g = await importGet(standing.import_id);
    if (!g.ok) { fail('imports/get (m.keller)', g); standing = null; }
    else {
      standingMap = mapOfItems(g.body.items ?? []);
      const originAction = String(standing.origin?.action_id ?? '');
      const originPkg = await packageRow(originAction);
      ok(`the standing import ${short(standing.import_id)}: origin action ${short(originAction)} (${originPkg === null ? 'no package row' : `${originPkg.object_count} record(s), signed by ${originPkg.signing_key_id ?? 'no key'}, ${originPkg.revoked_at === null ? 'NOT revoked' : `revoked at ${iso(originPkg.revoked_at)}`}`}), admitted ${iso(standing.admitted_at)} — ${standingMap.line}; ${standingMap.reused.length === 0 ? 'every item admitted (none reused)' : `${standingMap.reused.length} reused`}`);
    }
  }
  if (standing !== null) {
    // THE BOUNDARY ENTITY: the imported NORDWERK organization (found by the item map), else any created entity still active in the mirror.
    const entityIds = standingMap.entities.map(standingMap.idOf).filter((x) => typeof x === 'string');
    const ents = entityIds.length === 0 ? [] : await q(`select entity_id::text, entity_type, canonical_name, lifecycle_state from graph.entities_current where domain_id = $1 and entity_id = any($2::uuid[]) order by canonical_name`, [D2, entityIds]);
    const created = new Set(standingMap.entities.filter((it) => it.disposition === 'admitted').map(standingMap.idOf));
    boundary = ents.find((e) => created.has(e.entity_id) && e.lifecycle_state === 'active' && e.entity_type === 'organization' && /nordwerk/i.test(e.canonical_name))
      ?? ents.find((e) => created.has(e.entity_id) && e.lifecycle_state === 'active') ?? null;
    if (boundary === null) bad(`no active entity created by the standing import to bound a twin with (${ents.map((e) => `${e.canonical_name} ${e.lifecycle_state}`).join('; ') || 'none'})`);
    // THE CLAIM: a SINGLE-VERSION imported REL claim whose truth state is extracted (the corrected one's later versions are asserted), with its
    // asserted edge and the imported record its lineage names — preferring one whose edge touches the boundary entity.
    const claimIds = [...new Set(standingMap.claims.map(standingMap.idOf).filter((x) => typeof x === 'string'))];
    const cands = claimIds.length === 0 ? [] : await q(`select o.object_id::text id, o.object_version::int version, o.truth_state, o.recorded_at,
          (select count(*) from objects.canonical_objects x where x.object_id = o.object_id)::int versions,
          e.edge_id::text, e.predicate, e.subject_entity_id::text subject_id, e.object_entity_id::text object_id_of_edge,
          (select canonical_name from graph.entities_current x where x.entity_id = e.subject_entity_id) subject, (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object,
          l.evidence_object_id::text evidence_id
        from objects.canonical_objects o
        left join graph.edges_current e on e.claim_object_id = o.object_id and e.claim_version = o.object_version and e.state = 'asserted'
        left join intelligence.claim_lineage l on l.claim_object_id = o.object_id and l.claim_version = o.object_version
        where o.domain_id = $1 and o.object_type = 'REL' and o.truth_state = 'extracted' and o.object_id = any($2::uuid[]) order by o.recorded_at`, [D2, claimIds]);
    const single = cands.filter((c) => c.versions === 1);
    claim = (boundary === null ? null : single.find((c) => c.edge_id !== null && (c.subject_id === boundary.entity_id || c.object_id_of_edge === boundary.entity_id)) ?? null) ?? single.find((c) => c.edge_id !== null) ?? single[0] ?? null;
    if (claim === null) bad(`no single-version extracted REL claim among the standing import's ${claimIds.length} claim(s) (${cands.map((c) => `${short(c.id)} v${c.version} ×${c.versions}`).join(', ') || 'none extracted'})`);
    else {
      const recordIds = new Set(standingMap.records.map(standingMap.idOf));
      const recItem = standingMap.records.find((it) => standingMap.idOf(it) === claim.evidence_id) ?? standingMap.records[0] ?? null;
      record = recItem === null ? null : { id: standingMap.idOf(recItem), version: Number(recItem.admitted?.object_version ?? String(recItem.origin_ref).split('@')[1]), locator: recItem.admitted?.locator ?? null, manifest_id: recItem.admitted?.manifest_id ?? null, origin_ref: recItem.origin_ref, byLineage: recordIds.has(claim.evidence_id) && standingMap.idOf(recItem) === claim.evidence_id };
      note(`the imported knowledge chosen: the entity ${boundary === null ? '—' : `"${boundary.canonical_name}" (${boundary.entity_type}, ${short(boundary.entity_id)}, ${boundary.lifecycle_state})`}; the REL claim C' ${short(claim.id)}@${claim.version} (truth state ${claim.truth_state}, ${claim.versions} version${claim.versions === 1 ? '' : 's'})${claim.edge_id ? ` with the asserted edge ${short(claim.edge_id)} "${claim.subject}" ${claim.predicate} "${claim.object}"` : ' (no asserted edge on it)'}; the record R' ${record === null ? '—' : `${short(record.id)}@${record.version} (${record.byLineage ? "the record C' rests on — its lineage row names it" : 'the first imported record'})`}`);
    }
  }
  // S. ROTH'S ASSUMPTION — declared BEFORE the twin: a strategy.declared event names the claims it rests on in objects.claims, and the twins
  // consumer marks a verified twin citing one of them unverified (it selects by cited claim); declared first, it reaches no twin.
  if (claim !== null) {
    const t0 = Date.now();
    const r = await call(`${G2()}/strategy/declare`, sr({ action: 'graph.strategy.declare', objectType: 'ASU' }), {
      objectType: 'ASU', title: `the imported relationship holds: "${String(claim.subject ?? 'the subject').slice(0, 60)}" ${claim.predicate ?? 'relates to'} "${String(claim.object ?? 'the object').slice(0, 60)}" (mirror; import ${short(standing.import_id)})`,
      statement: `the mirror's planning assumes the relationship the origin domain extracted and exchanged (claim C' ${claim.id}@${claim.version}, admitted by import ${standing.import_id}) still holds; if the origin withdraws it, this assumption must be re-examined (the B17 demonstration)`,
      status: 'active', restsOn: [{ kind: 'claim', id: claim.id, rationale: 'the assumption restates an imported REL claim; it stands or falls with the origin\'s copy' }],
    }, roth.token);
    if (!r.ok) fail('graph/strategy/declare (s.roth)', r);
    else {
      ASU = r.body.strategy.objectId;
      ok(`S. Roth declared the assumption ${short(ASU)} resting on the imported claim C' ${short(claim.id)} (rests_on: claim; ${r.body.strategy.links} link(s))`);
      const ev = await waitOutbox(D2, 'strategy.declared', ASU, t0);
      if (ev === null) bad('no published GraphChanged/strategy.declared for the assumption within 30 s');
      else {
        const ds = await settled(ev.id);
        note(`GraphChanged/strategy.declared ${short(ev.id)}: ${ds.length} deliveries — ${deliveryLine(ds)}${ds.find((d) => d.consumer_kind === 'twins' && (d.items ?? []).length === 0) ? ' (twins: no items — no twin cites the claim yet; the twin is declared next)' : ''}`);
      }
    }
  }
  // L. BRANDT'S TWIN — bounded by the imported entity, ONE estimated element citing the imported record; version 1 known now with no world
  // cut-off (the imported record's own date is the origin's); admitted as incomplete (the behaviour model's required inputs are not grounded:
  // no run may use it) → VERIFIED. The twin route resolves a `claim` citation to a CLM object only (twin.service.ts OBJECT_TYPE_OF), so an
  // imported REL claim cannot be cited by a twin element; the record that carries it is — the claim itself is reached through the assumption.
  if (boundary !== null && record !== null) {
    const d = await call(`${W2()}/declare`, lb({ action: 'twin.declare', objectType: 'TWN' }), {
      kind: 'supply-chain', title: `NORDWERK — the imported corridor (mirror; import ${short(standing.import_id)})`,
      statement: `the mirror's twin of the NORDWERK supply chain, bounded by the entity the origin domain exchanged and grounded on the imported record (the B17 demonstration: what an origin's revocation does to what rests on its copies)`,
      boundary: [boundary.entity_id], owner: brandt.principalId, behaviourModelRef: 'supply-flow@1',
      intendedDecisions: ['none — a demonstration twin of imported knowledge'],
      validation: { status: 'unvalidated (imported synthetic grounding)', limitations: ['the records are the origin domain\'s synthetic data, imported', 'one estimated element; the model\'s required inputs are not grounded (admitted incomplete: no run may use it)'] },
    }, brandt.token);
    if (!d.ok) fail('twins/declare (k.vogel)', d);
    else {
      TW = d.body.twin.twinId;
      const o = await call(`${W2()}/${TW}/versions/open`, lb({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: null }, brandt.token);
      if (!o.ok) fail('twins/versions/open (k.vogel)', o);
      else {
        twinVersion = o.body.version.version;
        const g = await call(`${W2()}/${TW}/versions/${twinVersion}/ground`, lb({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { elements: [
          { key: 'route.reroute_delay_days', kind: 'estimated', value: 11, unit: 'days', citations: [{ kind: 'evidence', id: record.id, version: record.version }] },
        ] }, brandt.token);
        if (!g.ok) fail('twins/versions/ground (k.vogel)', g);
        else {
          const a = await call(`${W2()}/${TW}/versions/${twinVersion}/admit`, lb({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), { allowIncomplete: true }, brandt.token);
          if (!a.ok) fail('twins/versions/admit (k.vogel)', a);
          else {
            const vs = (await q(`select state, verification_state from twin.twin_versions where twin_id = $1 and version = $2`, [TW, twinVersion]))[0] ?? null;
            if (vs !== null && vs.state === 'admitted' && vs.verification_state === 'verified') ok(`K. Vogel declared the twin ${short(TW)} bounded by "${boundary.canonical_name}", opened version ${twinVersion} (known now; no world cut-off), grounded ONE estimated element (route.reroute_delay_days = 11 days — the demonstration's estimate) citing the imported record R' ${short(record.id)}@${record.version}, admitted as ${a.body.admitted.completeness} (${a.body.admitted.missingKeys.length} required input(s) not grounded; no run may use it): verification_state VERIFIED`);
            else bad(`the twin version: ${JSON.stringify(vs)}`);
          }
        }
      }
    }
    note('STATED: no forecast is issued through the route in the mirror — a forecast needs a registered series with observations, and the demonstration\'s series are the origin domain\'s; the forecast, scenario and decision reach of the walk is the harness\'s (phase6-retention-b17 S2)');
  }
}

/* ── 3. THE ORIGIN REVOKES ───────────────────────────────────────────────── */
console.log('\n3. THE ORIGIN REVOKES — H. Bergmann revokes the standing import\'s package: the station notified with the SIGNED notice (the recipient verifies it, answers, collected: ACKNOWLEDGED); the mirror\'s import notified and its copies DESTROYED by the same act; the receipt on the origin\'s ledger; import.revoked delivered to the mirror\'s subscribers');
if (standing === null) bad('no standing import: nothing to revoke');
else {
  const originAction = String(standing.origin?.action_id ?? '');
  const originPkg = await packageRow(originAction);
  const sdir = join(endpoint, T, D, originAction);
  // THE EXPORT READ BEFORE: the package's importers (the mirror's import, admitted) — the read route refuses a revoked package (B11: its bytes are gone).
  if (originPkg !== null && originPkg.revoked_at === null) {
    const before = await exportGet(originAction);
    const imBefore = before.ok ? (before.body.importers ?? []).find((i) => String(field(i, 'import_id')) === standing.import_id) ?? null : null;
    if (imBefore !== null && field(imBefore, 'state') === 'admitted') ok(`the export read of ${short(originAction)} BEFORE the revocation names its importers: the mirror's import ${short(standing.import_id)} (${field(imBefore, 'state')}, partner ${field(imBefore, 'partner_key')}, admitted ${iso(field(imBefore, 'admitted_at'))}) — the origin knows who holds a copy`);
    else if (before.ok) bad(`the export read's importers: ${JSON.stringify(before.body.importers ?? null).slice(0, 300)}`); else fail('export/get before the revocation (p.novak)', before);
  }
  const t1 = Date.now();
  let im = null; let noticeRow = null;
  if (originPkg !== null && originPkg.revoked_at !== null) {
    // The origin package was revoked on an earlier, interrupted run: the mirror's steward completes the propagation by the import route (source origin).
    note(`the origin package ${short(originAction)} is ALREADY revoked (${iso(originPkg.revoked_at)}): the revoke act would only retry its bytes; M. Keller executes the revocation in the mirror by the import route with source origin (the same path the tenant authority's act takes)`);
    const rr = await importRevoke(standing.import_id, { kind: 'origin' });
    if (!rr.ok) fail('imports/revoke (m.keller, source origin)', rr);
    else im = { import_id: standing.import_id, notice: null, revocation: rr.body.revocation };
  } else {
    const rv = await revoke(originAction, `the customer withdraws the records exchanged with the mirror domain; every copy — the station's and the mirror's admitted import — is to be destroyed and confirmed (the B17 demonstration of the propagated revocation)`);
    if (!rv.ok) fail(`export/revoke ${short(originAction)} (h.bergmann)`, rv);
    else {
      const recipients = rv.body.revocation?.recipients ?? []; const notices = rv.body.notices ?? []; const importers = rv.body.importers ?? [];
      const st = recipients.find((r) => r.destination_key === STATION_KEY) ?? null; const ns = notices.find((n) => field(n.destination, 'destination_key') === STATION_KEY) ?? null;
      // THE RECIPIENTS: the station (the package delivered there and acknowledged: held confirmed), notified with the signed notice.
      if (st !== null && st.held === 'confirmed' && ns !== null && ns.state === 'notified' && ns.notice?.signature?.scheme === 'eye-revocation-notice/1') ok(`the recipients: ${recipients.map((r) => `${r.destination_key} (delivery ${short(r.delivery_id)} attempt ${r.attempt}, ${r.delivery_state}; held: ${r.held})`).join(', ')} — the station notified (notice ${short(ns.notice_id)} attempt ${ns.attempt}, ${ns.state}), the notice SIGNED: ${ns.notice.signature.scheme} by ${ns.notice.signature.key_id}${ns.notice.signed_with === 'active_key' ? ` (the tenant's active key; the package's key ${ns.notice.package_key_id} is not bound where this act runs — stated inside the signed bytes)` : ' (the package\'s key)'}`);
      else bad(`the revocation's recipients: ${JSON.stringify({ recipients, notices: notices.map((n) => ({ key: field(n.destination, 'destination_key'), state: n.state, signature: n.notice?.signature ?? null })) }).slice(0, 500)}`);
      // THE SIGNED revocation.json at the station, as the product wrote it; the demonstration recipient verifies it with the public key.
      const file = readJson(join(sdir, 'revocation.json'));
      if (file !== null && file.signature?.scheme === 'eye-revocation-notice/1' && typeof file.signature.signature === 'string' && file.package_digest === originPkg?.package_digest) {
        const keyOk = originPkg === null || file.signature.key_id === originPkg.signing_key_id || file.signed_with === 'active_key';
        (keyOk ? ok : bad)(`${rel(sdir)}/revocation.json: notice ${short(file.notice_id)} for delivery ${short(file.delivery?.delivery_id)}, package ${String(file.package_digest).slice(0, 16)}…, revoked at ${iso(file.revoked_at)}, obligation ${JSON.stringify(file.obligation ?? '(none)')}; signature { scheme ${file.signature.scheme}, key_id ${file.signature.key_id}, algorithm ${file.signature.algorithm}, signature ${String(file.signature.signature).slice(0, 12)}… }${file.signed_with === 'active_key' ? `; signed_with active_key (package_key_id ${file.package_key_id})` : ''} — ${keyOk ? 'the key the package was signed with' : `NOT the package's key ${originPkg?.signing_key_id}`}`);
      } else bad(`the station notice: ${JSON.stringify(file).slice(0, 300)}`);
      const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, originAction, '--revocation', ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
      console.log(indent(rc.stdout));
      const rr = readJson(join(sdir, 'revocation-receipt.json'));
      if (rc.status === 0 && publicPem !== null && /notice signature: VERIFIED by key/.test(rc.stdout) && rr?.signature?.verified === true && rr.copies_destroyed === true) ok(`the demonstration recipient VERIFIED the notice's signature with the public key (${rr.signature.key_id}) before obeying it; the product had removed its copies; revocation-receipt.json says copies_destroyed true, signature verified true`);
      else if (rc.status === 0 && publicPem === null) note(`no public key on this host: the recipient answered without verifying the signature (receipt signature.verified ${rr?.signature?.verified ?? '?'})`);
      else bad(`the recipient: exit ${rc.status}; receipt ${JSON.stringify(rr).slice(0, 300)}`);
      if (ns !== null) {
        const c1 = await collectNotice(originAction, ns.notice_id);
        if (c1.ok && field(c1.body.notice, 'state') === 'acknowledged') ok(`H. Bergmann collected the station's receipt: ACKNOWLEDGED at ${iso(field(c1.body.notice, 'acknowledged_at'))} — the signed notice on the demonstration, D8`); else if (c1.ok) bad(`the notice's collect act: ${JSON.stringify(c1.body.notice).slice(0, 200)}`); else fail('revocation-notices/collect-receipt (h.bergmann)', c1);
      }
      // THE IMPORTERS: the mirror's import, notified with the same signed notice and REVOKED by the same act after the origin's commit.
      im = importers.find((i) => String(field(i, 'import_id')) === standing.import_id) ?? null;
      if (im === null) bad(`the revocation's importers do not name the mirror's import: ${JSON.stringify(importers.map((i) => ({ import_id: field(i, 'import_id'), state: i.revocation?.state }))).slice(0, 300)}`);
      else {
        const n = im.notice ?? {}; const sent = n.notice ?? {};
        if (n.state === 'notified' && typeof sent.recipient === 'string' && sent.recipient.startsWith('import:') && sent.delivery?.import_id === standing.import_id && sent.delivery?.held === 'confirmed' && sent.signature?.scheme === 'eye-revocation-notice/1') ok(`the importer notified: notice ${short(n.notice_id)} attempt ${n.attempt} (${n.state}) to ${sent.recipient} — delivery { import ${short(sent.delivery.import_id)}, ${sent.delivery.state}, held ${sent.delivery.held} }; the same signed notice (key ${sent.signature.key_id}); recorded on the ORIGIN's ledger with importer set and no destination`);
        else bad(`the importer's notice: ${JSON.stringify(n).slice(0, 400)}`);
      }
    }
  }
  if (im !== null) {
    const rvc = im.revocation ?? {};
    const destroyed = rvc.destroyed ?? {};
    if (rvc.state === 'revoked' && rvc.receipt?.copies_destroyed === true && (rvc.answered?.answered === true ? rvc.answered.state === 'acknowledged' : im.notice === null)) ok(`the revocation EXECUTED in the mirror by ${im.notice === null ? 'M. Keller' : 'H. Bergmann (the same principal, a DOMAIN envelope of the mirror)'}: state ${rvc.state}, attempt ${rvc.attempt ?? '?'}, source ${rvc.source?.kind ?? '?'}; destroyed { records ${destroyed.records ?? '?'}, claims ${destroyed.claims ?? '?'}, entities ${destroyed.entities ?? '?'}, edges ${destroyed.edges ?? '?'} }, left ${rvc.left ?? '?'}, refused ${JSON.stringify(rvc.refused ?? [])}; bytes removed ${(rvc.bytes?.removed ?? []).length}, failed ${(rvc.bytes?.failed ?? []).length}; the receipt copies_destroyed ${rvc.receipt.copies_destroyed} (recipient ${rvc.receipt.recipient}); the origin's notice answered: ${rvc.answered?.answered === true ? `${rvc.answered.state} (attempt ${rvc.answered.attempt})` : JSON.stringify(rvc.answered)}`);
    else bad(`the revocation in the mirror: ${JSON.stringify({ state: rvc.state, destroyed, left: rvc.left, refused: rvc.refused, receipt: rvc.receipt, answered: rvc.answered, reason: rvc.reason }).slice(0, 600)}`);
    // THE MIRROR'S LEDGERS: what the revocation did to the copies.
    const edgeIds = standingMap.edges.filter((it) => it.disposition === 'admitted').map(standingMap.idOf); const entityIds = standingMap.entities.filter((it) => it.disposition === 'admitted').map(standingMap.idOf);
    const claimIds = [...new Set(standingMap.claims.filter((it) => it.disposition === 'admitted').map(standingMap.idOf))]; const recordIds = standingMap.records.filter((it) => it.disposition === 'admitted').map(standingMap.idOf);
    const edges = edgeIds.length === 0 ? [] : await q(`select edge_id::text, state, retraction_reason, retracted_by::text from graph.edges_current where domain_id = $1 and edge_id = any($2::uuid[])`, [D2, edgeIds]);
    const ents = entityIds.length === 0 ? [] : await q(`select entity_id::text, canonical_name, lifecycle_state, (select count(*) from graph.entity_identifiers i where i.entity_id = e.entity_id)::int identifiers from graph.entities_current e where domain_id = $1 and entity_id = any($2::uuid[]) order by canonical_name`, [D2, entityIds]);
    // An edge the origin recorded superseded, or an entity it recorded superseded or retired, is LEFT as it is (outcome left); the asserted
    // edges are retracted and the active entities retired — so the check is that nothing imported stays asserted or active.
    const retracted = edges.filter((e) => e.state === 'retracted' && /the origin revoked the package/.test(e.retraction_reason ?? '')); const leftEdges = edges.filter((e) => e.state !== 'retracted');
    const retired = ents.filter((e) => e.lifecycle_state === 'retired'); const stillActive = ents.filter((e) => e.lifecycle_state === 'active');
    if (edges.length > 0 && retracted.length > 0 && !edges.some((e) => e.state === 'asserted')) ok(`the mirror's edges: ${retracted.length} imported edge(s) RETRACTED — reason "${String(retracted[0].retraction_reason).slice(0, 140)}…" (edge.retracted with details.imported and details.revoked: the vocabulary the rebuild derives from)${leftEdges.length > 0 ? `; ${leftEdges.length} left as the origin recorded them (${[...new Set(leftEdges.map((e) => e.state))].join(', ')})` : ''}; none asserted`);
    else bad(`the mirror's edges after the revocation: ${JSON.stringify(edges.map((e) => [short(e.edge_id), e.state])).slice(0, 300)}`);
    if (ents.length > 0 && retired.length > 0 && stillActive.length === 0) ok(`the mirror's entities: ${retired.length}/${ents.length} created entit${ents.length === 1 ? 'y' : 'ies'} RETIRED (${retired.map((e) => e.canonical_name).join('; ')})${ents.length > retired.length ? `; ${ents.length - retired.length} left as the origin recorded` : ''} — ${ents.reduce((n, e) => n + e.identifiers, 0)} identifier(s) kept as facts of retired entities`);
    else bad(`the mirror's entities after the revocation: ${JSON.stringify(ents.map((e) => [e.canonical_name, e.lifecycle_state])).slice(0, 300)}`);
    const withdrawn = claimIds.length === 0 ? [] : await q(`select o.object_id::text id, o.object_version::int version, o.lifecycle_state, o.truth_state, o.correction_of, o.method_ref, o.withdrawal_reason, (o.payload -> 'imported_from' ->> 'import_id') import_id
        from objects.canonical_objects o where o.domain_id = $1 and o.object_id = any($2::uuid[]) and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id) order by o.object_id`, [D2, claimIds]);
    const wOk = withdrawn.filter((w) => w.lifecycle_state === 'withdrawn' && w.truth_state === 'withdrawn' && w.correction_of === `${w.id}@${w.version - 1}` && w.method_ref === 'retention.import.revoke@1.0.0' && w.import_id === standing.import_id);
    const cw = withdrawn.find((w) => w.id === claim?.id) ?? withdrawn[0] ?? null;
    if (withdrawn.length > 0 && wOk.length === withdrawn.length) ok(`the mirror's claims: ${wOk.length}/${withdrawn.length} imported claim(s) WITHDRAWN by a new version each — ${cw === null ? '' : `C' ${short(cw.id)}@${cw.version} withdrawn (correction_of ${cw.correction_of.split('@')[1] === undefined ? cw.correction_of : `C'@${cw.correction_of.split('@')[1]}`}, method ${cw.method_ref}, the payload's imported_from kept): "${String(cw.withdrawal_reason).slice(0, 120)}…"`}`);
    else bad(`the mirror's claim versions after the revocation: ${JSON.stringify(withdrawn.map((w) => [short(w.id), w.version, w.lifecycle_state, w.correction_of])).slice(0, 400)}`);
    const lineage = cw === null ? [] : await q(`select claim_version::int from intelligence.claim_lineage where claim_object_id = $1 order by claim_version`, [cw.id]);
    if (cw !== null && lineage.some((l) => l.claim_version === cw.version) && lineage.some((l) => l.claim_version === cw.version - 1)) note(`the lineage of C': rows for versions ${lineage.map((l) => l.claim_version).join(', ')} — the withdrawn version carries the row of the version it withdraws (the pair rule holds for it)`);
    const recs = recordIds.length === 0 ? [] : await q(`select o.object_id::text id, max(o.object_version)::int version, bool_or(o.lifecycle_state = 'withdrawn') withdrawn from objects.canonical_objects o where o.domain_id = $1 and o.object_id = any($2::uuid[]) group by o.object_id`, [D2, recordIds]);
    const custody = (await q(`select count(*)::int n from observation.custody_events where event = 'custody.tombstoned' and domain_id = $1 and details ->> 'import_id' = $2`, [D2, standing.import_id]))[0].n;
    const locators = standingMap.records.filter((it) => it.disposition === 'admitted').map((it) => it.admitted?.locator).filter((l) => typeof l === 'string');
    const present = locators.filter((l) => existsSync(join(vaultRoot('evidence'), l)) || existsSync(join(vaultRoot('archive'), l)));
    if (recs.length > 0 && recs.every((r) => r.withdrawn) && custody >= recs.length && present.length === 0) ok(`the mirror's records: ${recs.length} imported record(s) WITHDRAWN (a version each), ${custody} custody.tombstoned row(s) naming the import, the bytes GONE from the evidence and archive roots (${locators.length} locator(s) checked under ${rel(vaultRoot('evidence'))})`);
    else bad(`the mirror's records after the revocation: withdrawn ${JSON.stringify(recs)}; custody.tombstoned ${custody}; bytes still present ${JSON.stringify(present)}`);
    const row = (await q(`select state, revocation_attempts::int, revoked_by::text, revoked_at, revocation from retention.imports where import_id = $1`, [standing.import_id]))[0] ?? null;
    const events = (await q(`select event from retention.import_events where import_id = $1 order by occurred_at`, [standing.import_id])).map((e) => e.event.replace('import.', ''));
    if (row !== null && row.state === 'revoked' && row.revoked_at !== null) ok(`the import ${short(standing.import_id)}: state ${row.state} after ${row.revocation_attempts} attempt(s), revoked by ${short(row.revoked_by)} at ${iso(row.revoked_at)}; counts ${JSON.stringify(row.revocation?.counts ?? {})}; events ${events.join(' → ')}`);
    else bad(`the import row after the revocation: ${JSON.stringify(row).slice(0, 300)}`);
    noticeRow = (await q(`select notice_id::text, attempt::int, state, importer, destination_id, delivery_id, receipt, acknowledged_at from retention.export_revocation_notices where action_id = $1 and importer is not null order by attempt desc limit 1`, [originAction]))[0] ?? null;
    if (noticeRow !== null && noticeRow.state === 'acknowledged' && noticeRow.importer?.import_id === standing.import_id && noticeRow.destination_id === null && noticeRow.receipt?.copies_destroyed === true) ok(`the ORIGIN's ledger: the importer notice ${short(noticeRow.notice_id)} (attempt ${noticeRow.attempt}) — importer { domain ${short(noticeRow.importer.domain_id)}, import ${short(noticeRow.importer.import_id)} }, no destination, ${noticeRow.state} at ${iso(noticeRow.acknowledged_at)} with the mirror's receipt (copies_destroyed ${noticeRow.receipt.copies_destroyed}, verifier ${JSON.stringify(noticeRow.receipt.verifier ?? '?')})`);
    else bad(`the origin's importer notice: ${JSON.stringify(noticeRow).slice(0, 400)}`);
    const after = await exportGet(originAction);
    if (after.status === 409 && /revoked at/.test(after.body?.message ?? '')) note(`the export read AFTER the revocation: 409 — "${after.body.message}" (the B11 rule: a revoked package is not read; its importers stand on the ledger above)`);
    else if (after.ok) note(`the export read after the revocation: importers ${JSON.stringify((after.body.importers ?? []).map((i) => ({ import_id: short(field(i, 'import_id')), state: field(i, 'state') })))}`);
    else fail('export/get after the revocation', after);
    // THE EVENT: the ONE GraphChanged/import.revoked with the walk, and its deliveries in the mirror.
    const gr = await waitOutbox(D2, 'import.revoked', standing.import_id, t1, 60);
    if (gr === null) bad('no published GraphChanged/import.revoked for the mirror\'s import within 60 s');
    else {
      const p = gr.payload; const ids = p.identities ?? []; const objs = p.objects ?? {};
      const retiredIds = ids.filter((i) => i.role === 'retired').map((i) => i.entity_id); const reached = ids.filter((i) => i.role === 'reached').length;
      const retractedEdges = (p.relationships?.edges ?? []).filter((e) => e.state === 'retracted').length;
      const asuReached = ASU !== null && (objs.assumptions ?? []).includes(ASU);
      if (p.change?.kind === 'import.revoked' && retiredIds.length === retired.length && objs.walked === true && (objs.claims ?? []).length >= 1 && (objs.evidence ?? []).length >= 1 && p.import?.import_id === standing.import_id && (p.subscriptions ?? []).length === BROAD.length) ok(`GraphChanged/import.revoked ${short(gr.id)} (partition ${gr.partition_key} seq ${gr.partition_seq}): identities ${retiredIds.length} retired${reached > 0 ? `, ${reached} reached` : ''}; edges ${retractedEdges} retracted; objects { walked ${objs.walked}, claims ${(objs.claims ?? []).length}, evidence ${(objs.evidence ?? []).length}, assumptions ${(objs.assumptions ?? []).length}${asuReached ? ` (S. Roth's ${short(ASU)} reached by the walk)` : ''}, decisions ${(objs.decisions ?? []).length}, forecasts ${(objs.forecasts ?? []).length}, twins ${(objs.twins ?? []).length}, truncated ${objs.truncated} }; dependencies ${(p.relationships?.dependencies ?? []).length}; import.notice { source ${p.import?.notice?.source ?? '?'}, notice ${p.import?.notice?.notice_id ? short(p.import.notice.notice_id) : 'none'} }; cause ${p.cause?.action} by ${short(p.cause?.actor)}; subscriptions ${(p.subscriptions ?? []).map((s) => s.consumer_kind).sort().join(', ')}`);
      else bad(`the import.revoked payload: ${JSON.stringify({ kind: p.change?.kind, retired: retiredIds.length, expected: retired.length, walked: objs.walked, claims: (objs.claims ?? []).length, evidence: (objs.evidence ?? []).length, import_id: p.import?.import_id, subscriptions: (p.subscriptions ?? []).length }).slice(0, 400)}`);
      if (ASU !== null && !asuReached) bad(`the walk did not reach S. Roth's assumption ${short(ASU)}: objects.assumptions ${JSON.stringify(objs.assumptions ?? [])}`);
      const ds = await settled(gr.id);
      const by = (k) => ds.find((d) => d.consumer_kind === k) ?? null;
      const tw = by('twins'); const mm = by('memory-mappings'); const rt = by('retrieval');
      const twinState = TW === null ? null : (await q(`select verification_state from twin.twin_versions where twin_id = $1 and version = $2`, [TW, twinVersion]))[0]?.verification_state ?? null;
      const proposals = (await q(`select subject_kind, from_entity_id::text, basis from graph.mapping_reconciliations where cause_event_id = $1`, [gr.id]));
      const check = (await q(`select mismatched::int, touched from graph.retrieval_checks where outbox_event_id = $1 order by checked_at desc limit 1`, [gr.id]))[0] ?? null;
      if (ds.length === BROAD.length && ds.every((d) => d.state === 'applied')) ok(`import.revoked ${short(gr.id)}; deliveries: ${deliveryLine(ds)} — ${((Date.now() - t1) / 1000).toFixed(1)}s after the revocation`);
      else bad(`the deliveries of import.revoked: ${deliveryLine(ds) || 'none'}`);
      if (TW !== null && tw !== null && (tw.items ?? []).includes(`${TW}@${twinVersion}`) && effectsOf(tw).includes('version.unverified') && twinState === 'unverified') ok(`the twin ${short(TW)}@${twinVersion}: UNVERIFIED by the twins subscriber (version.unverified) — its boundary entity was retired and the record it cites withdrawn; twin.twin_versions.verification_state = ${twinState}`);
      else bad(`the twin after the revocation: items ${JSON.stringify(tw?.items ?? null)}, effects ${tw === null ? '—' : effectsOf(tw)}, verification_state ${twinState}`);
      if (mm !== null && mm.state === 'applied') (proposals.length > 0 ? ok : note)(`memory-mappings applied (reconciliation.proposed ×${proposals.length}): ${proposals.length === 0 ? 'no proposal — the imported entities carry no identifiers in this closure and no native edge of the mirror rests on a retired end (the consumer proposes on exactly those)' : proposals.map((x) => `${x.subject_kind} of ${short(x.from_entity_id)}: ${String(x.basis).slice(0, 80)}…`).join('; ')}`);
      if (rt !== null && rt.state === 'applied' && effectsOf(rt).includes('projections.verified') && check !== null && check.mismatched === 0) ok(`retrieval applied (projections.verified): the projections rebuilt after the retire/retract with ${check.mismatched} mismatched row(s) — touched change_kind ${check.touched?.change_kind ?? '?'}`);
      else bad(`the retrieval check: ${JSON.stringify({ delivery: rt === null ? null : [rt.state, effectsOf(rt)], check }).slice(0, 300)}`);
      for (const k of ['decisions', 'forecasts', 'scenarios']) { const d = by(k); if (d !== null && d.state === 'applied' && (d.items ?? []).length === 0) note(`${k} applied with no items — the mirror holds no ${k === 'decisions' ? 'decision package' : k.slice(0, -1)} resting on the imported knowledge (the assumption is not a decision; the walk names it under objects.assumptions)`); }
    }
    // THE MIRROR'S GRAPH as the routes show it now.
    const el = await call(`${G2()}/edges/list`, sr({ action: 'graph.read', objectType: 'EDG', sideEffect: 'none' }), { limit: 500 }, roth.token);
    const en = await call(`${G2()}/entities/list`, sr({ action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), { limit: 500 }, roth.token);
    if (el.ok && en.ok) {
      const visibleImported = (el.body.edges ?? []).filter((e) => edgeIds.includes(String(e.edge_id))).length;
      const listed = (en.body.entities ?? []).filter((e) => entityIds.includes(String(e.entity_id)));
      note(`the mirror's graph now (S. Roth): graph/edges/list ${el.body.total} edge(s) visible (${visibleImported} of the ${edgeIds.length} imported: retracted edges are not in the visible-now view); graph/entities/list shows ${listed.length} of the ${entityIds.length} imported entities${listed.length > 0 ? ` (${[...new Set(listed.map((e) => e.lifecycle_state))].join(', ')})` : ''}`);
    } else fail('graph list (s.roth)', el.ok ? en : el);
  }
}

/* ── 4. E4 → THE MIRROR ──────────────────────────────────────────────────── */
console.log('\n4. E4 → THE MIRROR — a new export of the same records with their knowledge, delivered and acknowledged; imported into the mirror: admitted AFRESH under new ids; the import.admitted event, its six deliveries, the ObservationRecorded rows');
let E4 = null; let imp4 = null;
{
  const originIds = standing === null ? [] : [...new Set(standingMap.records.map((it) => String(it.origin_ref).split('@')[0]))];
  let targets = originIds.length === 0 ? [] : await targetsByOrigin(originIds);
  if (targets.length === 0) { targets = await targetsWithKnowledge(4); note(`the standing import's records are not exportable as they stand; ${targets.length} NORDWERK internal record(s) with derived knowledge chosen instead`); }
  else note(`the targets: the standing import's ${targets.length} origin record(s) — ${targets.map((t) => `evidence ${short(t.id)}@${t.version} (${t.byte_length} bytes, tier ${t.tier})`).join(', ')}`);
  if (targets.length === 0) bad('no current NORDWERK internal evidence with confirmed rights to export');
  else E4 = await runExport(targets.map((t) => t.manifest_id), 'the customer asks again for its internal records WITH the knowledge derived from them — the package the mirror admits afresh after the earlier copy was destroyed (B17)', 'internal records and their derived knowledge under the internal ceiling; the customer\'s own tenant; the package to be exchanged with the mirror domain', 'E4 (p.novak)');
  if (E4 !== null) {
    ok(`export E4 ${short(E4.id)}: ${E4.pkg.object_count} record(s), ${E4.pkg.byte_total} bytes — opened by P. Novák, approved by H. Bergmann, executed and verified; package digest ${String(E4.pkg.package_digest).slice(0, 16)}…, signed by ${E4.pkg.signing_key_id ?? 'no key'}`);
    const sdir = join(endpoint, T, D, E4.id);
    const dv = await deliver(E4.id, STATION_KEY);
    if (!dv.ok) fail(`export/deliver E4 to ${STATION_KEY} (h.bergmann)`, dv);
    else {
      const dl = dv.body.delivery ?? {}; const tar = join(sdir, 'package.tar');
      if (field(dl, 'state') === 'delivered' && existsSync(tar) && sha256File(tar) === E4.pkg.archive_digest) ok(`H. Bergmann delivered E4 to the station: delivery ${short(field(dl, 'delivery_id'))} attempt ${field(dl, 'attempt')} — ${rel(sdir)}/package.tar (${statSync(tar).size} bytes, sha256 the archive digest), package.sig, delivery.json`);
      else bad(`the station delivery of E4: ${JSON.stringify(dl).slice(0, 300)}`);
      const rc = spawnSync(process.execPath, [STATION_RECIPIENT, endpoint, T, D, E4.id, ...(publicPem === null ? [] : ['--public-key', PUB_PEM_PATH]), '--recipient', STATION_RECIPIENT_NAME], { encoding: 'utf8' });
      console.log(indent(rc.stdout));
      const col = await collectReceipt(E4.id, String(field(dl, 'delivery_id')));
      if (rc.status === 0 && col.ok && field(col.body.delivery, 'state') === 'acknowledged') ok(`the demonstration recipient verified E4; H. Bergmann collected the receipt: ACKNOWLEDGED — the station holds the package the mirror imports`);
      else if (col.ok) bad(`the collect act: recipient exit ${rc.status}; ${JSON.stringify(col.body.delivery).slice(0, 200)}`); else fail('collect-receipt E4', col);
    }
    // THE IMPORT: M. Keller opens from the station → verified; H. Bergmann approves on the digest; M. Keller admits.
    const io = await importOpen({ kind: 'station', destinationKey: STATION_KEY, origin: { tenantId: T, domainId: D, actionId: E4.id } });
    if (!io.ok) fail('imports/open E4 (m.keller)', io);
    else {
      imp4 = io.body.import ?? {}; const checks = io.body.checks ?? imp4.checks ?? [];
      for (const c of failedChecks(checks)) console.log(`      ${checkLine(c)}`);
      if (imp4.state === 'verified' && imp4.verified === true && imp4.package_digest === E4.pkg.package_digest && failedChecks(checks).length === 0) ok(`the import ${short(imp4.import_id)} opened from the station: VERIFIED — ${checks.length} checks, none failed; the package digest E4's; the partner ${PARTNER_KEY} holds the key`);
      else bad(`the import of E4: state ${imp4.state}; failed ${JSON.stringify(failedChecks(checks).map((c) => `${c.name} — ${c.detail}`))}`);
      let t0 = Date.now();
      if (imp4.state === 'verified') {
        const ap = await importApprove(imp4.import_id, imp4.package_digest, 'the origin domain\'s package, verified against the partner\'s key; the earlier copy destroyed under the origin\'s revocation, this one admitted afresh');
        if (ap.ok && ap.body.import?.state === 'approved') ok(`H. Bergmann approved on the package digest ${String(imp4.package_digest).slice(0, 16)}…`); else fail('imports/approve E4 (h.bergmann)', ap);
        t0 = Date.now();
        const ad = await importAdmit(imp4.import_id);
        if (!ad.ok) fail('imports/admit E4 (m.keller)', ad);
        else { imp4 = ad.body.import ?? imp4; if (imp4.state === 'admitted') ok(`M. Keller admitted: ADMITTED at ${iso(imp4.admitted_at)} — batches ${(ad.body.batches ?? []).map((b) => `${b.kind} ×${b.count}`).join(', ')}; counts ${JSON.stringify(imp4.counts ?? {})}`); else bad(`the admission of E4: state ${imp4.state}`); }
      }
      if (imp4.state === 'admitted') {
        const g = await importGet(imp4.import_id);
        if (!g.ok) fail('imports/get E4 (m.keller)', g);
        else {
          const m4 = mapOfItems(g.body.items ?? []);
          const oldIds = standingMap === null ? new Set() : new Set([...standingMap.records, ...standingMap.claims, ...standingMap.entities, ...standingMap.edges].map(standingMap.idOf));
          const newIds = [...m4.records, ...m4.claims, ...m4.entities, ...m4.edges].map(m4.idOf);
          const overlap = newIds.filter((id) => oldIds.has(id));
          if (m4.reused.length === 0 && overlap.length === 0 && m4.records.length > 0) ok(`the map of E4's import: ${m4.line} — every item ADMITTED under a NEW id, none reused${standing === null ? '' : ` (the revoked import's copies are never a reuse source: ${overlap.length} id(s) in common with the revoked import ${short(standing.import_id)})`}`);
          else bad(`the map of E4's import: reused ${m4.reused.length} (${m4.reused.map((it) => it.origin_ref).join(', ')}), ids in common with the revoked import ${overlap.length}`);
          // THE EVENT: the ONE GraphChanged/import.admitted from the graph write, and the six deliveries.
          const ga = await waitOutbox(D2, 'import.admitted', imp4.import_id, t0, 60);
          if (ga === null) bad('no published GraphChanged/import.admitted for E4\'s import within 60 s');
          else {
            const p = ga.payload; const ids = p.identities ?? []; const objs = p.objects ?? {};
            const createdN = ids.filter((i) => i.role === 'created').length; const reachedN = ids.filter((i) => i.role === 'reached').length;
            const count = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'GraphChanged' and domain_id = $1 and payload #>> '{change,kind}' = 'import.admitted' and payload #>> '{cause,target_id}' = $2`, [D2, imp4.import_id]))[0].n;
            const adm = (await q(`select correlation_id::text from retention.import_events where import_id = $1 and event = 'import.admitted' limit 1`, [imp4.import_id]))[0] ?? null;
            if (count === 1 && p.change?.kind === 'import.admitted' && objs.walked === false && createdN === m4.entities.filter((it) => it.disposition === 'admitted').length && (objs.claims ?? []).length === new Set(m4.claims.map(m4.idOf)).size && (objs.evidence ?? []).length === m4.records.length && p.import?.import_id === imp4.import_id && p.import?.partner_key === PARTNER_KEY && (p.subscriptions ?? []).length === BROAD.length && adm !== null && adm.correlation_id === ga.correlation_id) ok(`GraphChanged/import.admitted ${short(ga.id)} — exactly ONE for this import, in the admission's own transaction (correlation ${short(ga.correlation_id)} = import.admitted's): identities ${createdN} created${reachedN > 0 ? `, ${reachedN} reached` : ''}; edges ${(p.relationships?.edges ?? []).length}; objects { walked ${objs.walked}, claims ${(objs.claims ?? []).length}, evidence ${(objs.evidence ?? []).length}, truncated ${objs.truncated} }; import { partner ${p.import.partner_key}, origin action ${short(p.import.origin?.action_id)}, counts ${JSON.stringify(p.import.counts ?? {})} }; cause ${p.cause?.action} by ${short(p.cause?.actor)}; subscriptions ${(p.subscriptions ?? []).map((s) => s.consumer_kind).sort().join(', ')} (the relationships subscriber selects claim.corrected alone)`);
            else bad(`the import.admitted payload: ${JSON.stringify({ count, kind: p.change?.kind, walked: objs.walked, created: createdN, claims: (objs.claims ?? []).length, evidence: (objs.evidence ?? []).length, subscriptions: (p.subscriptions ?? []).length, correlation: [ga.correlation_id, adm?.correlation_id] }).slice(0, 400)}`);
            const ds = await settled(ga.id);
            const rt = ds.find((d) => d.consumer_kind === 'retrieval') ?? null;
            const check = (await q(`select mismatched::int from graph.retrieval_checks where outbox_event_id = $1 order by checked_at desc limit 1`, [ga.id]))[0] ?? null;
            if (ds.length === BROAD.length && ds.every((d) => d.state === 'applied') && rt !== null && effectsOf(rt).includes('projections.verified') && check?.mismatched === 0) ok(`import.admitted ${short(ga.id)}; deliveries: ${ds.map((d) => `${d.consumer_kind} applied${(d.items ?? []).length > 0 ? ` (${effectsOf(d)})` : ''}`).join(', ')} — the four selectors empty (nothing of the mirror rests on ids minted a moment ago), retrieval's projection rebuild on the imported rows with ${check.mismatched} mismatched, memory-mappings nothing to propose`);
            else bad(`the deliveries of import.admitted: ${deliveryLine(ds) || 'none'}; retrieval check ${JSON.stringify(check)}`);
            const obs = await q(`select status, payload -> 'imported' ->> 'partner_key' partner, payload ->> 'acquisition_mode' mode, payload ->> 'run_id' run_id, payload ->> 'authority_class' authority, partition_seq::int from objects.object_outbox where event_type = 'ObservationRecorded' and domain_id = $1 and payload -> 'imported' ->> 'import_id' = $2 order by partition_seq`, [D2, imp4.import_id]);
            const admittedRecords = m4.records.filter((it) => it.disposition === 'admitted').length;
            if (obs.length === admittedRecords && obs.every((o) => o.status === 'published' && o.mode === 'import' && o.run_id === null && o.partner === PARTNER_KEY) && obs.every((o) => o.partition_seq < ga.partition_seq)) ok(`ObservationRecorded: ${obs.length} row(s) — one per admitted record, acquisition_mode import, run_id null, authority class ${obs[0]?.authority ?? '?'} (the intake contract's), imported { import, partner ${PARTNER_KEY}, origin }, every one published and BEFORE the GraphChanged in the tenant partition (seq ${obs.map((o) => o.partition_seq).join(', ')} < ${ga.partition_seq}) — L1-I03's announcement of an immutable evidence reference; no consumer subscribes to it (published, not consumed)`);
            else bad(`ObservationRecorded rows for the import: ${JSON.stringify(obs)} (admitted records ${admittedRecords}; GraphChanged seq ${ga.partition_seq})`);
          }
        }
      }
    }
  }
}

/* ── 5. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n5. THE STATE — and the stated limits');
{
  const il = await importsList();
  if (il.ok) for (const r of (il.body.imports ?? il.body.rows ?? []).slice(0, 8)) note(`import ${short(r.import_id)} — ${r.state}; origin action ${short(r.origin?.action_id)}; opened ${iso(r.opened_at)}${r.admitted_at ? `, admitted ${iso(r.admitted_at)}` : ''}${r.revoked_at ? `, REVOKED ${iso(r.revoked_at)} (${r.revocation_attempts ?? '?'} attempt(s))` : ''}${r.counts && Object.keys(r.counts).length > 0 ? `; counts ${JSON.stringify(r.counts)}` : ''}`); else fail('imports/list', il);
  const live = (await q(`select count(*)::int n from retention.imports where domain_id = $1 and state = 'admitted'`, [D2]))[0].n;
  if (imp4 !== null && imp4.state === 'admitted' && live === 1) ok(`the mirror holds ONE live copy of the NORDWERK knowledge: E4's import ${short(imp4.import_id)} (admitted, left for the next run's scene 2)${standing === null ? '' : `; the standing import ${short(standing.import_id)} revoked`}`);
  else bad(`admitted imports in the mirror now: ${live}`);
}
note('STATED: the propagation reaches the tenant\'s OWN domains on this installation (the origin\'s act finds the admitted imports of its package across them and executes the revocation there as the same principal); a foreign installation is the STATION path — the origin\'s signed revocation.json read at the import\'s origin path, verified against the partner\'s key, the receipt written beside it (the harness\'s phase6-retention-b17 S4)');
note('STATED: a LEGAL HOLD holds the revocation — the held record\'s tombstone is refused, the import stays revoking with the refused item named, the receipt says copies_destroyed false and the origin\'s notice is answered MISMATCHED until the hold is lifted and the steward retries (the harness\'s S3); no record of the mirror was under a hold here');
note('STATED: the memory-mappings method changed in B17 — the origin\'s live subscription was revoked and registered anew in scene 1, the replacement replaying from the revoked cursor; on this closure the imported entities carry no identifiers, so the revocation raised no identifier proposal (the harness\'s S2 proves the proposal on an identifier of a retired entity)');
note('STATED: no forecast, scenario or decision was issued through the routes in the mirror (a forecast needs a registered series with observations — the demonstration\'s series are the origin domain\'s); the twin and the assumption are the mirror\'s reach here; the full reach is the harness\'s S2');
note('STATED: a twin element cites a `claim` as a CLM object (twin.service.ts OBJECT_TYPE_OF) — the imported knowledge on this demonstration is REL and ENT claims, so K. Vogel\'s twin cites the imported RECORD and the imported REL claim is reached through S. Roth\'s assumption and the walk');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: the mirror's subscribers registered and served; a twin and an assumption built on the knowledge a second domain of the tenant admitted from the origin; the origin's revocation of that package reaching every recipient — the station with a SIGNED notice the customer-side recipient verifies before it obeys, the mirror's import destroyed where the product holds the copies (edges retracted, entities retired, versions withdrawn with their lineage, bytes tombstoned and gone) by the same governed act, the receipt acknowledged on the origin's ledger — and the mirror's subscribers told: the twin unverified, the assumption in the walk's reach, the projections verified; then a fresh package admitted AFRESH under new ids, announced to the subscribers as ONE import.admitted event with one ObservationRecorded per record.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-retention-b17 on a fresh database): the forecast, scenario and decision reach of import.revoked; the identifier proposal on a retired entity; the legal hold refusing the record step and the steward completing after the lift; the pending path of a domain administrator without authority in the importing domain; the foreign origin's signed notice from the station (unsigned, another key, another digest refused with nothing destroyed; the partner's rotated key admitted); the truncation of the event's lists; the imported claim refused at the review gate.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
