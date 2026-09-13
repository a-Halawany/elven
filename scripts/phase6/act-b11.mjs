#!/usr/bin/env node
/**
 * CP-6 batch B11 on the demonstration (NORDWERK, eye_demo): the archive tier, the customer export package and the safe
 * referential scope of a deletion (migration 0070 §2–§8) exercised by the personas through the REAL HTTP path, each
 * scene stating the effect it produced and where nothing happened, saying so. (The governed credential path and the
 * UN Comtrade act of the same batch run from their own scripts — the runner records them before this act.)
 *
 *   1. ARCHIVE: the current eu-sanctions-rss evidence B10 reviewed — P. Novák opens an archive action on its manifest,
 *      H. Bergmann approves on the scope digest, P. Novák executes (the bytes copied to the archive tier, the move
 *      recorded, the hot copy removed after the commit) and verifies against the archive contract; no DeletionVerified;
 *      A. Hoffmann still downloads the evidence (availability archived, the digest the manifest's); the host's paths.
 *   2. CUSTOMER EXPORT: the two most recent current NORDWERK internal evidence objects — an export action with the
 *      classification ceiling `internal`, approved, executed (the package built under the export namespace, its digests
 *      recorded); the customer's verifier run on the package; verified; the export read; H. Bergmann REVOKES it — the
 *      read refuses, the directory is gone, the source evidence still downloads.
 *   3. SAFE SCOPE: a superseded evidence version whose bytes a claim under review still names — P. Novák's deletion
 *      PAUSES (unresolved_dependency → human_review) with the item blocking and the dependents named; the approval
 *      refused; L. Ferreira decides the case; resolved again → approved → executed → verified → DeletionVerified.
 *
 * Idempotence: every scene creates its own new actions; the archive of scene 1 moves the bytes once (a second run finds
 * the manifest archived and says so). The script is an act, not a seed.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
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
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`; const O = `${X}/observation`; const I = `${X}/intelligence`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => `${String(id).slice(0, 8)}…`;
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann'); const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira'); const dvorak = await who('m.dvorak');
const pn = (over) => as(novak, scope, { purposeId: 'retention', ...over });
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const ah = (over) => as(hoffmann, scope, { purposeId: 'observation', ...over });
const lf = (over) => as(ferreira, scope, { purposeId: 'intelligence', ...over });
const cm = (over) => as(dvorak, scope, { purposeId: 'observation', ...over });
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
// The vault roots AS THE API RESOLVES THEM (apps/api/src/config/config.ts: every PATH_KEYS value that is relative is resolved against the
// WORKSPACE root — the directory holding pnpm-workspace.yaml, found by walking up from the module — whatever the process's cwd; an
// absolute EYE_VAULT_*_ROOT, as restore.sh's start_api passes, is taken as it is). path.resolve does both; path.join would neither.
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);

const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const getAction = (id) => call(`${R}/actions/${id}/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
const download = (evdId) => call(`${O}/evidence/${evdId}/download`, ah({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const detail = (evdId) => call(`${O}/evidence/${evdId}/get`, ah({ action: 'observation.read.evidence', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const deletionVerified = async (since, id) => (await q(`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload ->> 'action_id' = $4`, [T, D, since, id]))[0].n;
const checksOf = (id) => q(`select check_name, expected, observed, passed from retention.verifications where action_id = $1 order by check_name`, [id]);

console.log('\n=== CP-6 batch B11 · the archive tier, the customer export package and the safe referential scope on the demonstration ===\n');

/* ── 1. ARCHIVE ─────────────────────────────────────────────────────────── */
console.log('1. ARCHIVE — the current eu-sanctions-rss evidence (B10 reviewed it) moved to the archive tier; retrieval still served');
{
  const t = (await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.locator, m.content_digest, m.byte_length, o.retention_profile
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and s.source_key = 'eu-sanctions-rss' and m.legal_hold = false
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and observation.manifest_tier(m.manifest_id) = 'hot'
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 1`, [T, D]))[0] ?? null;
  if (t === null) bad('no current eu-sanctions-rss evidence in the hot tier to archive (a previous run archived it, or the source has none)');
  else {
    note(`the target: evidence ${short(t.id)}@${t.version} — manifest ${short(t.manifest_id)}, ${t.byte_length} bytes, digest ${t.content_digest.slice(0, 12)}…, hot at ${join(vaultRoot('evidence'), t.locator).replace(ROOT + '/', '')}`);
    const since = await mark();
    const o = await open({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [t.manifest_id] }, retentionProfile: t.retention_profile, reason: 'the sanctions feed evidence is past its hot window; kept, cold' });
    if (!o.ok) fail('open archive (p.novak)', o);
    else {
      const id = o.body.action.actionId; ok(`P. Novák opened archive action ${short(id)} (${o.body.action.state})`);
      const rs = await resolve(id);
      if (!rs.ok) fail('resolve', rs);
      else {
        const sc = rs.body.scope; ok(`scope resolved: ${sc.items} item(s), ${sc.execute} to execute, ${sc.held} held; digest ${String(sc.scope_digest).slice(0, 12)}…`);
        const items = await q(`select disposition, reason, details from retention.scope_items where action_id = $1`, [id]);
        for (const it of items) note(`  ${it.disposition}: ${it.reason} (tier ${it.details?.tier ?? '?'})`);
        const ap = await approve(id, sc.scope_digest, 'the sanctions evidence is kept cold; the record and its bytes stay retrievable');
        if (!ap.ok) fail('approve (h.bergmann)', ap);
        else {
          ok('H. Bergmann approved on the scope digest');
          const ex = await execute(id);
          if (!ex.ok) fail('execute (p.novak)', ex);
          else {
            const e = ex.body.execution;
            ok(`executed: ${e.executed} archived, ${e.refused} refused; hot copies removed after the commit: ${e.bytes?.removed?.length ?? 0}, failed ${e.bytes?.failed?.length ?? 0}`);
            const tier = (await q(`select from_tier, tier, action_id::text, content_digest, moved_at from observation.blob_tier_records where manifest_id = $1 order by moved_at desc limit 1`, [t.manifest_id]))[0];
            const custody = (await q(`select event, details from observation.custody_events where manifest_id = $1 and event = 'custody.archived' order by occurred_at desc limit 1`, [t.manifest_id]))[0];
            note(`the tier ledger: ${tier ? `${tier.from_tier} → ${tier.tier} by action ${short(tier.action_id)} at ${new Date(tier.moved_at).toISOString()}, digest ${tier.content_digest.slice(0, 12)}…` : 'NO ROW'}; custody: ${custody ? custody.event : 'NO ROW'}`);
            note(`the host: archive path ${existsSync(join(vaultRoot('archive'), t.locator)) ? 'PRESENT' : 'ABSENT'}, hot path ${existsSync(join(vaultRoot('evidence'), t.locator)) ? 'PRESENT' : 'ABSENT'}`);
            const vf = await verify(id);
            if (!vf.ok) fail('verify', vf);
            else {
              const v = vf.body.verification; ok(`verified: state ${v.state}, verified ${v.verified}`);
              for (const c of await checksOf(id)) note(`  ${c.passed ? 'PASS' : 'FAIL'} ${c.check_name} — expected ${JSON.stringify(c.expected)}, observed ${JSON.stringify(c.observed)}`);
              await sleep(1500);
              if ((await deletionVerified(since, id)) === 0) ok('no DeletionVerified published for the archive'); else bad('a DeletionVerified was published for an archive');
            }
            const dl = await download(t.id);
            if (dl.ok && dl.body.download?.contentDigest === t.content_digest) ok(`A. Hoffmann downloads the evidence: HTTP ${dl.status}, ${dl.body.download.byteLength} bytes, digest the manifest's, integrity ${dl.body.download.integrity}, tier ${dl.body.download.tier ?? '?'}, availability ${dl.body.download.availability ?? '?'}`); else bad(`the download after the archive: ${dl.status} ${dl.body?.message ?? ''}`);
            const dt = await detail(t.id);
            if (dt.ok) note(`the detail: manifest tier ${dt.body.evidence?.manifest?.tier ?? dt.body.manifest?.tier ?? '?'}, archived at ${dt.body.evidence?.manifest?.archived_at ?? dt.body.manifest?.archived_at ?? '?'}, availability ${JSON.stringify(dt.body.availability ?? null)}`);
          }
        }
      }
    }
  }
}

