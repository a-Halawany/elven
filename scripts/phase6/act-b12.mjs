#!/usr/bin/env node
/**
 * CP-6 batch B12 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): the governed
 * RESTORE-TO-HOT port and the COLD-TIER MANAGER (migration 0072) exercised by the personas through the REAL HTTP path, each scene
 * stating the effect it produced on the host and in the ledgers, and where nothing happened, saying so.
 *
 *   1. THE STATE BEFORE: the cold tier's observable state (retention.tier_state + the vault's inventory of both blob roots) as the
 *      collection manager reads it — the archived manifests by source (the two NORDWERK records the B11 closure act archived; the
 *      eu-sanctions evidence of the B11 act), the policy undeclared (the defaults in force).
 *   2. RESTORE: P. Novák opens a restore of the NORDWERK records in the archive tier, H. Bergmann approves on the scope digest,
 *      P. Novák executes — each archive copy STAGED into the hot root under the attempt's own name, the move recorded under the
 *      manifest's lock, published under the locator after the commit, the archive copy removed — and verifies against the restore
 *      contract; the host's paths; the tier ledger's archive → hot rows; custody.restored; A. Hoffmann downloads P from the hot tier
 *      (tier hot, availability verified, the custody row served_from published).
 *   3. THE MANAGER'S POLICY: the platform administrator declares the domain's tier policy at DEMONSTRATION settings — a budget of one
 *      byte per day, one open per evaluation, one attempt, escalation after zero seconds, a restore window of zero seconds — so each
 *      rule fires within this act (scene 7 restores sane values); tier/state shows it.
 *   4. BUDGET → RETRY → ESCALATION: an archive of P refused AT ADMISSION by the budget (409 budget_exhausted; paused for retry; NO
 *      attempt counted — the state never moved; the approvals revoked); the budget lifted, re-resolved, re-approved, executed (attempt 1
 *      — the whole retry budget under max attempts 1) and verified. Then ESCALATION BY AGE: the budget restored, an archive of Q paused
 *      by it, and the next schedule evaluation escalates it for human review (escalate_after 0 seconds) and names it; withdrawn.
 *   5. THE RESTORE WINDOW and ORDERING: the demonstration's archive schedule (declared if absent: profile "24 months", due after 0
 *      seconds, the evidence of nordwerk-internal) evaluated under one open per evaluation and a restore window of zero seconds —
 *      OLDEST DUE FIRST, one action per evaluation, the rest DEFERRED and counted on the schedule; a restored record is due at its
 *      RESTORE instant, so it returns to the cold tier by the schedule (archive → restore → retrieval → re-archive: the full cycle in
 *      one ledger); what the demonstration keeps hot is withdrawn.
 *   6. THE SWEEPER'S WALK: a redundant staged copy of an archived manifest and a stale temp file planted in the archive root; the
 *      platform administrator's sweep removes both (stagedCopiesRemoved 1, tempFilesRemoved 1) and reports no archive orphan; the
 *      published copy untouched, its bytes the manifest's digest.
 *   7. THE STATE AFTER: tier/state again; the policy re-declared at sane values (budget unbounded, 200 opens per evaluation, 3
 *      attempts, escalate after 7 days, restore window 30 days — the defaults' equivalent) so the demonstration is left governed as it
 *      was found.
 *
 * What the demonstration shows and what the harness alone proves is stated at the end (the refusal after a FAILED attempt needs a copy
 * that fails: the harness corrupts one in an isolated vault; the demonstration corrupts nothing). Idempotence: every scene creates its
 * own new actions; scene 2 restores whatever NORDWERK records are in the archive tier (or says there are none and takes any archived
 * internal record); scene 5 re-archives one restored record by the schedule; the schedule stays declared (it acts only on an
 * evaluation). The script is an act, not a seed. Nothing here prints a credential.
 */
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const novak = await who('p.novak'); const bergmann = await who('h.bergmann'); const hoffmann = await who('a.hoffmann'); const dvorak = await who('m.dvorak');
const pn = (over) => as(novak, scope, { purposeId: 'retention', ...over });
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const ah = (over) => as(hoffmann, scope, { purposeId: 'observation', ...over });
const cm = (over) => as(dvorak, scope, { purposeId: 'retention', ...over });
const adm = (over) => as(admin, scope, { purposeId: 'platform.administration', ...over });
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
// The vault roots AS THE API RESOLVES THEM (a relative root against the workspace root; an absolute EYE_VAULT_*_ROOT as it is).
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);
const domainDir = (name) => join(vaultRoot(name), T, D);
const hostPath = (name, locator) => join(vaultRoot(name), locator);
const rel = (p) => p.replace(ROOT + '/', '');
/** The staged names under a root's domain directory (`<uuid>.staging-<attempt>` exactly — a staged copy's own temp file is a temp, C17). */
const stagedNames = (name) => (existsSync(domainDir(name)) ? readdirSync(domainDir(name)).filter((n) => /^[0-9a-f-]{36}\.staging-[0-9a-f-]{36}$/.test(n)) : []);
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o !== null && o !== undefined && k in o).map((k) => [k, o[k]]));

