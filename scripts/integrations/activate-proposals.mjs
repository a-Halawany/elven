/**
 * Proposals A and B — activate EU Financial Sanctions (rss + payload) and World Bank
 * Indicators as LIVE contracts through the governed path (owner decision, 2026-09-07).
 *
 * Every step is a request an operator could make; there is no back door, and the same
 * path ECB took (scripts/phase4/activate-ecb.mjs):
 *   1. register contract v2 for the EXISTING source (registrar: a.hoffmann)
 *   2. the registrar's own approval is refused; a DIFFERENT operator approves (m.dvorak)
 *   3. the rights evidence — the terms read at the source — is recorded on v2
 *   4. v1 is superseded, v2 activated; activation records the schedule entry
 *   5. an agent for the current connector version is confirmed or provisioned
 *   6. ONE governed collection is triggered by the operator and its receipt read back
 *   7. the evidence admitted, the attribution it carries, and the readiness register
 *
 * What this script does NOT do: it does not enable the scheduler (a deployment
 * setting), does not bind any credential (none is needed), purchases nothing, and
 * touches no other source. Idempotent: re-running finds v2 and continues.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';
import { EU_SANCTIONS_LIVE, EU_LICENCE } from './proposals/eu-sanctions-live.mjs';
import { WORLDBANK_LIVE, WORLDBANK_LICENCE } from './proposals/worldbank-indicators-live.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

const PROPOSALS = [
  { id: 'A', contract: EU_SANCTIONS_LIVE[0], rightsEvidence: EU_LICENCE, approval: 'v2 reviewed: feed endpoint verified live (200 text/xml), dataset record read on data.europa.eu (COM_REUSE, PUBLIC), hourly poll, no credential, budget unchanged' },
  { id: 'A', contract: EU_SANCTIONS_LIVE[1], rightsEvidence: EU_LICENCE, approval: 'v2 reviewed: payload endpoint verified live (200 text/plain, 25,166,172 bytes; the version=2 duplicate verified byte-identical and dropped), dataset record read on data.europa.eu (COM_REUSE, PUBLIC), six-hour poll independent of the feed, no credential' },
  { id: 'B', contract: WORLDBANK_LIVE, rightsEvidence: WORLDBANK_LICENCE, approval: 'v2 reviewed: both indicator endpoints verified live (200 application/json), Dataset Terms read (attribution format), WTO named as provider of TX.VAL.MRCH.CD.WT, weekly poll, structural context only, no credential' },
];

console.log('\n=== Integrations · proposals A and B — activate through the governed path ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
if (hoffmann === null || dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const reg = (over) => as(hoffmann, scope, over);
const mgr = (over) => as(dvorak, scope, over);
const short = (id) => `${String(id).slice(0, 8)}…`;

const list = await call(`${O}/sources/list`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
const allSources = list.body.sources ?? [];

const results = [];
for (const p of PROPOSALS) {
  const key = p.contract.source_key;
  console.log(`\n━━ Proposal ${p.id} · ${key} ━━`);
  const versions = allSources.filter((s) => s.source_key === key).sort((a, b) => a.contract_version - b.contract_version);
  if (versions.length === 0) { bad(`${key} is not registered — run the Phase 1 seed first`); continue; }
  for (const v of versions) note(`v${v.contract_version} ${v.lifecycle_state} · ${v.acquisition_mode} · rights ${v.rights_state}`);
  const sourceId = versions[0].source_id;
  let v2 = versions.find((v) => v.acquisition_mode === 'live' && v.contract_version >= 2);
  const current = versions[versions.length - 1];
  const receipts = {};

  if (v2 === undefined) {
    console.log(`\n1. register v${p.contract.lifecycle.contract_version} — live (as a.hoffmann)`);
    const contract = { ...p.contract, lifecycle: { ...p.contract.lifecycle, contract_version: current.contract_version + 1, supersedes_version: current.contract_version } };
    const r = await call(`${O}/sources/register`, reg({ action: 'observation.source.register', objectType: 'SRC', objectId: sourceId }), { contract, sourceId }, hoffmann.token);
    if (r.ok) { ok(`registered v${r.body.source.contractVersion} of ${short(sourceId)} (${r.body.source.lifecycleState}) · receipt ${r.body.receipt?.eventId ?? r.correlationId}`); v2 = { contract_version: r.body.source.contractVersion, lifecycle_state: 'draft' }; receipts.register = r.body.receipt ?? { correlationId: r.correlationId }; }
    else { bad(`registration refused (${r.status}) ${r.body?.message ?? ''} ${JSON.stringify(r.body?.details ?? '').slice(0, 300)}`); continue; }

    console.log('\n2. approval by a DIFFERENT operator (m.dvorak)');
    const self = await call(`${O}/sources/${sourceId}/approve`, reg({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }), { contractVersion: v2.contract_version, decision: 'approve', reason: 'approving my own registration' }, hoffmann.token);
    if (!self.ok) ok(`the registrar cannot approve their own registration (${self.status})`); else bad('a registrar approved their own contract');
    const a = await call(`${O}/sources/${sourceId}/approve`, mgr({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }), { contractVersion: v2.contract_version, decision: 'approve', reason: p.approval }, dvorak.token);
    if (a.ok) { ok(`approved · receipt ${a.body.receipt?.eventId ?? a.correlationId}`); receipts.approve = a.body.receipt ?? { correlationId: a.correlationId }; } else { bad(`approval refused (${a.status}) ${a.body?.message ?? ''}`); continue; }

    console.log('\n3. rights evidence recorded on v2 (the terms read at the source)');
    const rights = await call(`${O}/sources/${sourceId}/rights`, mgr({ action: 'observation.source.rights', objectType: 'SRC', objectId: sourceId }), { contractVersion: v2.contract_version, rightsState: 'confirmed', evidence: `${p.rightsEvidence} Owner decision of 2026-09-07 (proposal ${p.id}); attribution carried on the contract.` }, dvorak.token);
    if (rights.ok) { ok('rights: confirmed, with the terms quoted as evidence'); receipts.rights = rights.body.receipt ?? { correlationId: rights.correlationId }; } else bad(`rights refused (${rights.status}) ${rights.body?.message ?? ''}`);

    console.log('\n4. activation — one active version per source');
    const active = versions.find((v) => v.lifecycle_state === 'active');
    if (active !== undefined) {
      const s = await call(`${O}/sources/${sourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }), { contractVersion: active.contract_version, target: 'superseded', reason: `superseded by v${v2.contract_version}` }, dvorak.token);
      if (s.ok) ok(`v${active.contract_version} superseded`); else bad(`supersession refused (${s.status}) ${s.body?.message ?? ''}`);
    }
    const t = await call(`${O}/sources/${sourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }), { contractVersion: v2.contract_version, target: 'active', reason: `proposal ${p.id} activated on confirmed rights (owner decision, 2026-09-07)` }, dvorak.token);
    if (t.ok) { ok(`v${v2.contract_version} active · receipt ${t.body.receipt?.eventId ?? t.correlationId}`); receipts.activate = t.body.receipt ?? { correlationId: t.correlationId }; } else { bad(`activation refused (${t.status}) ${t.body?.message ?? ''}`); continue; }
  } else {
    console.log(`\n1–4. v${v2.contract_version} already registered (${v2.lifecycle_state}); continuing`);
  }
  const V = v2.contract_version;

  console.log('\n5. the collection agent for the current connector version');
  const src = await call(`${O}/sources/${sourceId}/get`, mgr({ action: 'observation.read.sources', objectType: 'SRC', objectId: sourceId, sideEffect: 'none' }), {}, dvorak.token);
  const existingAgents = (src.body.agents ?? []).filter((x) => x.status === 'active');
  for (const x of existingAgents) note(`agent ${short(x.agent_id)} v${x.agent_version} active`);
  const collectOnce = () => call(`${O}/sources/${sourceId}/collect`, mgr({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion: V }, dvorak.token);
  const provisionAgent = async () => {
    const r = await call(`${O}/agents/register`, { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.agent.register', objectType: 'AGT', objectId: null, principalId: `principal:${admin.principalId}`, purposeId: 'observation' },
      { sourceId, connector: p.contract.connector_kind, ownerPrincipalId: hoffmann.principalId }, admin.token);
    if (r.ok) ok(`agent provisioned ${short(r.body.agent.agentId)} for the current connector version (owner a.hoffmann)`); else { bad(`agent provisioning refused (${r.status}) ${r.body?.message ?? ''}`); return false; }
    for (const x of existingAgents) {
      const rv = await call(`${O}/agents/${x.agent_id}/revoke`, mgr({ action: 'observation.agent.revoke', objectType: 'AGT', objectId: x.agent_id }), { reason: `superseded by an agent for the current connector version (was v${x.agent_version})` }, dvorak.token);
      if (rv.ok) ok(`agent v${x.agent_version} revoked`); else note(`agent v${x.agent_version} not revoked (${rv.status}): ${rv.body?.message ?? ''}`);
    }
    return true;
  };

  console.log('\n6. one governed collection, operator-triggered (m.dvorak)');
  let first = await collectOnce();
  if (first.ok && first.body.run.state === 'failed' && /no active agent/.test(first.body.run.reason ?? '')) {
    note('no agent for this connector version — provisioning one');
    if (await provisionAgent()) first = await collectOnce();
  } else if (existingAgents.length === 0) {
    if (await provisionAgent()) first = await collectOnce();
  } else ok('an agent for the current connector version is registered');
  let runSummary = null;
  if (!first.ok) bad(`collect refused (${first.status}) ${first.body?.message ?? ''}`);
  else {
    const run = first.body.run;
    const detail = await call(`${O}/runs/${run.runId}/get`, mgr({ action: 'observation.read.runs', objectType: 'RUN', objectId: run.runId, sideEffect: 'none' }), {}, dvorak.token);
    const events = (detail.body.events ?? []).map((e) => e.event);
    const row = detail.body.run ?? {};
    runSummary = { runId: run.runId, state: run.state, mode: row.acquisition_mode ?? null, admitted: run.admitted, noop: run.noop, quarantined: run.quarantined, reason: run.reason ?? null, triggeredBy: run.triggeredBy ?? null, events };
    (run.state === 'finished' ? ok : bad)(`run ${short(run.runId)} ${run.state}: admitted ${run.admitted} · noop ${run.noop} · quarantined ${run.quarantined}${run.reason ? ` · ${run.reason}` : ''} · mode ${row.acquisition_mode ?? '?'} · triggered by ${run.triggeredBy ?? '?'}`);
    note(`run events: ${events.join(' → ')}`);
  }

  console.log('\n7. the evidence, the attribution, the register');
  const ev = await call(`${O}/evidence/list`, mgr({ action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none' }), { sourceId, limit: 200 }, dvorak.token);
  const rows = ev.body.evidence ?? [];
  const live = rows.filter((e) => e.payload?.acquisition_mode === 'live');
  const bytes = live.reduce((acc, e) => acc + Number(e.payload?.byte_length ?? 0), 0);
  ok(`${live.length} live evidence object(s) for ${key} (${rows.length} in total), ${bytes.toLocaleString()} live bytes, digests verified on admission`);
  for (const e of live.slice(0, 8)) note(`EVD ${short(e.object_id ?? e.objectId ?? '')} · declared ${e.payload?.media_type_declared ?? '?'} · sniffed ${e.payload?.media_type_sniffed ?? '?'} · ${Number(e.payload?.byte_length ?? 0).toLocaleString()} bytes${e.payload?.fragment ? ` · fragment of ${short(e.payload.parent_evd_id)} (${e.payload.fragment.method_ref})` : ' · parent'} · sha256 ${String(e.payload?.content_digest ?? '').slice(0, 12)}…`);
  const readiness = await call(`${O}/sources/readiness`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
  const reg2 = (readiness.body.sources ?? []).find((s) => s.source_id === sourceId && s.contract_version === V);
  if (reg2) {
    ok(`register: ${reg2.readiness.verdict.toUpperCase()} · ${reg2.readiness.reason}`);
    note(`schedule entry ${reg2.readiness.scheduled ? `recorded, every ${reg2.readiness.cadence_seconds} s` : 'none'} · scheduler ${reg2.readiness.scheduler_enabled ? 'ENABLED' : 'DISABLED in this deployment'} · last governed run ${reg2.readiness.last_run ? `${reg2.readiness.last_run.mode} ${reg2.readiness.last_run.state}, ${reg2.readiness.last_run.admitted} admitted` : 'none'} · evidence ${reg2.readiness.evidence_objects}`);
    ok(`attribution on v${V}: "${reg2.contract?.authority_and_rights?.attribution ?? '(not in the row)'}"`);
  } else bad('the source is missing from the readiness register');
  results.push({ proposal: p.id, key, sourceId, version: V, receipts, run: runSummary, evidence: { live: live.length, total: rows.length, liveBytes: bytes }, register: reg2 ? { verdict: reg2.readiness.verdict, scheduled: reg2.readiness.scheduled, cadence: reg2.readiness.cadence_seconds, scheduler_enabled: reg2.readiness.scheduler_enabled, evidence: reg2.readiness.evidence_objects } : null });
}

console.log('\n=== summary (JSON) ===');
console.log(JSON.stringify(results, null, 1).replace(/token=[^&#"\\]+/g, 'token=…'));
console.log(`\n=== proposals A and B — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