/* ── 2. CUSTOMER EXPORT ─────────────────────────────────────────────────── */
console.log('\n2. CUSTOMER EXPORT — the two most recent current NORDWERK internal evidence objects packaged under the export namespace, verified offline by the customer\'s verifier, then revoked');
{
  const targets = await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.byte_length, s.source_key, o.classification
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and s.source_key = 'nordwerk-internal' and s.rights_state = 'confirmed' and o.classification = 'internal'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 2`, [T, D]);
  const above = (await q(`select o.object_id::text id, (o.payload ->> 'manifest_id') manifest_id, o.classification from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification in ('confidential', 'restricted') and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) limit 1`, [T, D]))[0] ?? null;
  if (targets.length === 0) bad('no current NORDWERK internal evidence with confirmed rights to export');
  else {
    note(`the targets: ${targets.map((x) => `${short(x.id)}@${x.version} (${x.byte_length} bytes)`).join(', ')}${above ? `; plus ${short(above.id)} classified ${above.classification} — the redaction gate excludes it under the ceiling internal` : '; no confidential object on the demonstration — the redaction gate is exercised on the harness'}`);
    const manifestIds = [...targets.map((x) => x.manifest_id), ...(above ? [above.manifest_id] : [])];
    const o = await open({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds, classificationCeiling: 'internal', destination: 'export' }, retentionProfile: null, reason: 'the customer asks for its internal records as an open package' });
    if (!o.ok) fail('open export (p.novak)', o);
    else {
      const id = o.body.action.actionId; ok(`P. Novák opened customer export ${short(id)} (${o.body.action.state}); ceiling internal, destination export`);
      const rs = await resolve(id);
      if (!rs.ok) fail('resolve', rs);
      else {
        const sc = rs.body.scope; ok(`scope resolved: ${sc.items} item(s), ${sc.execute} to execute, excluded ${sc.excluded ?? 0}; digest ${String(sc.scope_digest).slice(0, 12)}…`);
        for (const it of await q(`select disposition, reason, details from retention.scope_items where action_id = $1 order by dependency_order`, [id])) note(`  ${it.disposition}: ${it.reason}${it.details?.gate ? ` [gate ${it.details.gate}]` : ''}`);
        const ap = await approve(id, sc.scope_digest, 'internal records only, under the ceiling; the customer\'s own tenant');
        if (!ap.ok) fail('approve (h.bergmann)', ap);
        else {
          ok('H. Bergmann approved on the scope digest');
          const ex = await execute(id);
          if (!ex.ok) fail('execute (p.novak)', ex);
          else {
            const e = ex.body.execution; const p = e.package ?? null;
            ok(`executed: ${e.executed} exported, ${e.refused} refused; package ${p ? `${p.locator_prefix} — ${p.objects} object(s), ${p.excluded} excluded, ${p.bytes} bytes, package digest ${String(p.package_digest).slice(0, 16)}…, manifest digest ${String(p.manifest_digest).slice(0, 16)}…` : 'NONE'}`);
            const dir = p ? join(vaultRoot('export'), p.locator_prefix) : null;
            if (dir !== null) {
              const vr = spawnSync('node', [join(ROOT, 'scripts', 'retention', 'verify-export.mjs'), dir, '--expect-package-digest', p.package_digest], { encoding: 'utf8' });
              console.log(vr.stdout.split('\n').map((l) => `      ${l}`).join('\n'));
              if (vr.status === 0) ok('the customer\'s verifier (reads the package alone): PACKAGE OK'); else bad(`the verifier failed (exit ${vr.status}) ${vr.stderr.slice(0, 300)}`);
            }
            const vf = await verify(id);
            if (!vf.ok) fail('verify', vf);
            else {
              ok(`verified: state ${vf.body.verification.state}, verified ${vf.body.verification.verified}`);
              for (const c of await checksOf(id)) note(`  ${c.passed ? 'PASS' : 'FAIL'} ${c.check_name}`);
            }
            const rd = await call(`${R}/actions/${id}/export/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
            if (rd.ok) ok(`the export read: ${rd.body.files?.length ?? '?'} file(s); signature ${JSON.stringify(rd.body.manifest?.signature ?? null)}`); else fail('export get', rd);
            const rv = await call(`${R}/actions/${id}/export/revoke`, hb({ action: 'retention.export.revoke', objectType: 'RTA', objectId: id, consequence: 'C2' }), { reason: 'the package was handed over; it is not to be served again' }, bergmann.token);
            if (rv.ok) ok(`H. Bergmann revoked the package: ${JSON.stringify(rv.body.revocation).slice(0, 200)}; bytes removed ${rv.body.bytes?.removed}`); else fail('revoke (h.bergmann)', rv);
            const rd2 = await call(`${R}/actions/${id}/export/get`, pn({ action: 'retention.read', objectType: 'RTA', objectId: id, sideEffect: 'none' }), {}, novak.token);
            if (rd2.status === 409) ok(`the read after the revocation refused: 409 ${rd2.body?.message ?? ''}`); else bad(`expected 409 after the revocation, got ${rd2.status}`);
            if (dir !== null) note(`the host: the package directory is ${existsSync(dir) ? 'PRESENT' : 'GONE'}`);
            const dl = await download(targets[0].id);
            if (dl.ok) ok(`the source evidence still downloads (A. Hoffmann): HTTP ${dl.status}, ${dl.body.download.byteLength} bytes`); else bad(`the source evidence after the revocation: ${dl.status}`);
          }
        }
      }
    }
  }
}

