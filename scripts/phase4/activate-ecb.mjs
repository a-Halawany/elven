/**
 * P4-M0b — activate the ECB EUR/USD source and backfill it through the
 * governed connector (owner decision 2, 2026-09-05).
 *
 * Every step is a request an operator could make; there is no back door:
 *   1. register contract v2 for the EXISTING source (registrar: a.hoffmann)
 *   2. approve it (manager: m.dvorak — a different person)
 *   3. record the rights evidence on v2 (m.dvorak)
 *   4. supersede v1 if it is active, activate v2 (m.dvorak)
 *   5. provision the collection agent if the source has none (platform admin,
 *      owner a.hoffmann)
 *   6. collect until the declared backfill is done — several runs, each inside
 *      the contract's own 12-request budget
 *   7. read back what was admitted, and the attribution every rate must carry
 *
 * Idempotent: re-running finds v2 and continues or confirms the backfill.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from './governed.mjs';
import { ecbContractV2, ECB_ATTRIBUTION } from './ecb-contract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

console.log('\n=== Phase 4 · P4-M0b — activate ECB EUR/USD and backfill it (governed) ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
if (hoffmann === null || dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const reg = (over) => as(hoffmann, scope, over);
const mgr = (over) => as(dvorak, scope, over);

/* 1. the source and its versions */
console.log('1. the source as it stands');
const list = await call(`${O}/sources/list`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }),
  { limit: 100 }, dvorak.token);
const versions = (list.body.sources ?? []).filter((s) => s.source_key === 'ecb-eurusd')
  .sort((a, b) => a.contract_version - b.contract_version);
if (versions.length === 0) { bad('ecb-eurusd is not registered — run the Phase 1 seed first'); process.exit(1); }
for (const v of versions) note(`v${v.contract_version} ${v.lifecycle_state} · ${v.acquisition_mode} · rights ${v.rights_state}`);
const sourceId = versions[0].source_id;
let v2 = versions.find((v) => v.acquisition_mode === 'live' && v.contract_version >= 2);
const current = versions[versions.length - 1];

/* 2–5. register, approve, rights, activate */
if (v2 === undefined) {
  console.log('\n2. register contract v2 — live, backfill declared, rights confirmed (as a.hoffmann)');
  const contract = ecbContractV2(current.contract_version);
  const r = await call(`${O}/sources/register`, reg({ action: 'observation.source.register', objectType: 'SRC', objectId: sourceId }),
    { contract, sourceId }, hoffmann.token);
  if (r.ok) { ok(`registered v${r.body.source.contractVersion} of ${sourceId.slice(0, 8)}… (${r.body.source.lifecycleState})`); v2 = { contract_version: r.body.source.contractVersion, lifecycle_state: 'draft' }; }
  else { bad(`registration refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }

  console.log('\n3. approval by a DIFFERENT operator (m.dvorak)');
  const self = await call(`${O}/sources/${sourceId}/approve`, reg({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }),
    { contractVersion: v2.contract_version, decision: 'approve', reason: 'approving my own registration' }, hoffmann.token);
  if (!self.ok) ok(`the registrar cannot approve their own registration (${self.status})`); else bad('a registrar approved their own contract');
  const a = await call(`${O}/sources/${sourceId}/approve`, mgr({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }),
    { contractVersion: v2.contract_version, decision: 'approve',
      reason: 'v2 reviewed: ESCB reuse terms read at the source, backfill window and ordering declared, budget unchanged at 12 requests per run' }, dvorak.token);
  if (a.ok) ok('approved'); else { bad(`approval refused (${a.status}) ${a.body?.message ?? ''}`); process.exit(1); }

  console.log('\n4. rights evidence recorded on v2');
  const rights = await call(`${O}/sources/${sourceId}/rights`, mgr({ action: 'observation.source.rights', objectType: 'SRC', objectId: sourceId }),
    { contractVersion: v2.contract_version, rightsState: 'confirmed',
      evidence: 'ESCB reuse policy (ecb.europa.eu): publicly available ESCB statistics may be reused free of charge on condition that the source is quoted (e.g. "Source: ECB statistics.") and that the statistics, including metadata, are not modified. Owner decision 2 of 2026-09-05; attribution carried on the contract.' },
    dvorak.token);
  if (rights.ok) ok('rights: confirmed, with the policy quoted as evidence'); else bad(`rights refused (${rights.status}) ${rights.body?.message ?? ''}`);

  console.log('\n5. activation — one active version per source');
  const active = versions.find((v) => v.lifecycle_state === 'active');
  if (active !== undefined) {
    const s = await call(`${O}/sources/${sourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }),
      { contractVersion: active.contract_version, target: 'superseded', reason: `superseded by v${v2.contract_version}` }, dvorak.token);
    if (s.ok) ok(`v${active.contract_version} superseded`); else bad(`supersession refused (${s.status}) ${s.body?.message ?? ''}`);
  } else note(`v${current.contract_version} was ${current.lifecycle_state} and never active; it stays on record as it is`);
  const t = await call(`${O}/sources/${sourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }),
    { contractVersion: v2.contract_version, target: 'active', reason: 'ECB activated on confirmed rights (owner decision 2, 2026-09-05)' }, dvorak.token);
  if (t.ok) ok(`v${v2.contract_version} active`); else { bad(`activation refused (${t.status}) ${t.body?.message ?? ''}`); process.exit(1); }
} else {
  console.log(`\n2–5. v${v2.contract_version} already registered (${v2.lifecycle_state}); continuing`);
}
const V = v2.contract_version;

/* 6. an agent for the source — for THIS connector version */
console.log('\n6. the collection agent');
const src = await call(`${O}/sources/${sourceId}/get`, mgr({ action: 'observation.read.sources', objectType: 'SRC', objectId: sourceId, sideEffect: 'none' }), {}, dvorak.token);
const existingAgents = (src.body.agents ?? []).filter((a) => a.status === 'active');
for (const a of existingAgents) note(`agent ${String(a.agent_id).slice(0, 8)}… v${a.agent_version} active`);
/*
 * THE VERSION IS THE IDENTITY. An agent registered for connector 1.1.0 cannot run
 * connector 1.2.0 — the run refuses it — so a new connector version needs a new
 * agent principal, provisioned by the platform administrator with a.hoffmann as
 * its accountable owner. The probe below asks the run itself; it is the
 * authoritative check, and nothing here guesses the version.
 */
async function collectOnce() {
  return call(`${O}/sources/${sourceId}/collect`, mgr({ action: 'observation.run.trigger', objectType: 'RUN' }),
    { contractVersion: V }, dvorak.token);
}
async function provisionAgent() {
  const r = await call(`${O}/agents/register`, {
    scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId,
    action: 'observation.agent.register', objectType: 'AGT', objectId: null,
    principalId: `principal:${admin.principalId}`, purposeId: 'observation',
  }, { sourceId, connector: 'rest', ownerPrincipalId: hoffmann.principalId }, admin.token);
  if (r.ok) ok(`agent provisioned ${r.body.agent.agentId.slice(0, 8)}… for the current connector version (owner a.hoffmann)`);
  else { bad(`agent provisioning refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  // Agents for an earlier connector version can no longer run; revoke them so the
  // source does not carry an instance that looks active and is not.
  for (const a of existingAgents) {
    const rv = await call(`${O}/agents/${a.agent_id}/revoke`, mgr({ action: 'observation.agent.revoke', objectType: 'AGT', objectId: a.agent_id }),
      { reason: `superseded by an agent for the current connector version (was v${a.agent_version})` }, dvorak.token);
    if (rv.ok) ok(`agent v${a.agent_version} revoked`); else note(`agent v${a.agent_version} not revoked (${rv.status}): ${rv.body?.message ?? ''}`);
  }
}
let first = await collectOnce();
if (first.ok && first.body.run.state === 'failed' && /no active agent/.test(first.body.run.reason ?? '')) {
  note('no agent for this connector version — provisioning one');
  await provisionAgent();
  first = await collectOnce();
} else if (existingAgents.length === 0) {
  await provisionAgent();
  first = await collectOnce();
} else ok('an agent for the current connector version is registered');