const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
const withdraw = (id, reason) => call(`${R}/actions/${id}/withdraw`, pn({ action: 'retention.action.withdraw', objectType: 'RTA', objectId: id }), { reason }, novak.token);
const evaluate = () => call(`${R}/schedules/evaluate`, pn({ action: 'retention.schedule.evaluate', objectType: 'RTS' }), {}, novak.token);
const declareSchedule = (payload) => call(`${R}/schedules/declare`, adm({ action: 'retention.schedule.declare', objectType: 'RTS' }), payload, admin.token);
/** The cold-tier manager's policy: the platform administrator's act (retention.tier.declare, object type RTP, C2); every field named, so no default is taken by accident. */
const declareTier = (payload) => call(`${R}/tier/declare`, adm({ action: 'retention.tier.declare', objectType: 'RTP', consequence: 'C2' }), payload, admin.token);
/** The cold tier's observable state (retention.read on RTP, a consequential read): P. Novák's by default; the collection manager's in scenes 1 and 7. */
const tierStateAs = (build, session) => call(`${R}/tier/state`, build({ action: 'retention.read', objectType: 'RTP', sideEffect: 'none' }), {}, session.token);
const tierState = () => tierStateAs(pn, novak);
const sweep = () => call(`${O}/sweep`, adm({ action: 'observation.sweeper.reconcile', objectType: 'RUN' }), {}, admin.token);
const download = (evdId) => call(`${O}/evidence/${evdId}/download`, ah({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const detail = (evdId) => call(`${O}/evidence/${evdId}/get`, ah({ action: 'observation.read.evidence', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);

const actionRow = async (id) => (await q(`select state, failure_class, disposition, failure_reason, attempts::int, escalated_at from retention.actions_current where action_id = $1`, [id]))[0] ?? null;
const approvalsLive = async (id) => (await q(`select count(*)::int n from retention.approvals where action_id = $1 and revoked_at is null`, [id]))[0].n;
const lastEvent = async (id, event) => (await q(`select details, occurred_at from retention.action_events where action_id = $1 and event = $2 order by occurred_at desc limit 1`, [id, event]))[0] ?? null;
const checksOf = (id) => q(`select check_name, passed, expected, observed from retention.verifications where action_id = $1 order by verified_at, check_name`, [id]);
const executionsOf = (id) => q(`select port, outcome, evidence from retention.executions where action_id = $1 order by executed_at`, [id]);
const ledger = (manifestId) => q(`select from_tier, tier, action_id::text action_id, moved_at from observation.blob_tier_records where manifest_id = $1 order by moved_at`, [manifestId]);
const tierOf = async (manifestId) => (await q('select observation.manifest_tier($1::uuid) t', [manifestId]))[0].t;
const custodyLast = async (manifestId, event) => (await q(`select details, occurred_at from observation.custody_events where manifest_id = $1 and event = $2 order by occurred_at desc limit 1`, [manifestId, event]))[0] ?? null;
const scheduleLast = async (id) => (await q(`select last_evaluation from retention.schedules where schedule_id = $1`, [id]))[0]?.last_evaluation ?? null;
/** The current admitted internal evidence records of a source (any source when null) whose manifest is in the given tier — the closure act's target query, the tier a parameter. */
const targetsIn = (tier, sourceKey, limit) => q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, m.locator, m.content_digest, m.byte_length, m.legal_hold, o.retention_profile, s.source_key
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and o.classification = 'internal' and s.rights_state = 'confirmed'
      and ($3::text is null or s.source_key = $3) and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and observation.manifest_tier(m.manifest_id) = $4
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit $5`, [T, D, sourceKey, tier, limit]);
/** A hot NORDWERK record other than the given manifests (the stand-in when scene 2 restored fewer than two). */
const hotStandIn = async (excludeManifestIds) => (await targetsIn('hot', 'nordwerk-internal', 10)).find((t) => !excludeManifestIds.includes(t.manifest_id)) ?? null;
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
  ok(`${label}: P. Novák opened ${short(id)}; scope resolved (${sc.items} item(s), ${sc.execute} to execute, ${sc.held} held, ${sc.excluded ?? 0} excluded; digest ${String(sc.scope_digest).slice(0, 12)}…); H. Bergmann approved`);
  return { id, digest: sc.scope_digest };
};
/** RESOLVE AGAIN → APPROVE AGAIN on a paused action (a retry in this product: the pause revoked the approvals); false when a step failed. */
const reapproved = async (id, rationale) => {
  const rs = await resolve(id);
  if (!rs.ok) { fail('re-resolve', rs); return false; }
  const ap = await approve(id, rs.body.scope.scope_digest, rationale);
  if (!ap.ok) { fail('re-approve (h.bergmann)', ap); return false; }
  ok(`re-resolved (state ${rs.body.scope.state}, ${rs.body.scope.execute} to execute, digest ${String(rs.body.scope.scope_digest).slice(0, 12)}…) and re-approved by H. Bergmann`);
  return true;
};
const policyLine = (p) => `version ${p.version}: budget ${p.budget_bytes_per_day ?? 'unbounded'}${p.budget_bytes_per_day === null || p.budget_bytes_per_day === undefined ? '' : ' byte(s) per day'}, ${p.max_opens_per_evaluation} open(s) per evaluation, ${p.max_attempts} attempt(s), escalate after ${p.escalate_after}, restore window ${p.restore_hot_for}`;
/** The platform administrator declares the policy (the next version); the policy row as the server returned it, or null. */
const declared = async (label, payload) => {
  const r = await declareTier(payload);
  if (!r.ok) { fail(`tier/declare ${label} (platform-admin)`, r); return null; }
  ok(`the platform administrator declared the tier policy — ${label}: ${policyLine(r.body.policy)}`);
  return r.body.policy;
};
const inventory = (i) => (i === null || i === undefined ? '?' : i.error ? `could not be listed (${i.error})` : `${i.blobs} blob(s), ${i.staged} staged, ${i.temp} temp`);
const showState = (s) => {
  const p = s.policy;
  note(`policy: ${p.declared ? `declared, ${policyLine(p)}` : `UNDECLARED — the defaults: budget unbounded, ${p.max_opens_per_evaluation} opens per evaluation, ${p.max_attempts} attempts, escalate after ${p.escalate_after}, restore window ${p.restore_hot_for}`}`);
  note(`tiers: hot ${s.tiers.hot.manifests} manifest(s) / ${s.tiers.hot.bytes} bytes, archive ${s.tiers.archive.manifests} / ${s.tiers.archive.bytes}; moves in the last 24 h: archived ${s.moves_24h.archived.count} (${s.moves_24h.archived.bytes} bytes), restored ${s.moves_24h.restored.count} (${s.moves_24h.restored.bytes} bytes)`);
  note(`budget: ${s.budget.bytes_per_day ?? 'unbounded'} per day, used ${s.budget.used_24h}, remaining ${s.budget.remaining ?? 'unbounded'}, the window resets at ${iso(s.budget.window_resets_at)}`);
  note(`actions: executing ${s.actions.executing}, paused for retry ${s.actions.paused_retry}, paused for human review ${s.actions.paused_human_review}, escalated ${s.actions.escalated}, pending bytes residuals ${s.actions.pending_bytes_residuals}; restored manifests awaiting their re-archive ${s.restored_awaiting_rearchive}`);
  note(`schedules: ${s.schedules.length === 0 ? 'none' : s.schedules.map((x) => `${short(x.schedule_id)} ${x.action_kind} of profile "${x.retention_profile}" after ${x.due_after} (${x.state}; last evaluation ${JSON.stringify(x.last_evaluation ?? {})})`).join('; ')}`);
  note(`the vault: evidence root ${inventory(s.vault?.evidence)}; archive root ${inventory(s.vault?.archive)}`);
};
/** The demonstration setting (scene 3): every rule at a value that fires within this act. Scene 7 restores the sane values. */
const DEMO_POLICY = { budgetBytesPerDay: 1, maxOpensPerEvaluation: 1, maxAttempts: 1, escalateAfter: '0 seconds', restoreHotFor: '0 seconds' };
const SANE_POLICY = { budgetBytesPerDay: null, maxOpensPerEvaluation: 200, maxAttempts: 3, escalateAfter: '7 days', restoreHotFor: '30 days' };

console.log(`\n=== CP-6 batch B12 on the demonstration (${env.EYE_DB_NAME ?? 'eye_demo'} at ${process.env.EYE_API ?? 'http://localhost:3401'}) — the restore-to-hot port and the cold-tier manager ===\n`);

/* ── 1. THE STATE BEFORE ─────────────────────────────────────────────────── */
console.log('1. THE STATE BEFORE — the cold tier as the collection manager reads it (retention.read): the archived manifests, the policy in force, the vault\'s inventory of both roots');
{
  const st = await tierStateAs(cm, dvorak);
  if (!st.ok) fail('tier/state (m.dvorak)', st);
  else {
    const p = st.body.state.policy;
    ok(`M. Dvořák reads the cold tier's state: HTTP ${st.status}; the policy ${p.declared ? `DECLARED (version ${p.version}; an earlier run left it)` : 'UNDECLARED — the defaults in force'}`);
    showState(st.body.state);
  }
  const archived = await q(`select s.source_key, count(*)::int n, coalesce(sum(m.byte_length), 0)::int bytes from observation.blob_manifests m join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where m.tenant_id = $1 and m.domain_id = $2 and m.vault = 'evidence' and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and observation.manifest_tier(m.manifest_id) = 'archive' group by 1 order by 1`, [T, D]);
  note(`the archive tier holds: ${archived.map((a) => `${a.source_key} ×${a.n} (${a.bytes} bytes)`).join(', ') || 'no manifest'}`);
}

/* ── 2. RESTORE ──────────────────────────────────────────────────────────── */
console.log('\n2. RESTORE — the NORDWERK records in the archive tier moved back to the hot tier by a governed restore; the host, the ledgers, the verification, the retrieval');
let targets = await targetsIn('archive', 'nordwerk-internal', 200);
if (targets.length === 0) { note('no current NORDWERK internal record in the archive tier: the archived internal records of any source are taken'); targets = await targetsIn('archive', null, 200); }
let P = null; let Q = null;
if (targets.length === 0) bad('no archived current internal evidence record to restore (the archive tier holds none of them)');
else {
  [P, Q = null] = targets;
  note(`the targets (${targets.length}): ${targets.map((t, i) => `${i === 0 ? 'P = ' : i === 1 ? 'Q = ' : ''}evidence ${short(t.id)}@${t.version} (${t.source_key}, ${t.byte_length} bytes, manifest ${short(t.manifest_id)}${t.legal_hold ? ', under a legal hold' : ''})`).join('; ')}; all in the archive tier`);
  const stagedBefore = { evidence: stagedNames('evidence').length, archive: stagedNames('archive').length };
  const r = await approved(`restore of ${targets.length === 1 ? 'P' : targets.length === 2 ? 'P and Q' : `${targets.length} records`}`,
    { kind: 'restore', targetKind: 'evidence', selector: { manifestIds: targets.map((t) => t.manifest_id) }, retentionProfile: P.retention_profile, reason: 'the records are wanted hot again; the bytes come back from the cold tier' },
    'the records return to the hot tier; the manifests and their digests are kept');
  if (r !== null) {
    for (const it of await q(`select ref, disposition, reason, hold_id::text, details from retention.scope_items where action_id = $1 order by dependency_order`, [r.id])) {
      note(`  ${it.disposition}: manifest ${short(it.ref)} (tier ${it.details?.tier ?? '?'}${it.hold_id ? `, hold ${short(it.hold_id)}` : ''}) — ${it.reason}`);
    }
    const ex = await execute(r.id);
    if (!ex.ok) fail('execute restore (p.novak)', ex);
    else {
      const e = ex.body.execution;
      ok(`P. Novák executed: HTTP ${ex.status} — ${e.executed} restored, ${e.refused} refused; hot copies published after the commit ${e.published ?? '?'}; archive copies removed after the commit ${e.bytes?.removed?.length ?? 0}, failed ${e.bytes?.failed?.length ?? 0}`);
      for (const x of await executionsOf(r.id)) note(`  ${x.port} ${x.outcome}: manifest ${short(basename(String(x.evidence.locator ?? '')))} — copy_created ${x.evidence.copy_created}, staged ${x.evidence.staged}, already_restored ${x.evidence.already_restored}, tier record ${x.evidence.tier_record_id ? short(x.evidence.tier_record_id) : 'none'}, attempt ${x.evidence.attempt_id ? short(x.evidence.attempt_id) : 'none'}, digest_verified ${x.evidence.digest_verified}`);
      let hostOk = true; let ledgerOk = true;
      for (const t of targets) {
        const hot = existsSync(hostPath('evidence', t.locator)); const arc = existsSync(hostPath('archive', t.locator));
        if (!(hot && !arc)) hostOk = false;
        const last = (await ledger(t.manifest_id)).at(-1) ?? null;
        if (last === null || last.action_id !== r.id || last.from_tier !== 'archive' || last.tier !== 'hot') ledgerOk = false;
        const cr = await custodyLast(t.manifest_id, 'custody.restored');
        note(`  manifest ${short(t.manifest_id)}: hot path ${hot ? 'PRESENT' : 'ABSENT'}, archive path ${arc ? 'PRESENT' : 'ABSENT'}; tier ${await tierOf(t.manifest_id)}; the ledger's latest row ${last ? `${last.from_tier} → ${last.tier} by ${last.action_id === r.id ? 'this action' : short(last.action_id)} at ${iso(last.moved_at)}` : 'NONE'}; custody ${cr && cr.details?.action_id === r.id ? `custody.restored (${cr.details.from_tier} → ${cr.details.to_tier}, tier record ${short(cr.details.tier_record_id)})` : 'NO custody.restored ROW BY THIS ACTION'}`);
      }
      if (hostOk) ok(`the host: every restored record's hot path PRESENT and archive path ABSENT (${rel(domainDir('evidence'))}; ${rel(domainDir('archive'))})`); else bad('the host: a restored record is not where the ledger says');
      if (ledgerOk) ok('the tier ledger: an archive → hot row per manifest by this action (a manifest\'s tier is its latest record; no manifest was updated)'); else bad('the tier ledger: a manifest lacks its archive → hot row by this action');
      const staged = { evidence: stagedNames('evidence').length, archive: stagedNames('archive').length };
      if (staged.evidence + staged.archive === 0) ok('no .staging- file under either domain directory (each copy was staged under its attempt\'s name and published under the locator after the commit)');
      else if (staged.evidence <= stagedBefore.evidence && staged.archive <= stagedBefore.archive) note(`.staging- files present from before this scene: evidence ${staged.evidence}, archive ${staged.archive} (none added by the restore)`);
      else bad(`.staging- files left by the restore: evidence ${staged.evidence} (before ${stagedBefore.evidence}), archive ${staged.archive} (before ${stagedBefore.archive})`);
      const vf = await verify(r.id);
      if (vf.ok && vf.body.verification.verified === true) {
        const cs = await checksOf(r.id);
        ok(`verified against the restore contract: ${cs.filter((c) => c.passed).length}/${cs.length} checks — expected ${JSON.stringify(cs[0]?.expected ?? null)}`);
      } else if (vf.ok) bad(`the restore's verification did not pass: ${JSON.stringify(vf.body.verification).slice(0, 200)}`); else fail('verify restore', vf);
      const row = await actionRow(r.id);
      note(`the action: state ${row.state}, attempts ${row.attempts} (the one execution that began), escalated_at ${iso(row.escalated_at)}`);
      const dl = await download(P.id);
      if (dl.ok && dl.body.download?.contentDigest === P.content_digest) {
        const d = dl.body.download; const cr = await custodyLast(P.manifest_id, 'custody.retrieved');
        const line = `A. Hoffmann downloads P: HTTP ${dl.status}, ${d.byteLength} bytes, digest the manifest's, tier ${d.tier}, availability ${d.availability}, integrity ${d.integrity}; the custody row: tier ${cr?.details?.tier ?? '?'}, served_from ${cr?.details?.served_from ?? '?'}`;
        if (d.tier === 'hot' && d.availability === 'verified' && cr?.details?.served_from === 'published') ok(line); else bad(`${line} — expected tier hot, availability verified, served_from published`);
      } else bad(`the download after the restore: ${dl.status} ${dl.body?.message ?? ''}`);
      const dt = await detail(P.id);
      if (dt.ok) note(`the detail: manifest tier ${dt.body.evidence?.manifest?.tier ?? dt.body.manifest?.tier ?? '?'}, archived at ${dt.body.evidence?.manifest?.archived_at ?? dt.body.manifest?.archived_at ?? 'null'}, availability ${JSON.stringify(dt.body.availability ?? null)}`); else fail('the detail (a.hoffmann)', dt);
    }
  }
}

/* ── 3. THE MANAGER'S POLICY ─────────────────────────────────────────────── */
console.log('\n3. THE MANAGER\'S POLICY — the platform administrator declares the domain\'s tier policy at DEMONSTRATION settings (each rule fires within this act; scene 7 restores sane values)');
{
  const p = await declared('the demonstration setting (one byte per day, one open per evaluation, one attempt, escalate after zero seconds, a restore window of zero seconds)', DEMO_POLICY);
  const st = await tierState();
  if (!st.ok) fail('tier/state (p.novak)', st);
  else {
    const sp = st.body.state.policy;
    if (p !== null && sp.declared === true && sp.version === p.version) ok(`tier/state shows the policy in force: declared, ${policyLine(sp)}`); else bad(`tier/state shows ${JSON.stringify(sp)}`);
    showState(st.body.state);
  }
}

/* ── 4. BUDGET → RETRY → ESCALATION ──────────────────────────────────────── */
console.log('\n4. BUDGET → RETRY → ESCALATION — an archive refused at admission by the byte budget and retried after a re-declaration (one attempt: the whole retry budget under max attempts 1); an action paused for retry escalated by age at the next evaluation');
{
  // (i) the budget: an archive of P (hot since scene 2) refused before the state moves.
  let a = P !== null && (await tierOf(P.manifest_id)) === 'hot' ? P : null;
  if (a === null) { a = await hotStandIn([]); if (a !== null) note(`P is not in the hot tier (scene 2 restored nothing): the hot NORDWERK record ${short(a.id)} (${a.byte_length} bytes) stands in for it`); }
  if (a === null) bad('no hot NORDWERK record to archive under the budget');
  else {
    const act = await approved('archive of P', { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [a.manifest_id] }, retentionProfile: a.retention_profile, reason: 'the record goes cold again (the budget scene)' }, 'the record is kept cold; still retrievable');
    if (act !== null) {
      const ex = await execute(act.id);
      const row = await actionRow(act.id);
      if (ex.status === 409 && /budget_exhausted/.test(String(ex.body?.message ?? '')) && row?.state === 'paused' && row.disposition === 'retry' && row.attempts === 0) ok(`the execution REFUSED AT ADMISSION: HTTP 409 — ${ex.body.message}`);
      else bad(`expected 409 budget_exhausted with the action paused for retry and no attempt counted; got ${ex.status} ${ex.body?.message ?? ''} — action ${row?.state ?? '?'}/${row?.disposition ?? '?'}, attempts ${row?.attempts ?? '?'}`);
      if (row !== null) note(`the action: state ${row.state}, class ${row.failure_class}, disposition ${row.disposition}, attempts ${row.attempts} (the state never moved: no attempt counted), approvals live ${await approvalsLive(act.id)} (revoked by the pause); the pause event's details ${JSON.stringify(pick((await lastEvent(act.id, 'action.paused'))?.details ?? null, ['failure_class', 'attempted', 'attempts', 'approvals_revoked']))}`);
      note(`the host: P's hot path ${existsSync(hostPath('evidence', a.locator)) ? 'PRESENT' : 'ABSENT'}, archive path ${existsSync(hostPath('archive', a.locator)) ? 'PRESENT' : 'ABSENT'} (nothing moved); tier ${await tierOf(a.manifest_id)}`);
      const st = await tierState();
      if (st.ok) note(`tier/state: budget ${st.body.state.budget.bytes_per_day} per day, used ${st.body.state.budget.used_24h} (the bytes the domain moved in the last 24 hours — scene 2's restores), remaining ${st.body.state.budget.remaining}, the window resets at ${iso(st.body.state.budget.window_resets_at)}; actions paused for retry ${st.body.state.actions.paused_retry}`); else fail('tier/state', st);
      // (ii) the retry: the budget lifted by a new version of the policy; the person re-resolves and re-approves; one attempt executes.
      const p2 = await declared('the budget lifted (the rest of the demonstration setting kept)', { ...DEMO_POLICY, budgetBytesPerDay: null });
      if (p2 !== null && await reapproved(act.id, 'the same scope, approved again after the budget pause')) {
        const ex2 = await execute(act.id);
        if (!ex2.ok) fail('execute after the re-declaration (p.novak)', ex2);
        else {
          const row2 = await actionRow(act.id); const started = await lastEvent(act.id, 'execution.started');
          ok(`executed: ${ex2.body.execution.executed} archived, ${ex2.body.execution.refused} refused; hot copies removed after the commit ${ex2.body.execution.bytes?.removed?.length ?? 0}; the action's attempts ${row2.attempts} (execution.started names attempt ${started?.details?.attempt ?? '?'}) — under max attempts 1 this one attempt is the whole retry budget`);
          const vf = await verify(act.id);
          if (vf.ok && vf.body.verification.verified === true) ok(`verified against the archive contract; P is in the ${await tierOf(a.manifest_id)} tier again (archive path ${existsSync(hostPath('archive', a.locator)) ? 'PRESENT' : 'ABSENT'}, hot path ${existsSync(hostPath('evidence', a.locator)) ? 'PRESENT' : 'ABSENT'})`);
          else if (vf.ok) bad(`the archive's verification did not pass: ${JSON.stringify(vf.body.verification).slice(0, 200)}`); else fail('verify', vf);
          note('NOT shown here: the refusal of a further execution after a FAILED attempt (attempts_exhausted → the action escalated for human review; a re-resolution restarts the count) — it needs a copy that fails, and the harness R8 (apps/api/test/int/phase6-retention-b12.test.ts) corrupts one in an isolated vault; the demonstration corrupts nothing');
        }
      }
    }
  }
  // (iii) escalation by age: an action paused for retry (by the budget again) is escalated by the next evaluation under escalate_after 0 seconds.
  let b = Q !== null && (await tierOf(Q.manifest_id)) === 'hot' ? Q : null;
  if (b === null) { b = await hotStandIn([a?.manifest_id].filter(Boolean)); if (b !== null) note(`Q is not in the hot tier: the hot NORDWERK record ${short(b.id)} (${b.byte_length} bytes) stands in for it`); }
  if (b === null) bad('no second hot NORDWERK record for the escalation scene');
  else {
    const p3 = await declared('the budget restored (one byte per day)', DEMO_POLICY);
    const actB = p3 === null ? null : await approved('archive of Q', { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [b.manifest_id] }, retentionProfile: b.retention_profile, reason: 'the record goes cold again (the escalation scene)' }, 'the record is kept cold; still retrievable');
    if (actB !== null) {
      const exB = await execute(actB.id);
      const rowB = await actionRow(actB.id);
      if (exB.status === 409 && /budget_exhausted/.test(String(exB.body?.message ?? '')) && rowB?.state === 'paused' && rowB.disposition === 'retry') ok(`refused at admission by the budget again: HTTP 409; the action paused for retry (attempts ${rowB.attempts}, paused at ${iso((await lastEvent(actB.id, 'action.paused'))?.occurred_at)})`);
      else bad(`expected 409 budget_exhausted with the action paused for retry; got ${exB.status} ${exB.body?.message ?? ''} — action ${rowB?.state ?? '?'}/${rowB?.disposition ?? '?'}`);
      const ev = await evaluate();
      if (!ev.ok) fail('schedules/evaluate (p.novak)', ev);
      else {
        const esc = ev.body.evaluation.escalated ?? []; const hit = esc.find((x) => x.action_id === actB.id) ?? null;
        if (hit !== null) ok(`P. Novák's evaluation ESCALATED it (escalate_after 0 seconds; paused at ${iso(hit.paused_at)}): "${hit.reason}"`);
        else bad(`the evaluation escalated ${esc.length} action(s), not this one: ${JSON.stringify(esc).slice(0, 200)}`);
        const after = await actionRow(actB.id); const evB = await lastEvent(actB.id, 'action.escalated');
        if (after?.state === 'paused' && after.disposition === 'human_review' && after.escalated_at !== null && evB !== null && (await approvalsLive(actB.id)) === 0) ok(`the action: state ${after.state}, disposition ${after.disposition}, class ${after.failure_class}, attempts ${after.attempts}, escalated_at ${iso(after.escalated_at)}; approvals live 0; the event action.escalated ${JSON.stringify(pick(evB.details, ['attempts', 'approvals_revoked']))}`);
        else bad(`expected paused / human_review with escalated_at set, action.escalated on record and no live approval; got ${JSON.stringify(after)}, event ${evB === null ? 'NONE' : 'present'}, approvals live ${await approvalsLive(actB.id)}`);
        const opened = ev.body.evaluation.opened ?? [];
        note(`the same evaluation opened ${opened.length} action(s) by the schedules in force and reported deferred ${ev.body.evaluation.deferred}${opened.length > 0 ? ' (a schedule an earlier run declared; scene 5 is the ordering\'s scene — withdrawn here)' : ''}`);
        for (const o of opened) { const wd = await withdraw(o.action_id, 'opened by a schedule during the escalation scene; the ordering is shown in scene 5'); if (wd.ok) note(`  withdrew ${short(o.action_id)} (${o.kind} of manifest ${short(o.selector?.manifest_id ?? '?')})`); else fail(`withdraw ${short(o.action_id)}`, wd); }
        const st = await tierState();
        if (st.ok) note(`tier/state: escalated ${st.body.state.actions.escalated}, paused for human review ${st.body.state.actions.paused_human_review}, paused for retry ${st.body.state.actions.paused_retry}`); else fail('tier/state', st);
        const wd = await withdraw(actB.id, 'the escalation shown; Q stays hot for the restore-window scene');
        if (wd.ok) ok(`P. Novák withdrew the escalated action (${wd.body.action.state}); Q stays in the ${await tierOf(b.manifest_id)} tier`); else fail('withdraw the escalated action', wd);
      }
    }
  }
}

/* ── 5. THE RESTORE WINDOW and ORDERING ──────────────────────────────────── */
console.log('\n5. THE RESTORE WINDOW and ORDERING — the archive schedule evaluated under one open per evaluation and a restore window of zero seconds: oldest due first, the rest deferred; a restored record, due at its restore instant, returns to the cold tier by the schedule');
{
  const src = (await q(`select s.source_id::text source_id from observation.source_contracts_current s where s.source_key = 'nordwerk-internal' order by s.contract_version desc limit 1`))[0] ?? null;
  if (src === null) bad('no nordwerk-internal source on this database');
  else {
    let sch = (await q(`select schedule_id::text, due_after::text, retention_profile from retention.schedules where tenant_id = $1 and domain_id = $2 and state = 'active' and action_kind = 'archive' and target_kind = 'evidence' and selector ->> 'source_id' = $3 order by declared_at limit 1`, [T, D, src.source_id]))[0] ?? null;
    if (sch !== null) note(`the archive schedule exists (${short(sch.schedule_id)}: profile "${sch.retention_profile}", due after ${sch.due_after}, the evidence of nordwerk-internal) — an earlier run declared it`);
    else {
      const d = await declareSchedule({ retentionProfile: '24 months', targetKind: 'evidence', actionKind: 'archive', dueAfter: '0 seconds', selector: { sourceId: src.source_id } });
      if (!d.ok) fail('schedules/declare (platform-admin)', d);
      else {
        sch = (await q(`select schedule_id::text, due_after::text, retention_profile from retention.schedules where schedule_id = $1`, [d.body.schedule.scheduleId]))[0];
        ok(`the platform administrator declared the archive schedule ${short(sch.schedule_id)}: profile "24 months", due after 0 seconds, the evidence of nordwerk-internal (a schedule selects by profile and source, never a chosen object set; a RESTORE schedule is refused — a restore is opened on demand)`);
      }
    }
    if (sch !== null) {
      const p5 = await declared('the budget lifted for the cycle (one open per evaluation and the restore window of zero seconds kept)', { ...DEMO_POLICY, budgetBytesPerDay: null });
      const window = p5?.restore_hot_for ?? '0 seconds';
      // What the schedule's predicate finds due now, ordered as the manager orders it: by the due instant (a restored manifest at its RESTORE instant + the window; any other at its creation + due_after), then by id.
      const due = await q(`select bm.manifest_id::text manifest_id, coalesce(lt.tier = 'hot', false) restored,
             case when lt.tier = 'hot' then lt.moved_at + $5::interval else bm.created_at + $4::interval end due_at
        from observation.blob_manifests bm
        left join lateral (select r.tier, r.moved_at from observation.blob_tier_records r where r.manifest_id = bm.manifest_id order by r.moved_at desc limit 1) lt on true
        where bm.tenant_id = $1 and bm.domain_id = $2 and bm.vault = 'evidence' and bm.retention_profile = $3 and bm.source_id = $6::uuid
          and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = bm.manifest_id)
          and observation.manifest_tier(bm.manifest_id) <> 'archive'
          and (case when lt.tier = 'hot' then lt.moved_at + $5::interval else bm.created_at + $4::interval end) <= clock_timestamp()
          and not exists (select 1 from retention.actions_current a where a.tenant_id = $1 and a.domain_id = $2 and a.kind = 'archive'
                            and a.state not in ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals') and a.selector ->> 'manifest_id' = bm.manifest_id::text)
        order by 3, 1`, [T, D, sch.retention_profile, sch.due_after, window, src.source_id]);
      note(`due under the schedule now, in the manager's order: ${due.length === 0 ? 'nothing' : due.map((m, i) => `#${i + 1} manifest ${short(m.manifest_id)} — ${m.restored ? `RESTORED, due at its restore instant ${iso(m.due_at)}` : `never moved, due at its creation ${iso(m.due_at)}`}`).join('; ')}`);
      const kept = []; let cycle = null;
      if (!due.some((m) => m.restored)) bad('no restored NORDWERK record is due (scene 2 restored nothing, or scene 4 moved both): the ordering and the cycle cannot be shown');
      else {
        // One evaluation per due manifest, at most: each opens the OLDEST due (one open per evaluation) and defers the rest; the opened actions stay
        // open (a live action of the kind keeps its manifest out of the next evaluation) until the restored record's turn, which is the cycle's.
        for (let i = 0; i < Math.min(due.length, 8) && cycle === null; i += 1) {
          const ev = await evaluate();
          if (!ev.ok) { fail(`evaluation #${i + 1} (p.novak)`, ev); break; }
          const all = ev.body.evaluation.opened ?? []; const mine = all.filter((o) => o.schedule_id === sch.schedule_id); const others = all.length - mine.length;
          if (mine.length !== 1) { bad(`evaluation #${i + 1}: expected exactly ONE action opened by the schedule (one open per evaluation), got ${mine.length}`); break; }
          const o = mine[0]; const mid = String(o.selector?.manifest_id ?? ''); const known = due.find((m) => m.manifest_id === mid) ?? null;
          const expectedDeferred = Math.max(due.length - (i + 1), 0);
          const last = await scheduleLast(sch.schedule_id);
          const line = `evaluation #${i + 1}: opened ONE action ${short(o.action_id)} — archive of manifest ${short(mid)} (${known === null ? 'NOT in the computed due set' : known.restored ? 'the restored record, due at its restore instant' : 'never moved, due at its creation'}; due_from ${iso(o.due_from)}), deferred ${ev.body.evaluation.deferred}; the schedule's last_evaluation ${JSON.stringify(last ?? {})}${others > 0 ? `; ${others} opened by other schedules` : ''}${(ev.body.evaluation.escalated ?? []).length > 0 ? `; escalated ${ev.body.evaluation.escalated.length}` : ''}`;
          if (known !== null && known.manifest_id === due[i].manifest_id && iso(o.due_from) === iso(known.due_at) && ev.body.evaluation.deferred === expectedDeferred) ok(line);
          else bad(`${line} — expected the #${i + 1} due manifest ${short(due[i]?.manifest_id ?? '?')} due at ${iso(due[i]?.due_at)} and deferred ${expectedDeferred}`);
          if (known !== null && known.restored) cycle = { action: o, manifest_id: mid };
          else kept.push(o);
        }
        if (cycle === null) bad('no restored record was reached by the evaluations (the cycle is not shown)');
      }
      if (cycle !== null) {
        const rs = await resolve(cycle.action.action_id);
        if (!rs.ok) fail('resolve the schedule\'s action', rs);
        else {
          const ap = await approve(cycle.action.action_id, rs.body.scope.scope_digest, 'the restored record returns to the cold tier after its window');
          if (!ap.ok) fail('approve (h.bergmann)', ap);
          else {
            ok(`the schedule's action ${short(cycle.action.action_id)} resolved (${rs.body.scope.execute} to execute) and approved by H. Bergmann`);
            const ex = await execute(cycle.action.action_id);
            if (!ex.ok) fail('execute (p.novak)', ex);
            else {
              const vf = await verify(cycle.action.action_id);
              if (vf.ok && vf.body.verification.verified === true) ok(`executed (${ex.body.execution.executed} archived, hot copies removed ${ex.body.execution.bytes?.removed?.length ?? 0}) and verified: the record is in the ${await tierOf(cycle.manifest_id)} tier again`);
              else if (vf.ok) bad(`the re-archive's verification did not pass: ${JSON.stringify(vf.body.verification).slice(0, 200)}`); else fail('verify', vf);
              const chain = await ledger(cycle.manifest_id);
              note(`the tier ledger of manifest ${short(cycle.manifest_id)}: ${chain.map((x) => `${x.from_tier} → ${x.tier} (${iso(x.moved_at)})`).join(', ')}`);
              const tail = chain.slice(-3).map((x) => `${x.from_tier}→${x.tier}`).join(' ');
              if (tail === 'hot→archive archive→hot hot→archive') ok('the full cycle in one ledger: archived, restored (scene 2), retrieved, re-archived by the schedule after its restore window'); else bad(`expected the ledger to end hot→archive, archive→hot, hot→archive; it ends ${tail || '(empty)'}`);
              const evd = (await q(`select o.object_id::text id, m.content_digest from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid where o.object_type = 'EVD' and (o.payload ->> 'manifest_id') = $1 order by o.object_version desc limit 1`, [cycle.manifest_id]))[0] ?? null;
              const dl = evd === null ? null : await download(evd.id);
              if (dl !== null && dl.ok && dl.body.download?.contentDigest === evd.content_digest) ok(`A. Hoffmann still downloads it: HTTP ${dl.status}, ${dl.body.download.byteLength} bytes, digest the manifest's, tier ${dl.body.download.tier}, availability ${dl.body.download.availability}`); else bad(`the download after the re-archive: ${dl?.status ?? 'no evidence object'} ${dl?.body?.message ?? ''}`);
            }
          }
        }
      }
      for (const o of kept) { const wd = await withdraw(o.action_id, 'the demonstration keeps the never-moved NORDWERK records hot; the ordering was shown'); if (wd.ok) ok(`withdrew ${short(o.action_id)} (archive of manifest ${short(o.selector?.manifest_id ?? '?')}, never moved): the demonstration keeps it hot`); else fail(`withdraw ${short(o.action_id)}`, wd); }
      note('the schedule stays declared: it acts only on an evaluation, and the final policy (scene 7) restores the 30-day restore window and 200 opens per evaluation');
    }
  }
}

/* ── 6. THE SWEEPER'S WALK ───────────────────────────────────────────────── */
console.log('\n6. THE SWEEPER\'S WALK — a redundant staged copy of an archived manifest and a stale temp file planted in the archive root; the platform administrator\'s sweep removes both and reports no archive orphan; the published copy untouched');
{
  const cold = (await q(`select m.manifest_id::text, m.locator, m.content_digest, s.source_key from observation.blob_manifests m join observation.source_contracts_current s on s.source_id = m.source_id and s.contract_version = m.contract_version
    where m.tenant_id = $1 and m.domain_id = $2 and m.vault = 'evidence' and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id) and observation.manifest_tier(m.manifest_id) = 'archive'
    order by (s.source_key = 'nordwerk-internal') desc, m.created_at desc limit 20`, [T, D])).find((m) => existsSync(hostPath('archive', m.locator))) ?? null;
  if (cold === null) bad('no archived manifest with its archive copy on this host (nothing to plant beside)');
  else {
    const dir = domainDir('archive'); const published = hostPath('archive', cold.locator);
    const stagedName = `${basename(cold.locator)}.staging-${randomUUID()}`; const tempName = `${randomUUID()}.tmp-${randomUUID()}`;
    const stagedPath = join(dir, stagedName); const tempPath = join(dir, tempName);
    // The sweep BEFORE the planting: the counts it reports are this host's state, so the counts after are exact deltas.
    const before = await sweep();
    if (!before.ok) fail('sweep before the planting (platform-admin)', before);
    else {
      const b = before.body.sweep;
      note(`the sweep before the planting: staged copies removed ${b.stagedCopiesRemoved}, kept ${b.stagedCopiesKept}; temp files removed ${b.tempFilesRemoved}; archive orphan candidates ${b.archiveOrphanCandidates}; evidence orphan candidates ${b.orphanCandidates}; expired cases ${b.expiredCases}, failed runs ${b.failedRuns}, tombstones completed ${b.pendingTombstones}; ${(b.poisonItems ?? []).length} item(s) recorded`);
      try {
        copyFileSync(published, stagedPath);
        writeFileSync(tempPath, 'an interrupted write, never named by a locator');
        const old = new Date(Date.now() - 120_000); utimesSync(tempPath, old, old);
        ok(`planted under ${rel(dir)}: ${stagedName} (a byte copy of manifest ${short(cold.manifest_id)}'s published archive copy, ${cold.source_key} — REDUNDANT: the published copy verifies) and ${tempName} (mtime set two minutes back)`);
        const after = await sweep();
        if (!after.ok) fail('sweep (platform-admin)', after);
        else {
          const r = after.body.sweep;
          const asExpected = r.stagedCopiesRemoved === 1 && r.tempFilesRemoved === 1 && r.archiveOrphanCandidates === b.archiveOrphanCandidates && r.stagedCopiesKept === b.stagedCopiesKept;
          const line = `the platform administrator's sweep: stagedCopiesRemoved ${r.stagedCopiesRemoved}, tempFilesRemoved ${r.tempFilesRemoved}, archiveOrphanCandidates ${r.archiveOrphanCandidates}, stagedCopiesKept ${r.stagedCopiesKept}, orphanCandidates ${r.orphanCandidates}; expired cases ${r.expiredCases}, failed runs ${r.failedRuns}, tombstones completed ${r.pendingTombstones}`;
          if (asExpected) ok(`${line}${r.archiveOrphanCandidates === 0 ? ' — no archive orphan' : ` — the ${r.archiveOrphanCandidates} archive orphan candidate(s) were there before the planting (recorded, kept)`}`); else bad(`${line} — expected 1 staged copy and 1 temp file removed, the orphan and kept counts as before the planting (${b.archiveOrphanCandidates}, ${b.stagedCopiesKept})`);
          for (const p of (r.poisonItems ?? []).slice(0, 5)) note(`  recorded: ${p.kind} ${String(p.ref).slice(0, 60)} — ${String(p.reason).slice(0, 120)}`);
          const stagedGone = !existsSync(stagedPath); const tempGone = !existsSync(tempPath); const intact = existsSync(published) && sha256File(published) === cold.content_digest;
          if (stagedGone && tempGone && intact) ok(`the host: the staged copy GONE, the temp file GONE, the published archive copy present and its bytes the manifest's digest (${rel(published)})`);
          else bad(`the host: staged copy ${stagedGone ? 'GONE' : 'PRESENT'}, temp file ${tempGone ? 'GONE' : 'PRESENT'}, published copy ${intact ? 'intact' : 'NOT INTACT'}`);
        }
      } finally {
        // The act cleans what it planted, whatever the sweep did with it.
        for (const p of [stagedPath, tempPath]) rmSync(p, { force: true });
      }
    }
  }
}

/* ── 7. THE STATE AFTER ──────────────────────────────────────────────────── */
console.log('\n7. THE STATE AFTER — the cold tier\'s state, and the policy re-declared at sane values so the demonstration is left governed by the defaults\' equivalent');
{
  const st = await tierStateAs(cm, dvorak);
  if (!st.ok) fail('tier/state (m.dvorak)', st);
  else { ok(`M. Dvořák reads the cold tier's state after the act: HTTP ${st.status}`); showState(st.body.state); }
  const p = await declared('sane values (budget unbounded, 200 opens per evaluation, 3 attempts, escalate after 7 days, restore window 30 days — the defaults\' equivalent)', SANE_POLICY);
  const st2 = await tierState();
  if (!st2.ok) fail('tier/state (p.novak)', st2);
  else {
    const sp = st2.body.state.policy;
    if (p !== null && sp.version === p.version && sp.budget_bytes_per_day === null && sp.max_opens_per_evaluation === 200 && sp.max_attempts === 3) ok(`tier/state shows the policy in force: declared, ${policyLine(sp)}`); else bad(`tier/state shows ${JSON.stringify(sp)}`);
  }
}

console.log('\nSHOWN ON THE DEMONSTRATION: the restore port (a move back recorded in the same ledger; the copy staged under the attempt\'s name and published after the commit; the archive copy removed; the restore contract; the retrieval from the hot tier), the manager\'s policy and its observable state, a BUDGET refusal at admission (no attempt counted; paused for retry; retried after a re-declaration by a re-resolution and a re-approval — one attempt, the whole retry budget under max attempts 1), ESCALATION BY AGE at the next evaluation, ORDERING (oldest due first, one open per evaluation, the rest deferred and counted on the schedule), the RESTORE WINDOW (a restored record due at its restore instant; the full cycle archive → restore → retrieval → re-archive), and the sweeper\'s removal of a redundant staged copy and a stale temp file from the archive root.');
console.log('PROVEN BY THE HARNESS ALONE (apps/api/test/int/phase6-retention-b12.test.ts): the refusal after a FAILED attempt — the attempt counted where its pause is recorded, attempts_exhausted, the escalation for human review and the re-resolution restarting the count (R8); two restores of one archived manifest executed together — one mover, one finder, one tier record (R5); the retry route of a restore whose hot publish failed after the commit — the archive copy kept, the staged copy served, the residual closed (R11); the sweeper\'s other classifications — a staged copy in the wrong root removed only once older than the run timeout and only when the tier\'s copy verifies, a young one kept, an orphan recorded and kept (R10).');

await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'the act completed with every scene producing its effect' : `${failureCount()} scene step(s) did not produce the effect claimed`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