/* ── 3. SAFE SCOPE ──────────────────────────────────────────────────────── */
console.log('\n3. SAFE SCOPE — a deletion of a superseded evidence version whose bytes a claim under review still names PAUSES with the dependents named; decided, it proceeds');
{
  let target = (await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.content_digest, o.retention_profile, s.source_key
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'corrected' and m.legal_hold = false
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
      and exists (select 1 from intelligence.claim_lineage l where l.evidence_digest = m.content_digest)
    order by o.recorded_at limit 1`, [T, D]))[0] ?? null;
  if (target === null) {
    note('no superseded evidence version with claims naming its bytes: the situation is made — the collection manager corrects the current eu-sanctions-rss evidence a claim was extracted from');
    const cur = (await q(`select o.object_id::text id, (o.payload ->> 'manifest_id') manifest_id, m.source_id::text source_id from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
      where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and exists (select 1 from intelligence.claim_lineage l where l.evidence_digest = m.content_digest)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id) order by o.recorded_at desc limit 1`, [T, D]))[0] ?? null;
    if (cur === null) bad('no current evidence with extracted claims to correct');
    else {
      const sub = await call(`${O}/corrections/submit`, ah({ action: 'observation.correction.receive', objectType: 'COR' }), { sourceId: cur.source_id, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'B11 act: the publisher restated the record', reason: 'the publisher restated the record the claims were extracted from', affectedEvdIds: [cur.id] }, hoffmann.token);
      if (!sub.ok) fail('correction submit (a.hoffmann)', sub);
      else {
        const caseId = sub.body.correction?.caseId ?? sub.body.caseId;
        const ap = await call(`${O}/corrections/${caseId}/apply`, cm({ action: 'observation.correction.apply', objectType: 'COR', objectId: caseId }), { decision: 'apply', affectedEvdIds: [cur.id], reason: 'restatement verified against the publisher (B11 act)' }, dvorak.token);
        if (ap.ok) { ok(`M. Dvořák applied correction ${short(caseId)}: evidence ${short(cur.id)}'s prior version is now corrected; its claims name a retired version's bytes`); }
        else fail('correction apply (m.dvorak)', ap);
        target = (await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.content_digest, o.retention_profile, s.source_key
          from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id
          where o.object_id = $1 and o.lifecycle_state = 'corrected' order by o.object_version desc limit 1`, [cur.id]))[0] ?? null;
      }
    }
  }
  if (target === null) bad('no target for the safe-scope scene');
  else {
    note(`the target: evidence ${short(target.id)}@${target.version} (${target.source_key}), manifest ${short(target.manifest_id)}, digest ${target.content_digest.slice(0, 12)}…`);
    const claims = await q(`select l.claim_object_id::text id, l.claim_version::int v from intelligence.claim_lineage l where l.evidence_digest = $1 and not exists (select 1 from graph.edges_current e where e.claim_object_id = l.claim_object_id and e.state = 'asserted') order by l.claim_version limit 1`, [target.content_digest]);
    const edges = (await q(`select count(*)::int n from graph.edges_current e join intelligence.claim_lineage l on l.claim_object_id = e.claim_object_id and l.claim_version = e.claim_version where e.state = 'asserted' and l.evidence_digest = $1`, [target.content_digest]))[0].n;
    note(`claims naming these bytes without an asserted edge: ${claims.length}; asserted edges resting on them: ${edges}`);
    let caseId = null;
    if (claims.length > 0) {
      const ch = await call(`${I}/review/request`, as(hoffmann, scope, { purposeId: 'intelligence', action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId: claims[0].id, claimVersion: claims[0].v, reason: 'B11 act: the restated record may change what this claim asserts' }, hoffmann.token);
      if (ch.ok) { caseId = ch.body.review.caseId; ok(`A. Hoffmann challenged claim ${short(claims[0].id)}@${claims[0].v}: review case ${short(caseId)} queued`); } else fail('challenge', ch);
    }
    const since = await mark();
    const o = await open({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: target.manifest_id }, retentionProfile: target.retention_profile, reason: 'the superseded version is past its retention' });
    if (!o.ok) fail('open deletion (p.novak)', o);
    else {
      const id = o.body.action.actionId; ok(`P. Novák opened deletion ${short(id)}`);
      const rs = await resolve(id);
      if (!rs.ok) fail('resolve', rs);
      else {
        const sc = rs.body.scope;
        const row = (await q(`select state, failure_class, disposition, failure_reason from retention.actions_current where action_id = $1`, [id]))[0];
        const items = await q(`select disposition, reason, details from retention.scope_items where action_id = $1`, [id]);
        note(`resolved: state ${sc.state}, ${sc.items} item(s), ${sc.execute} to execute, ${sc.blocking} blocking — action ${row.state} / ${row.failure_class} / ${row.disposition}: ${row.failure_reason ?? ''}`);
        for (const it of items) note(`  ${it.disposition}: ${it.reason}; dependents ${JSON.stringify(it.details?.dependents ?? null)}`);
        if (sc.state === 'paused' && row.failure_class === 'unresolved_dependency' && row.disposition === 'human_review' && items.some((it) => it.disposition === 'blocking')) ok('PAUSED: the referential scope could not be proven safe — the dependents named for a person');
        else if (caseId === null && edges === 0) note('nothing rested on the version: the deletion resolved without a block (no live case, no edge)');
        else bad(`expected a paused action with a blocking item, got ${sc.state}`);
        const ap = await approve(id, sc.scope_digest, 'approving a paused scope (must be refused)');
        if (ap.status === 409) ok(`H. Bergmann's approval of the paused action refused: 409 ${ap.body?.message ?? ''}`); else note(`the approval attempt answered ${ap.status}`);
        if (edges > 0) note('an asserted edge rests on the version: the route is the owner\'s (retract, then resolve again) — the scene stops here');
        else {
          if (caseId !== null) {
            const dec = await call(`${I}/review/${caseId}/decide`, lf({ action: 'intelligence.review.decide', objectType: 'REV', objectId: caseId, consequence: 'C2' }), { decision: 'approve', reason: 'the restatement does not change the claim' }, ferreira.token);
            if (dec.ok) ok(`L. Ferreira decided case ${short(caseId)}: ${dec.body.review.state}`); else fail('decide (l.ferreira)', dec);
          }
          const rs2 = await resolve(id);
          if (!rs2.ok) fail('resolve again', rs2);
          else {
            const sc2 = rs2.body.scope; ok(`resolved again: state ${sc2.state}, ${sc2.execute} to execute; digest ${String(sc2.scope_digest).slice(0, 12)}… (was ${String(sc.scope_digest).slice(0, 12)}…)`);
            if (sc2.state === 'scope_resolved') {
              const ap2 = await approve(id, sc2.scope_digest, 'the version is no longer load-bearing; the superseded bytes go');
              if (!ap2.ok) fail('approve again', ap2);
              else {
                const ex = await execute(id);
                if (!ex.ok) fail('execute', ex);
                else {
                  ok(`executed: ${ex.body.execution.executed} tombstoned, bytes removed ${ex.body.execution.bytes?.removed?.length ?? 0}`);
                  const vf = await verify(id);
                  if (vf.ok) { ok(`verified: ${vf.body.verification.state}`); await sleep(1500); const dv = (await q(`select payload from objects.object_outbox where event_type = 'DeletionVerified' and payload ->> 'action_id' = $1 and created_at >= $2 limit 1`, [id, since]))[0]; if (dv) ok(`DeletionVerified published: executed ${JSON.stringify(dv.payload.executed ?? dv.payload.execution ?? null)}, residuals ${JSON.stringify(dv.payload.residuals ?? dv.payload.residual_summary ?? null).slice(0, 200)}`); else bad('no DeletionVerified'); } else fail('verify', vf);
                }
              }
            } else note(`still ${sc2.state}: ${JSON.stringify((await q(`select failure_reason from retention.actions_current where action_id = $1`, [id]))[0])}`);
          }
        }
      }
    }
  }
}

await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'the act completed with every scene producing its effect' : `${failureCount()} scene step(s) did not produce the effect claimed`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
