/**
 * The corridor demonstration, ACT V — "before we commit."
 *
 * Act IV said what the corridor is likely to do and warned the owner when the
 * branch flipped. This act builds a TWIN of the Ningbo → Regensburg chain from
 * the evidence the earlier acts already hold, runs reroute / air bridge / draw-down
 * against the replayed January collapse on one common control, reproduces a run
 * from its stored contract, and shows a publisher correction reaching the twin —
 * through the operator's walk, not by itself. Every simulated number is marked
 * SYNTHETIC; no option is recommended and nothing is decided (that is Phase 6).
 *
 *   1. the twin owner, the boundary entity, the uploaded records
 *   2. DECLARE the twin (asserted) and open version 1 on branch `actual` with
 *      observations through 2024-01-17, read at the replay's actual record time
 *   3. GROUND it: transits observed from PortWatch (real, attributed); inventory,
 *      consumption and shipments observed from the uploaded records; route days,
 *      reroute delta, corridor delay, freight and line-stop terms ASSUMED from the
 *      uploaded terms; ADMIT — the state set is digested and bound
 *   4. the CONTROL run (intervention: none) on the flipped branch's shock
 *   5. interventions on that control: reroute 4472, air bridge, draw-down, both
 *   6. REPRODUCE the control — in this process, from the stored contract, and by
 *      the API — identical digest
 *   7. change one assumption by hand: a new version, a new run, a different digest
 *   8. the publisher restates a corridor day: propagation PENDING until the
 *      strategy owner runs the walk; then the citing version is UNVERIFIED and
 *      the runs are surfaced
 *
 * Idempotent: re-running reuses the twin it finds.
 */
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

