/**
 * IMF PortWatch — progress activation on the owner-reported permission of 2026-09-10,
 * through the governed routes only (no SQL), on the demonstration deployment.
 *
 * What the owner reported: IMF PortWatch permission GRANTED; activation may progress
 * within the approved rights, cadence and budget. The grant text and its conditions
 * have NOT been supplied; they are recorded as pending at docs/sources/portwatch-grant.md.
 *
 * Acts, in order — each a request an operator could make:
 *   1. rights → confirmed on BOTH v1 contracts (m.dvorak, `observation.source.rights`),
 *      with the owner-reported evidence string; nothing else on v1 changes.
 *   2. `imf-portwatch-ports`: register v2 LIVE (a.hoffmann) — v1's cadence and budgets
 *      read back from the register and carried verbatim; the §4a backfill declared
 *      (arcgis-offset, ordered by date,portid, 1000 rows per page, [2019-01-01, the day
 *      the walk starts)); approve (m.dvorak); rights evidence on v2; v1 superseded, v2
 *      activated; the collection agent confirmed; ONE operator-triggered run, read back.
 *   3. `imf-portwatch-chokepoints`: STOPPED before registration. §4a's ordered walk over
 *      the three chokepoints (`orderByFields=date,portid`) frames every row by
 *      `expected_schema.item_key_field` = `attributes.date` alone, so a page carrying
 *      three chokepoints per day yields three deterministic children under ONE item key;
 *      the first walk would admit three evidence objects per key and every idempotent
 *      re-walk would compare each against only the latest of them and record the other
 *      two as revisions. The connector needs a composite framing key (date + portid),
 *      or a per-filter walk, before that v2 can be registered honestly. Not forced.
 *
 * Idempotent: a re-run finds v2 where it exists and continues. NOTHING HERE PRINTS A
 * CREDENTIAL: passwords are read from the local handoff, used for a login, never logged.
 *
 *   node scripts/integrations/activate-portwatch.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

export const RIGHTS_EVIDENCE = 'owner-reported IMF permission, 2026-09-10; grant text pending at docs/sources/portwatch-grant.md';
export const PORTWATCH_ATTRIBUTION = 'Source: IMF PortWatch (IMF / Oxford), portwatch.imf.org — provisional wording pending the grant text (docs/sources/portwatch-grant.md)';
const PORTWATCH_LICENCE = 'IMF Copyright and Usage terms (systematic download requires permission). Permission GRANTED — owner-reported 2026-09-10; the grant text, permitted uses, attribution wording and any rate or scope conditions are pending at docs/sources/portwatch-grant.md and will be recorded verbatim as rights evidence when supplied.';

const short = (id) => `${String(id).slice(0, 8)}…`;
const receipt = (r) => {
  const rc = r.body?.receipt;
  if (!rc) return '';
  const pd = rc.policyDecisionId ?? rc.policy_decision_id ?? rc.decisionId ?? null;
  const seq = rc.auditSeq ?? rc.audit_seq ?? rc.seq ?? null;
  return pd || seq ? ` [policy decision ${pd ? short(pd) : '?'} · audit seq ${seq ?? '?'}]` : ` ${JSON.stringify(rc)}`;
};
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

console.log('\n=== IMF PortWatch — owner-reported permission (2026-09-10): rights, then the ports v2 (governed) ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
if (hoffmann === null || dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const reg = (over) => as(hoffmann, scope, over);
const mgr = (over) => as(dvorak, scope, over);

async function readiness() {
  const r = await call(`${O}/sources/readiness`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
  return r.body.sources ?? [];
}
async function versionsOf(key) {
  return (await readiness()).filter((s) => s.source_key === key).sort((a, b) => a.contract_version - b.contract_version);
}

/* ───────────── 1. rights: confirmed on both v1 contracts ───────────── */
console.log('1. rights → confirmed on the two PortWatch v1 contracts (owner-reported permission; grant text pending)');
const sources = {};
for (const key of ['imf-portwatch-chokepoints', 'imf-portwatch-ports']) {
  const versions = await versionsOf(key);
  if (versions.length === 0) { bad(`${key} is not registered — run the Phase 1 seed first`); process.exit(1); }
  sources[key] = versions;
  const v1 = versions.find((v) => v.contract_version === 1) ?? versions[0];
  note(`${key}: ${versions.map((v) => `v${v.contract_version} ${v.lifecycle_state} · ${v.acquisition_mode} · rights ${v.rights_state}`).join('; ')}`);
  if (v1.rights_state === 'confirmed') { ok(`${key}@v${v1.contract_version} rights already confirmed`); continue; }
  const r = await call(`${O}/sources/${v1.source_id}/rights`, mgr({ action: 'observation.source.rights', objectType: 'SRC', objectId: v1.source_id }),
    { contractVersion: v1.contract_version, rightsState: 'confirmed', evidence: RIGHTS_EVIDENCE }, dvorak.token);
  if (r.ok) ok(`${key}@v${v1.contract_version} rights: ${r.body.source?.rightsState ?? 'confirmed'}${receipt(r)}`);
  else bad(`${key}@v${v1.contract_version} rights refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body)}`);
}