/* 7. collect until the backfill is done */
console.log('\n7. backfill — 1999-01-04 → today in 366-day windows, 12 requests per run');
let done = false;
let runs = 0;
let admitted = 0; let noop = 0; let quarantined = 0;
let pending = first;
while (!done && runs < 10) {
  const r = pending ?? await collectOnce();
  pending = null;
  runs += 1;
  if (!r.ok) { bad(`collect refused (${r.status}) ${r.body?.message ?? ''}`); break; }
  const run = r.body.run;
  admitted += run.admitted; noop += run.noop; quarantined += run.quarantined;
  const detail = await call(`${O}/runs/${run.runId}/get`, mgr({ action: 'observation.read.runs', objectType: 'RUN', objectId: run.runId, sideEffect: 'none' }), {}, dvorak.token);
  const cp = (detail.body.events ?? []).find((e) => e.event === 'run.checkpointed')?.details?.checkpoint?.backfill;
  note(`run ${run.runId.slice(0, 8)}… ${run.state}: admitted ${run.admitted} · noop ${run.noop} · quarantined ${run.quarantined}`
    + (cp ? ` · backfill ${cp.done ? 'DONE' : `at ${cp.cursor}`} (${cp.requests} requests so far)` : '')
    + (run.reason ? ` · ${run.reason}` : ''));
  if (run.state !== 'finished') { bad(`run ended ${run.state}`); break; }
  done = cp?.done === true;
  if (cp === undefined) break;
}
if (done) ok(`backfill complete after ${runs} run(s): ${admitted} window(s) admitted, ${noop} no-op, ${quarantined} quarantined`);
else bad('the backfill did not reach its end');

/* 8. what was admitted */
console.log('\n8. the evidence, and the attribution it carries');
const ev = await call(`${O}/evidence/list`, mgr({ action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none' }),
  { sourceId, limit: 200 }, dvorak.token);
const rows = ev.body.evidence ?? [];
const live = rows.filter((e) => e.payload?.acquisition_mode === 'live');
const bytes = live.reduce((a, e) => a + Number(e.payload?.byte_length ?? 0), 0);
ok(`${live.length} live evidence object(s) for ecb-eurusd, ${bytes.toLocaleString()} bytes, digests verified on admission`);
const contract = src.body?.source?.contract ?? src.body?.contract ?? null;
const attribution = contract?.authority_and_rights?.attribution ?? null;
if (attribution === ECB_ATTRIBUTION) ok(`attribution on the contract: "${attribution}"`);
else note(`attribution not readable from /sources/get (keys: ${JSON.stringify(Object.keys(src.body ?? {}))})`);

console.log(`\n=== P4-M0b — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