console.log('\n=== Act V — before we commit ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const P = `/v1/tenants/${T}/domains/${D}/prediction`;
const G = `/v1/tenants/${T}/domains/${D}/graph`;
const O = `/v1/tenants/${T}/domains/${D}/observation`;
const W = `/v1/tenants/${T}/domains/${D}/twins`;

/* ── 1. operators, boundary, records ─────────────────────────────────────── */
console.log('1. the twin owner, the boundary, the records');
const principals = await call(`/v1/tenants/${T}/principals/list`, {
  scope: 'TENANT', tenantId: T, action: 'identity.principal.list', objectType: 'PRN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
}, {}, admin.token);
const existing = principals.ok ? (principals.body.principals ?? []) : [];
async function ensureOperator(loginName, displayName, roleCode) {
  const found = existing.find((p) => p.login_name === loginName);
  if (found !== undefined) {
    // A login name is a person, not a role: an existing principal is reused only if it IS this persona.
    if (found.display_name !== displayName) { bad(`login ${loginName} already belongs to "${found.display_name}" — a different persona; refusing to reuse it`); process.exit(1); }
    ok(`${displayName} present (${roleCode})`); return found.id;
  }
  const r = await call(`/v1/tenants/${T}/principals`, {
    scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, { kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD, roleCode, domainId: D }, admin.token);
  if (r.ok) { ok(`${displayName} created (${roleCode})`); return r.body.principal?.principalId; }
  if (r.status === 409) { ok(`${displayName} present (${roleCode})`); return null; }
  bad(`could not create ${displayName}: ${r.status} ${r.body?.message ?? ''}`); return null;
}
await ensureOperator('t.nakamura', 'T. Nakamura — twin owner', 'twin_owner');
const twinOwner = await login('t.nakamura', OPERATOR_PASSWORD);
const strategyOwner = await login('j.weber', OPERATOR_PASSWORD);
const collectionManager = await login('m.dvorak', OPERATOR_PASSWORD);
const operator = await login('a.hoffmann', OPERATOR_PASSWORD);
if (!twinOwner || !strategyOwner || !collectionManager || !operator) { console.error('operator authentication failed'); process.exit(1); }
const tw = (over) => as(twinOwner, scope, { purposeId: 'twin', ...over });
const sm = (over) => as(twinOwner, scope, { purposeId: 'simulation', ...over });
const so = (over) => as(strategyOwner, scope, { purposeId: 'graph', ...over });
const cm = (over) => as(collectionManager, scope, { purposeId: 'observation', ...over });
const op = (over) => as(operator, scope, { purposeId: 'observation', ...over });

const entities = await call(`${G}/entities/list`, so({ action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), { limit: 500 }, strategyOwner.token);
// The boundary is a set of RESOLVED entities (act III): the company, the constrained component, and the corridor
// place the graph actually holds — chosen from the graph, never typed in.
const all = entities.body.entities ?? [];
const company = all.find((e) => e.entity_type === 'organization' && /nordwerk/i.test(e.canonical_name));
const component = all.find((e) => e.entity_type === 'product' && e.canonical_name === 'SYN-PART-MAG');
const places = all.filter((e) => e.entity_type === 'place');
const corridor = places.find((e) => /bab el-mandeb/i.test(e.canonical_name)) ?? places.find((e) => /suez/i.test(e.canonical_name)) ?? places[0];
const boundaryEntities = [company, component, corridor].filter(Boolean);
if (boundaryEntities.length === 0) { bad('no resolved entities from act III — run scripts/phase3/seed-graph.mjs first'); process.exit(1); }
ok(`boundary: ${boundaryEntities.map((e) => `${e.canonical_name} (${e.entity_type})`).join(' · ')}`);

// The uploaded NORDWERK records, identified by their bytes — never by a name someone typed.
const sources = await call(`${O}/sources/list`, cm({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, collectionManager.token);
const nordwerk = (sources.body.sources ?? []).find((s) => s.source_key === 'nordwerk-internal');
const portwatch = (sources.body.sources ?? []).find((s) => s.source_key === 'imf-portwatch-chokepoints');
if (nordwerk === undefined || portwatch === undefined) { bad('the NORDWERK upload source or the PortWatch source is missing — run act I first'); process.exit(1); }
const uploads = await call(`${O}/evidence/list`, cm({ action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none' }), { sourceId: nordwerk.source_id, limit: 50 }, collectionManager.token);
const records = {};
for (const e of (uploads.body.evidence ?? [])) {
  const got = await call(`${O}/evidence/${e.object_id}/download`, cm({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: e.object_id }), {}, collectionManager.token);
  if (!got.ok) continue;
  const head = Buffer.from(got.body.download?.base64 ?? got.body.base64 ?? "", 'base64').toString('utf8').slice(0, 200);
  const kind = /record_id,kind,key,component_id/.test(head) ? 'terms' : /record_id,component_id,on_hand/.test(head) ? 'inventory' : /shipment_id,component_id,qty/.test(head) ? 'shipments' : null;
  if (kind !== null && records[kind] === undefined) records[kind] = { id: e.object_id, version: Number(e.object_version) };
}
for (const k of ['inventory', 'shipments', 'terms']) {
  if (records[k]) ok(`${k} record: EVD ${records[k].id.slice(0, 8)}…@${records[k].version} (synthetic, marked at object level)`);
  else bad(`no uploaded ${k} record found (is routes-and-terms-2024Q1.csv in the upload manifest?)`);
}
if (!records.inventory || !records.shipments || !records.terms) process.exit(1);
const cite = (r) => [{ kind: 'evidence', id: r.id, version: r.version }];

/* ── 2. declare ──────────────────────────────────────────────────────────── */
console.log('\n2. declare the twin — asserted by a person, with its boundary, model and limitations');
const listed = await call(`${W}/list`, tw({ action: 'twin.read', objectType: 'TWN', sideEffect: 'none' }), {}, twinOwner.token);
let twin = (listed.body.twins ?? []).find((t) => t.title.startsWith('NORDWERK'));
if (twin === undefined) {
  const r = await call(`${W}/declare`, tw({ action: 'twin.declare', objectType: 'TWN' }), {
    kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain',
    statement: 'the NdFeB magnet supply from Ningbo Precision Magnetics to the Regensburg plant through Bab el-Mandeb and Suez',
    boundary: boundaryEntities.map((e) => e.entity_id), owner: twinOwner.principalId, behaviourModelRef: 'supply-flow@1',
    intendedDecisions: ['book SYN-SHIP-4475 via the Cape or not', 'bridge a week of magnets by air or not'],
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['the company records are synthetic', 'calendar days, no working-day calendar', 'liquidated damages not modelled', 'single component per run'] },
  }, twinOwner.token);
  if (!r.ok) { bad(`declaration refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
  twin = { twin_id: r.body.twin.twinId, versions: [] };
  ok(`twin declared ${twin.twin_id.slice(0, 8)}… — validation: unvalidated (synthetic grounding)`);
} else ok(`twin present ${twin.twin_id.slice(0, 8)}… (${twin.versions.filter((v) => v.state === 'admitted').length} admitted version(s))`);
const TW = twin.twin_id;

/* ── 3. ground and admit version 1 ───────────────────────────────────────── */
console.log('\n3. ground version 1 — observations through 2024-01-17, read at the replay\'s actual record time');
let v1 = (twin.versions ?? []).find((v) => v.branch_id === 'actual' && v.state === 'admitted')?.version ?? null;
if (v1 === null) {
  // A branch holds one open draft at a time: resume it if an earlier pass left one, else open one.
  const draft = (twin.versions ?? []).find((v) => v.branch_id === 'actual' && v.state === 'draft')?.version ?? null;
  const o = draft !== null ? { ok: true, body: { version: { version: draft } } }
    : await call(`${W}/${TW}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' }, twinOwner.token);
  if (!o.ok) { bad(`version refused (${o.status}) ${o.body?.message ?? ''}`); process.exit(1); }
  v1 = o.body.version.version;
  if (draft !== null) note(`resuming open draft ${draft} on branch actual`);
  const s = await call(`${W}/${TW}/versions/${v1}/ground-series`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { seriesKey: 'portwatch:chokepoint4:n_total', key: 'series.transits:chokepoint4' }, twinOwner.token);
  if (s.ok) ok(`transits OBSERVED from PortWatch: ${s.body.grounded.points} point(s) through ${s.body.grounded.observedThrough}, read at ${s.body.grounded.knownAt} (real, attributed; nothing "known in January 2024")`);
  else if (draft !== null && s.status === 409) note('the series is already grounded in the resumed draft (elements are append-only per draft: a key is grounded once)');
  else bad(`series grounding refused (${s.status}) ${s.body?.message ?? ''}`);
  const elements = [
    { key: 'inventory.on_hand:SYN-PART-MAG', kind: 'observed', value: 63400, unit: 'sets', validFrom: '2024-01-11', citations: cite(records.inventory) },
    { key: 'inventory.safety_stock:SYN-PART-MAG', kind: 'observed', value: 40000, unit: 'sets', validFrom: '2024-01-11', citations: cite(records.inventory) },
    { key: 'consumption.weekly:SYN-PART-MAG', kind: 'observed', value: 9200, unit: 'sets/week', validFrom: '2024-01-11', citations: cite(records.inventory) },
    { key: 'shipment:SYN-SHIP-4471', kind: 'observed', value: { qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk', component: 'SYN-PART-MAG' }, citations: cite(records.shipments) },
    { key: 'shipment:SYN-SHIP-4472', kind: 'observed', value: { qty: 41000, eta_port: '2024-02-08', position: 'Malacca Strait', status: 'reroutable', component: 'SYN-PART-MAG' }, citations: cite(records.shipments) },
    { key: 'shipment:SYN-SHIP-4475', kind: 'observed', value: { qty: 39200, eta_port: '2024-02-22', position: 'Ningbo', status: 'bookable', component: 'SYN-PART-MAG' }, citations: cite(records.shipments) },
    { key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: cite(records.terms) },
    { key: 'route.reroute_delay_days', kind: 'assumed', value: 11, unit: 'days', citations: cite(records.terms) },
    { key: 'terms.reroute_cost_per_container', kind: 'assumed', value: 1850, unit: 'EUR', citations: cite(records.terms) },
    { key: 'terms.units_per_container:SYN-PART-MAG', kind: 'assumed', value: 1600, unit: 'sets', citations: cite(records.terms) },
    { key: 'terms.air_cost_per_kg', kind: 'assumed', value: 19.4, unit: 'EUR', citations: cite(records.terms) },
    { key: 'terms.kg_per_unit:SYN-PART-MAG', kind: 'assumed', value: 0.445652, unit: 'kg', citations: cite(records.terms) },
    { key: 'terms.air_lead_days', kind: 'assumed', value: 7, unit: 'days', citations: cite(records.terms) },
    { key: 'terms.line_stop_cost_per_day:SYN-LINE-A1', kind: 'assumed', value: 142000, unit: 'EUR', citations: cite(records.terms) },
    { key: 'shock.corridor_delay_days', kind: 'assumed', value: 14, unit: 'days', citations: cite(records.terms) },
    { key: 'production.policy:SYN-PART-MAG', kind: 'assumed', value: 'hold_safety_stock', citations: cite(records.terms) },
  ];
  const g = await call(`${W}/${TW}/versions/${v1}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { elements }, twinOwner.token);
  if (!g.ok) { bad(`grounding refused (${g.status}) ${g.body?.message ?? ''}`); process.exit(1); }
  ok(`${g.body.grounded.length} element(s) grounded: ${g.body.grounded.filter((x) => x.material).length} material, all citing the uploaded records; synthetic world: ${g.body.grounded.every((x) => x.syntheticState)}`);
  const a = await call(`${W}/${TW}/versions/${v1}/admit`, tw({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), {}, twinOwner.token);
  if (!a.ok) { bad(`admission refused (${a.status}) ${a.body?.message ?? ''}`); process.exit(1); }
  ok(`version ${v1} ADMITTED: ${a.body.admitted.completeness}, state set ${a.body.admitted.stateSetDigest.slice(0, 16)}…, synthetic_state ${a.body.admitted.syntheticState} (the twin of a synthetic world says so, though asserted)`);
} else ok(`version ${v1} already admitted on branch actual`);

/* ── 4–5. the control and the interventions ──────────────────────────────── */
console.log('\n4. the control run — intervention: none — on the flipped branch\'s shock');
const scenarios = await call(`${P}/scenarios/list`, tw({ action: 'prediction.read', objectType: 'SCN', sideEffect: 'none', purposeId: 'prediction' }), {}, twinOwner.token);
const scn = (scenarios.body.scenarios ?? []).find((s) => /bab el-mandeb/i.test(s.title));
const branch = scn?.branches?.find((b) => b.kind === 'downside');
if (branch?.state === 'flipped') ok(`the scenario branch "${branch.name}" is FLIPPED (act IV) — the corridor delay applies`);
else bad('act IV\'s downside branch is not flipped; the shock has no basis');
const runs = await call(`${W}/simulations/list`, sm({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { twinId: TW }, twinOwner.token);
const priorControl = (runs.body.runs ?? []).find((r) => r.run_kind === 'control' && r.twin_version === v1 && r.shock && r.state === 'completed');
const runOnce = async (label, payload) => {
  const r = await call(`${W}/simulations/run`, sm({ action: 'simulation.run', objectType: 'SIM' }), { twinId: TW, twinVersion: v1, component: 'SYN-PART-MAG', horizonDays: 90, stochastic: { mode: 'deterministic' },
    scenarioId: scn?.scenario_id ?? null, scenarioBranchId: branch?.branch_id ?? null, ...payload }, twinOwner.token);
  if (!r.ok) { bad(`${label} refused (${r.status}) ${r.body?.message ?? ''}`); return null; }
  const t = r.body.run.totals;
  ok(`${label}: ${t.line_stop_days} line-stop day(s)${t.first_line_stop_date ? ` from ${t.first_line_stop_date}` : ''} · ${t.days_below_safety_stock} day(s) below safety stock · cost €${t.cost.total} (reroute €${t.cost.reroute}, air €${t.cost.air}, line stop €${t.cost.line_stop}) — SYNTHETIC · outputs ${r.body.run.outputsDigest.slice(0, 16)}…`);
  return r.body.run;
};
const control = priorControl ? { runId: priorControl.run_id, totals: priorControl.outputs.totals, outputsDigest: priorControl.outputs_digest } : await runOnce('CONTROL (none, shock)', { runKind: 'control', controlRunId: null, shock: true, interventions: [{ type: 'none' }] });
if (control === null) process.exit(1);
if (priorControl) ok(`control run present ${control.runId.slice(0, 8)}…`);
console.log('\n5. interventions, each on that control');
const withControl = (interventions) => ({ runKind: 'intervention', controlRunId: control.runId, shock: true, interventions });
const reroute = await runOnce('reroute SYN-SHIP-4472 via the Cape', withControl([{ type: 'reroute', shipment: 'SYN-SHIP-4472' }]));
const air = await runOnce('air bridge — one week of magnets, decided 2024-01-17', withControl([{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }]));
const draw = await runOnce('draw down safety stock (consume to zero)', withControl([{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }]));
const both = await runOnce('draw down + reroute SYN-SHIP-4472', withControl([{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }, { type: 'reroute', shipment: 'SYN-SHIP-4472' }]));
const refused = await call(`${W}/simulations/run`, sm({ action: 'simulation.run', objectType: 'SIM' }), { twinId: TW, twinVersion: v1, component: 'SYN-PART-MAG', horizonDays: 90, stochastic: { mode: 'deterministic' }, ...withControl([{ type: 'reroute', shipment: 'SYN-SHIP-4471' }]) }, twinOwner.token);
if (!refused.ok) ok(`rerouting SYN-SHIP-4471 (status "at risk", already committed to the corridor) is refused (${refused.status})`); else bad('a committed shipment was rerouted');
const ids = [control.runId, reroute?.runId, air?.runId, draw?.runId, both?.runId].filter(Boolean);
const cmp = await call(`${W}/simulations/compare`, sm({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { runIds: ids }, twinOwner.token);
if (cmp.ok) {
  ok(`compared on one control (${cmp.body.comparison.control_run_id.slice(0, 8)}…), SYNTHETIC:`);
  for (const r of cmp.body.comparison.runs) note(`${r.run_kind.padEnd(12)} ${r.interventions.map((i) => i.type).join('+').padEnd(20)} stop days ${String(r.totals.line_stop_days).padStart(3)} · below safety stock ${String(r.totals.days_below_safety_stock).padStart(3)} · €${r.totals.cost.total.padStart(12)} · carrying: ${r.carrying.join(', ')}`);
} else bad(`comparison refused (${cmp.status}) ${cmp.body?.message ?? ''}`);
const sens = await call(`${W}/simulations/${control.runId}/get`, sm({ action: 'simulation.read', objectType: 'SIM', objectId: control.runId, sideEffect: 'none' }), {}, twinOwner.token);
if (sens.ok) {
  const f = sens.body.run.sensitivity?.factors ?? [];
  ok(`the assumption carrying the control's result: ${f[0]?.key} (cost spread €${f[0]?.cost_spread}); then ${f[1]?.key} (€${f[1]?.cost_spread})`);
}

/* ── 6. reproduce ────────────────────────────────────────────────────────── */
console.log('\n6. reproduce the control from its stored contract');
const stored = sens.ok ? sens.body.run : null;
if (stored) {
  // THIS process is cold with respect to the API: it holds nothing but the stored contract and the pinned implementation.
  const require = createRequire(import.meta.url);
  const { contractOf } = await import(join(ROOT, 'apps/api/dist/twin/simulations/simulation.service.js'));
  const { simulateSupplyFlow } = await import(join(ROOT, 'apps/api/dist/twin/models/supply-flow.js'));
  const { jcsCanonicalize } = await import(join(ROOT, 'packages/contracts/dist/index.js'));
  void require;
  const c = contractOf(stored);
  const out = simulateSupplyFlow(c.params, c.options, c.interventions);
  const digest = createHash('sha256').update(jcsCanonicalize(out)).digest('hex');
  if (digest === stored.outputs_digest) ok(`cold re-execution in this process: outputs digest ${digest.slice(0, 16)}… identical to the stored ${String(stored.outputs_digest).slice(0, 16)}…`);
  else bad(`cold re-execution produced ${digest.slice(0, 16)}… but the run recorded ${String(stored.outputs_digest).slice(0, 16)}…`);
}
const rep = await call(`${W}/simulations/${control.runId}/reproduce`, sm({ action: 'simulation.reproduce', objectType: 'SIM', objectId: control.runId }), { cold: false }, twinOwner.token);
if (rep.ok && rep.body.reproduction.verdict === 'reproduced') ok(`the API's reproduction: ${rep.body.reproduction.verdict.toUpperCase()} — ${rep.body.reproduction.reason}`);
else bad(`reproduction ${rep.ok ? rep.body.reproduction.verdict : `refused (${rep.status})`}`);

/* ── 7. change one assumption by hand ────────────────────────────────────── */
console.log('\n7. change one assumption by hand: a new version, a new run, a different digest');
const twinNow = await call(`${W}/${TW}/get`, tw({ action: 'twin.read', objectType: 'TWN', objectId: TW, sideEffect: 'none' }), {}, twinOwner.token);
let alt = (twinNow.body.twin?.versions ?? []).find((v) => v.branch_id === 'alt-30-day-delay' && v.state === 'admitted')?.version ?? null;
if (alt === null) {
  const draft = (twinNow.body.twin?.versions ?? []).find((v) => v.branch_id === 'alt-30-day-delay' && v.state === 'draft')?.version ?? null;
  const o = draft !== null ? { ok: true, body: { version: { version: draft } } }
    : await call(`${W}/${TW}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'alt-30-day-delay', forkedFromVersion: v1, knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: v1, except: ['shock.corridor_delay_days'] }, twinOwner.token);
  alt = o.body.version?.version ?? null;
  if (alt !== null) {
    await call(`${W}/${TW}/versions/${alt}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { elements: [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 30, unit: 'days', citations: cite(records.terms) }] }, twinOwner.token);
    const a = await call(`${W}/${TW}/versions/${alt}/admit`, tw({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), {}, twinOwner.token);
    if (a.ok) ok(`branch alt-30-day-delay: version ${alt} forked from ${v1}, carries everything but the corridor delay (now 30 days); state set ${a.body.admitted.stateSetDigest.slice(0, 16)}…`); else bad(`alternative version refused (${a.status}) ${a.body?.message ?? ''}`);
  }
}
if (alt !== null) {
  const r = await call(`${W}/simulations/run`, sm({ action: 'simulation.run', objectType: 'SIM' }), { twinId: TW, twinVersion: alt, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } }, twinOwner.token);
  if (r.ok) ok(`control on the alternative branch: ${r.body.run.totals.line_stop_days} line-stop day(s), €${r.body.run.totals.cost.total} — a different contract, a different digest ${r.body.run.outputsDigest.slice(0, 16)}… (the two branches coexist; neither overwrote the other)`);
  const c2 = await call(`${W}/${TW}/compare`, tw({ action: 'twin.read', objectType: 'TWN', objectId: TW, sideEffect: 'none' }), { a: v1, b: alt }, twinOwner.token);
  if (c2.ok) ok(`versions ${v1} and ${alt} differ in exactly: ${c2.body.comparison.differing.map((d) => d.key).join(', ')}`);
  const bad1 = await call(`${W}/simulations/compare`, sm({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { runIds: [control.runId, r.body?.run?.runId].filter(Boolean) }, twinOwner.token);
  if (!bad1.ok) ok(`comparing runs on different initial states is refused (${bad1.status})`); else bad('runs on different twin versions were compared');
}

/* ── 8. the correction reaches the twin — through the operator ───────────── */
console.log('\n8. the publisher restates a corridor day — pending until the strategy owner runs the walk');
const transits = (twinNow.body.twin?.versions ?? []).find((v) => v.version === v1)?.elements?.find((e) => e.key === 'series.transits:chokepoint4');
const evd = transits?.citations?.[transits.citations.length - 1]?.id;
const alreadyWalked = (twinNow.body.twin?.versions ?? []).find((v) => v.version === v1)?.verification_state === 'unverified';
if (evd === undefined) bad('the transits element cites no evidence');
else if (alreadyWalked) ok(`version ${v1} is already UNVERIFIED from an earlier pass's walk — a restatement is an event, not a fixture, so this pass does not stage another`);
else {
  const opened = await call(`${O}/corrections/submit`, op({ action: 'observation.correction.receive', objectType: 'COR' }), {
    sourceId: portwatch.source_id, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'PortWatch chokepoints @ restated transit count (act V)',
    reason: 'the publisher restated a day of the corridor series the twin is grounded on', affectedEvdIds: [evd] }, operator.token);
  if (!opened.ok) bad(`correction refused (${opened.status}) ${opened.body?.message ?? ''}`);
  else {
    const caseId = opened.body.correction.caseId;
    const applied = await call(`${O}/corrections/${caseId}/apply`, cm({ action: 'observation.correction.apply', objectType: 'COR', objectId: caseId }),
      { decision: 'apply', affectedEvdIds: [evd], reason: 'restatement verified against the publisher' }, collectionManager.token);
    if (!applied.ok) bad(`apply refused (${applied.status}) ${applied.body?.message ?? ''}`);
    else {
      const before = await call(`${W}/${TW}/get`, tw({ action: 'twin.read', objectType: 'TWN', objectId: TW, sideEffect: 'none' }), {}, twinOwner.token);
      const pending = (before.body.twin?.propagation_pending ?? []).some((c) => c.case_id === caseId);
      const stillVerified = before.body.twin?.versions?.find((v) => v.version === v1)?.verification_state === 'verified';
      if (pending && stillVerified) ok(`case ${caseId.slice(0, 8)}… applied: the twin shows PROPAGATION PENDING and version ${v1} is still verified — nothing moved by itself (the CorrectionApplied consumer stays deferred)`);
      else bad(`pending=${pending} verified=${stillVerified} before any walk`);
      const prop = await call(`${G}/impact/propagate`, so({ action: 'graph.impact.propagate', objectType: 'INV', objectId: evd }),
        { triggerObjectId: evd, triggerKind: 'evidence_correction', correctionCaseId: caseId }, strategyOwner.token);
      if (!prop.ok) bad(`propagation refused (${prop.status}) ${prop.body?.message ?? ''}`);
      else {
        const p = prop.body.impact;
        ok(`the strategy owner ran the walk — ${p.statement}`);
        const after = await call(`${W}/${TW}/get`, tw({ action: 'twin.read', objectType: 'TWN', objectId: TW, sideEffect: 'none' }), {}, twinOwner.token);
        const v = after.body.twin?.versions?.find((x) => x.version === v1);
        if (v?.verification_state === 'unverified') ok(`version ${v1} is UNVERIFIED by event; ${(p.simulations ?? []).length} run(s) built on it surfaced; the alternative branch (which cites the same evidence) ${after.body.twin?.versions?.find((x) => x.version === alt)?.verification_state}`);
        else bad(`version ${v1} is ${v?.verification_state} after the walk`);
      }
    }
  }
}

console.log('\n9. what this act does not say: no option is recommended and nothing is decided — that is Phase 6.');
console.log(`\n=== act V complete — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