/* ───────────── 2. imf-portwatch-ports: v2 LIVE with the §4a backfill ───────────── */
console.log('\n2. imf-portwatch-ports — contract v2: live, the §4a backfill declared, v1 cadence and budgets carried verbatim');
const portsVersions = sources['imf-portwatch-ports'];
const portsV1 = portsVersions.find((v) => v.contract_version === 1) ?? portsVersions[0];
const portsSourceId = portsV1.source_id;
const v1c = portsV1.contract;
if (!v1c) { bad('the v1 contract body is not readable from the readiness register'); process.exit(1); }
const current = portsVersions[portsVersions.length - 1];
let v2 = portsVersions.find((v) => v.acquisition_mode === 'live' && v.contract_version >= 2);

function portsContractV2(v1, supersedesVersion) {
  const base = v1.identity.endpoints[0].split('?')[0];
  const { replay_set: _replay, ...so } = v1.security_and_operations;
  return {
    ...v1,
    acquisition_mode: 'live',
    identity: {
      ...v1.identity,
      // The same declared resource and filter as v1; the forward poll asks for the
      // newest 30 rows in date order, as the permission request describes ("new rows
      // once per day") and as ECB v2 does with lastNObservations=30. Unbounded, the
      // service answers its first maxRecordCount rows in an undefined order.
      endpoints: [`${base}?where=portid%3D%27port1114%27&outFields=*&orderByFields=date%20DESC&resultRecordCount=30&f=json`],
      // cadence_seconds and jitter_seconds: v1's, unchanged.
    },
    authority_and_rights: {
      ...v1.authority_and_rights,
      attribution: PORTWATCH_ATTRIBUTION,
      rights_state: 'confirmed',
      licence: PORTWATCH_LICENCE,
      legal_basis: 'IMF PortWatch open-data publication; systematic collection under the permission the owner reported on 2026-09-10 (grant text pending)',
      // permitted_use stays v1's ['internal analysis']: the grant's conditions are not yet held.
    },
    security_and_operations: {
      ...so,
      // budgets: v1's, unchanged (12 requests, 32 MiB per run).
      freshness_expectation: {
        // §4a publication lag: PortWatch publishes 7–10 days behind real time; a
        // 3-day threshold would read stale by design. Daily interval, 14-day threshold.
        threshold_seconds: 1_209_600,
        expected_interval: 'daily, published with a 7–10 day lag (Phase 4 plan §4a)',
      },
      coverage_expectations: {
        universe_version: 'v2',
        denominator_derivation: 'one framed row per port per day; the backfill window is [2019-01-01, the day the walk starts); the forward poll carries the newest 30 rows',
        expected_items_per_window: 1,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'the publisher revises rows in place and offers no corrections feed; a re-walk under a new contract version compares each page with what is held and records changed rows as revisions (supersessions), identical pages as audited no-ops',
      backfill: {
        strategy: 'arcgis-offset',
        endpoint: base,
        from: '2019-01-01',
        to: null,
        page_size: 1000,
        order_by: 'date,portid',
        time_field: 'date',
        where: "portid='port1114'",
      },
    },
    lifecycle: {
      contract_version: supersedesVersion + 1,
      effective_from: '2026-09-10T00:00:00Z',
      effective_to: null,
      supersedes_version: supersedesVersion,
    },
  };
}

if (v2 === undefined) {
  const contract = portsContractV2(v1c, current.contract_version);
  note(`cadence ${contract.identity.cadence_seconds} s (v1: ${v1c.identity.cadence_seconds}) · budgets ${JSON.stringify(contract.security_and_operations.budgets)} (v1's, unchanged)`);
  console.log('\n2a. register v2 (as a.hoffmann)');
  const r = await call(`${O}/sources/register`, reg({ action: 'observation.source.register', objectType: 'SRC', objectId: portsSourceId }),
    { contract, sourceId: portsSourceId }, hoffmann.token);
  if (r.ok) { ok(`registered v${r.body.source.contractVersion} of ${short(portsSourceId)} (${r.body.source.lifecycleState})${receipt(r)}`); v2 = { contract_version: r.body.source.contractVersion, lifecycle_state: 'draft' }; }
  else { bad(`registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body)}`); console.log(`\n=== stopped at registration — ${failureCount()} problem(s) ===\n`); process.exit(1); }

  console.log('\n2b. approval by a DIFFERENT operator (m.dvorak)');
  const a = await call(`${O}/sources/${portsSourceId}/approve`, mgr({ action: 'observation.source.approve', objectType: 'SRC', objectId: portsSourceId }),
    { contractVersion: v2.contract_version, decision: 'approve',
      reason: 'v2 reviewed: owner-reported IMF permission of 2026-09-10 (grant text pending at docs/sources/portwatch-grant.md); §4a backfill declared (arcgis-offset, ordered by date,portid, 1000 rows per page, from 2019-01-01); cadence and budgets unchanged from v1 (daily, 12 requests and 32 MiB per run); permitted use unchanged' }, dvorak.token);
  if (a.ok) ok(`approved${receipt(a)}`); else { bad(`approval refused (${a.status}) ${a.body?.message ?? JSON.stringify(a.body)}`); process.exit(1); }

  console.log('\n2c. rights evidence recorded on v2');
  const rights = await call(`${O}/sources/${portsSourceId}/rights`, mgr({ action: 'observation.source.rights', objectType: 'SRC', objectId: portsSourceId }),
    { contractVersion: v2.contract_version, rightsState: 'confirmed', evidence: RIGHTS_EVIDENCE }, dvorak.token);
  if (rights.ok) ok(`rights: confirmed${receipt(rights)}`); else bad(`rights refused (${rights.status}) ${rights.body?.message ?? JSON.stringify(rights.body)}`);

  console.log('\n2d. activation — one active version per source');
  const active = portsVersions.find((v) => v.lifecycle_state === 'active');
  if (active !== undefined) {
    const s = await call(`${O}/sources/${portsSourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: portsSourceId }),
      { contractVersion: active.contract_version, target: 'superseded', reason: `superseded by v${v2.contract_version}` }, dvorak.token);
    if (s.ok) ok(`v${active.contract_version} superseded${receipt(s)}`); else bad(`supersession refused (${s.status}) ${s.body?.message ?? JSON.stringify(s.body)}`);
  }
  const t = await call(`${O}/sources/${portsSourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: portsSourceId }),
    { contractVersion: v2.contract_version, target: 'active', reason: 'PortWatch ports activated on the owner-reported IMF permission of 2026-09-10; grant text pending' }, dvorak.token);
  if (t.ok) ok(`v${v2.contract_version} active${receipt(t)}`); else { bad(`activation refused (${t.status}) ${t.body?.message ?? JSON.stringify(t.body)}`); process.exit(1); }
} else {
  console.log(`\n2a–2d. v${v2.contract_version} already registered (${v2.lifecycle_state}); continuing`);
}
const V = v2.contract_version;

/* the scheduler fires an `every` job once on upsert: wait for that automatic attempt before the operator run */
console.log('\n2e. the automatic attempt the activation schedules (this deployment runs the scheduler and a worker)');
const before = (await versionsOf('imf-portwatch-ports')).find((v) => v.contract_version === V)?.readiness?.automatic;
note(`schedule entry: ${before?.schedule_entry ? `${before.schedule_entry.status}, every ${before.schedule_entry.cadence_seconds} s` : 'none'} · worker ${before?.runtime?.worker_running ? 'running' : 'not running'} · redis scheduler ${before?.runtime?.redis_scheduler?.state ?? '?'}`);
let auto = null;
for (let i = 0; i < 24; i += 1) {
  const now = (await versionsOf('imf-portwatch-ports')).find((v) => v.contract_version === V)?.readiness?.automatic;
  const la = now?.last_attempt;
  if (la && la.finished_at && Date.parse(la.started_at) > Date.now() - 10 * 60_000) { auto = la; break; }
  await sleep(5000);
}
if (auto) note(`automatic attempt ${auto.outcome.toUpperCase()} · run ${auto.run_id ? short(auto.run_id) : 'none'} · admitted ${auto.admitted} · unchanged ${auto.noop} · quarantined ${auto.quarantined}${auto.reason ? ` · ${auto.reason}` : ''}`);
else note('no automatic attempt observed within two minutes of activation (reported as configured, not observed)');

/* 2f. the agent for THIS connector version, then ONE operator run */
console.log('\n2f. the collection agent, and ONE operator-triggered governed run (m.dvorak, observation.run.trigger)');
const src = await call(`${O}/sources/${portsSourceId}/get`, mgr({ action: 'observation.read.sources', objectType: 'SRC', objectId: portsSourceId, sideEffect: 'none' }), {}, dvorak.token);
const existingAgents = (src.body.agents ?? []).filter((x) => x.status === 'active');
for (const x of existingAgents) note(`agent ${short(x.agent_id)} v${x.agent_version} active`);
async function collectOnce() {
  return call(`${O}/sources/${portsSourceId}/collect`, mgr({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion: V }, dvorak.token);
}
async function provisionAgent() {
  const r = await call(`${O}/agents/register`, {
    scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId,
    action: 'observation.agent.register', objectType: 'AGT', objectId: null,
    principalId: `principal:${admin.principalId}`, purposeId: 'observation',
  }, { sourceId: portsSourceId, connector: 'rest', ownerPrincipalId: hoffmann.principalId }, admin.token);
  if (r.ok) ok(`agent provisioned ${short(r.body.agent.agentId)} for the current connector version (owner a.hoffmann)`);
  else { bad(`agent provisioning refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  for (const x of existingAgents) {
    const rv = await call(`${O}/agents/${x.agent_id}/revoke`, mgr({ action: 'observation.agent.revoke', objectType: 'AGT', objectId: x.agent_id }),
      { reason: `superseded by an agent for the current connector version (was v${x.agent_version})` }, dvorak.token);
    if (rv.ok) ok(`agent v${x.agent_version} revoked`); else note(`agent v${x.agent_version} not revoked (${rv.status}): ${rv.body?.message ?? ''}`);
  }
}
let run = await collectOnce();
if (run.ok && run.body.run.state === 'failed' && /no active agent|does not match the connector/.test(run.body.run.reason ?? '')) {
  note(`the run refused the agent: ${run.body.run.reason} — provisioning one for this connector version`);
  await provisionAgent();
  run = await collectOnce();
}
if (!run.ok) { bad(`collect refused (${run.status}) ${run.body?.message ?? JSON.stringify(run.body)}`); }
else {
  const o = run.body.run;
  const detail = await call(`${O}/runs/${o.runId}/get`, mgr({ action: 'observation.read.runs', objectType: 'RUN', objectId: o.runId, sideEffect: 'none' }), {}, dvorak.token);
  const events = detail.body.events ?? [];
  const started = events.find((e) => e.event === 'run.started');
  const ended = events.find((e) => /^run\.(finished|failed|cancelled|budget_exceeded)$/.test(e.event));
  const cp = events.find((e) => e.event === 'run.checkpointed')?.details?.checkpoint?.backfill;
  const fetched = events.filter((e) => e.event === 'item.fetched');
  const quarantined = events.filter((e) => e.event === 'item.quarantined');
  const requests = ended?.details?.requests ?? ended?.details?.requests_made ?? fetched.filter((e) => !String(e.details?.item_key ?? '').includes('#')).length;
  (o.state === 'finished' ? ok : bad)(`operator run ${short(o.runId)} ${o.state}: admitted ${o.admitted} · unchanged/noop ${o.noop} · quarantined ${o.quarantined}${o.reason ? ` · ${o.reason}` : ''}`);
  note(`trigger ${JSON.stringify(started?.details?.trigger ?? null)} · ${ended?.event ?? '?'} · requests ${requests} · bytes transferred ${ended?.details?.bytes_transferred ?? '?'} · bytes stored ${ended?.details?.bytes_stored ?? '?'}`);
  if (cp) note(`backfill checkpoint: ${cp.done ? 'DONE' : `at offset ${cp.cursor}`} · window ${cp.from}..${cp.to} · ${cp.requests} request(s), ${cp.items} item(s) so far`);
  for (const q of quarantined.slice(0, 5)) note(`quarantined ${String(q.details?.item_key ?? '').slice(-60)}: ${q.details?.reason_class ?? ''} ${q.details?.reason ?? ''}`);
  if (ended?.event === 'run.failed') note(`failure details: ${JSON.stringify(ended.details).slice(0, 600)}`);
}

/* 2g. read back */
console.log('\n2g. the register after the acts');
for (const s of await versionsOf('imf-portwatch-ports')) {
  const rd = s.readiness;
  note(`imf-portwatch-ports@v${s.contract_version} ${s.lifecycle_state} · ${s.acquisition_mode} · rights ${s.rights_state} · ${rd.verdict.toUpperCase()} — ${rd.reason} · evidence ${rd.evidence_objects}` +
    (rd.last_run ? ` · last run ${rd.last_run.mode} ${rd.last_run.state} (${rd.last_run.admitted} admitted, ${rd.last_run.quarantined} quarantined${rd.last_run.failure ? `, ${rd.last_run.failure}` : ''})` : ''));
}
for (const s of await versionsOf('imf-portwatch-chokepoints')) {
  note(`imf-portwatch-chokepoints@v${s.contract_version} ${s.lifecycle_state} · ${s.acquisition_mode} · rights ${s.rights_state} · ${s.readiness.verdict.toUpperCase()} — ${s.readiness.reason}`);
}

/* ───────────── 3. imf-portwatch-chokepoints: stopped before registration ───────────── */
console.log('\n3. imf-portwatch-chokepoints — v2 NOT registered (stopped): §4a\'s ordered walk over three chokepoints needs a composite framing key');
note('the connector frames each page by expected_schema.item_key_field (a single path: attributes.date); three chokepoints per day collide on one deterministic item key');
note('a v2 narrowed to one chokepoint, or three contract versions, would be a different plan than §4a; not forced. See SOURCE_INTEGRATION_STATUS.md §9.');

console.log(`\n=== PortWatch activation — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
