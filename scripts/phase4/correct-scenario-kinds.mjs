#!/usr/bin/env node
/**
 * CP-6 batch B3, corrected on the demonstration (NORDWERK, eye_demo): the eight-kind tree declared
 * by declare-scenario-kinds.mjs gave the UPSIDE branch the same below-threshold indicator as the
 * downside, so a "recovery" would have flipped on a collapse. That declaration is PRESERVED as
 * declared; this act declares the corrected tree beside it, with recovery and deterioration on
 * their own conditions (migration 0059: an indicator observes from a declared day):
 *
 *   deterioration — transits below 41 per day for five consecutive published days, observed from
 *                   2023-12-01 (the winter the strait was attacked); the downside, disruption,
 *                   stress, adversarial, counterfactual and blockade branches flip on it;
 *   recovery      — transits back above 50 per day for five consecutive published days, observed
 *                   from 2024-01-18 (the day after the recorded collapse); the upside flips on it.
 *
 * Then both indicators are evaluated against everything the record knows today and the branch and
 * warning outcomes are verified: the deterioration flips its six branches and raises one warning
 * each and leaves the upside OPEN; the recovery flips the upside only if the record holds five
 * consecutive published days above 50 after the collapse — and says so either way. Nothing is
 * purchased, collected or changed in any contract, cadence or budget. Idempotent on the tree.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from './governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const forecastOwner = await login('n.eriksen', env.EYE_TEST_ADMIN_PASSWORD);
if (forecastOwner === null) { console.error('the forecast owner could not authenticate'); process.exit(1); }
const P = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/prediction`;
const fo = (over) => as(forecastOwner, scope, { purposeId: 'prediction', ...over });
const EARLIER = 'Bab el-Mandeb over the next quarter — every scenario kind (vocabulary v1)';
const TITLE = 'Bab el-Mandeb over the next quarter — every scenario kind, recovery and deterioration on their own conditions (vocabulary v1)';
const SERIES = 'portwatch:chokepoint4:n_total';
const DETERIORATION_FROM = '2023-12-01';
const RECOVERY_FROM = '2024-01-18';
const owner = forecastOwner.principalId;

console.log('\n=== CP-6 batch B3, corrected · recovery and deterioration on their own conditions ===\n');

/* ── 0. the earlier declaration is preserved ─────────────────────────────── */
const scenarios = await call(`${P}/scenarios/list`, fo({ action: 'prediction.read', objectType: 'SCN', sideEffect: 'none' }), {}, forecastOwner.token);
const earlier = (scenarios.body.scenarios ?? []).find((s) => s.title === EARLIER);
if (earlier === undefined) bad('the earlier eight-kind declaration is not on the demonstration; run declare-scenario-kinds.mjs first');
else {
  const e = await call(`${P}/scenarios/${earlier.scenario_id}/get`, fo({ action: 'prediction.read', objectType: 'SCN', objectId: earlier.scenario_id, sideEffect: 'none' }), {}, forecastOwner.token);
  const br = e.body.scenario?.branches ?? [];
  const up = br.find((b) => b.kind === 'upside'); const down = br.find((b) => b.kind === 'downside');
  ok(`earlier declaration preserved (${earlier.scenario_id.slice(0, 8)}…, ${br.length} branches, states ${br.map((b) => b.state).join('/')})`);
  if (up?.indicator_id !== undefined && up.indicator_id === down?.indicator_id) note(`its upside and downside share indicator ${String(up.indicator_id).slice(0, 8)}… — the defect this act corrects beside it, not by rewriting it`);
}

/* ── 1. the two conditions ───────────────────────────────────────────────── */
const listed = await call(`${P}/indicators/list`, fo({ action: 'prediction.read', objectType: 'IND', sideEffect: 'none' }), {}, forecastOwner.token);
const inds = listed.body.indicators ?? [];
async function ensureIndicator(description, comparator, threshold, observesFrom) {
  const found = inds.find((i) => i.series_key === SERIES && i.description === description);
  if (found !== undefined) { ok(`indicator present: ${description} (${found.indicator_id.slice(0, 8)}…, observes from ${found.observes_from ?? 'the first observation'})`); return found.indicator_id; }
  const r = await call(`${P}/indicators/define`, fo({ action: 'prediction.indicator.define', objectType: 'IND' }),
    { seriesKey: SERIES, description, comparator, threshold, consecutiveDays: 5, owner, observesFrom }, forecastOwner.token);
  if (!r.ok) { bad(`indicator refused (${r.status}) ${r.body?.message ?? ''}`); return null; }
  ok(`indicator defined: ${description} (${r.body.indicator.indicatorId.slice(0, 8)}…), observing from ${observesFrom}`);
  return r.body.indicator.indicatorId;
}
const deterioration = await ensureIndicator(`Bab el-Mandeb Strait transits below 41 per day for five consecutive published days, observed from ${DETERIORATION_FROM}`, '<', 41, DETERIORATION_FROM);
const recovery = await ensureIndicator(`Bab el-Mandeb Strait transits back above 50 per day for five consecutive published days after the collapse, observed from ${RECOVERY_FROM}`, '>', 50, RECOVERY_FROM);
if (deterioration === null || recovery === null) process.exit(1);

/* ── 2. the corrected tree ───────────────────────────────────────────────── */
let tree = (scenarios.body.scenarios ?? []).find((s) => s.title === TITLE);
if (tree !== undefined) ok(`corrected tree already declared (${tree.scenario_id.slice(0, 8)}…)`);
else {
  const onDeterioration = (name, kind, divergence, assumptions, extra = {}) => ({
    name, kind, statement: `${name}: transits stay below 41/day for five consecutive published days`,
    indicatorId: deterioration, signpost: 'five consecutive published observations under 41 transits/day', owner, reviewCadence: 'weekly',
    responseWindowHours: 48, consequence: 'rebook shipment SYN-SHIP-4468 via the Cape before the booking deadline closes',
    divergence, assumptions, ...extra,
  });
  const r = await call(`${P}/scenarios/declare`, fo({ action: 'prediction.scenario.declare', objectType: 'SCN' }), {
    title: TITLE,
    statement: `what we expect the strait to do, and every kind of departure from it — the tree of "${EARLIER}" corrected so that a recovery is judged on its own condition after the collapse, not on the collapse itself`,
    forecastId: null, subjectEntityId: null, owner, reviewCadence: 'weekly',
    branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'transits hold near their seasonal level; the third shipment sails as booked',
        owner, reviewCadence: 'weekly', responseWindowHours: 72, consequence: 'keep the booked routing',
        assumptions: [{ statement: 'the strait stays open to commercial traffic', basis: 'no closure notice on file' }] },
      { name: 'Upside', kind: 'upside', statement: 'Upside: transits back above 50/day for five consecutive published days after the collapse',
        indicatorId: recovery, signpost: `five consecutive published observations above 50 transits/day from ${RECOVERY_FROM}`, owner, reviewCadence: 'weekly',
        responseWindowHours: 72, consequence: 'return the rerouted shipments to the strait as bookings allow', divergence: null,
        assumptions: [{ statement: 'transits recover above the seasonal level once the disruption has ended', basis: 'carrier advisories' }] },
      onDeterioration('Downside', 'downside', null, [{ statement: 'transits fall and stay below the threshold' }]),
      onDeterioration('Disruption', 'disruption', 'a sudden closure of the strait interrupts every booked transit at once, unlike the gradual decline of the downside branch',
        [{ statement: 'a closure lasts at least a week', basis: 'historical closures' }]),
      onDeterioration('Stress', 'stress', 'the strait and the Cape route degrade together, so rerouting buys no time — the compound case the downside branch does not cover',
        [{ statement: 'two corridors degrade in the same fortnight', basis: 'stress design' }]),
      onDeterioration('Adversarial', 'adversarial', 'capacity is withheld deliberately by a counterparty rather than lost to conditions, so published transit counts understate what is available to us',
        [{ statement: 'a counterparty prioritises other shippers', basis: 'contract terms under review' }]),
      onDeterioration('Counterfactual', 'counterfactual', 'the third shipment had been rebooked in October: what the corridor collapse would have cost us then, for the post-mortem',
        [{ statement: 'the October rebooking was available at the published rate' }]),
      onDeterioration('Blockade', 'user-defined', 'naval activity halts transits outright and insurers withdraw cover, which no listed kind names', [
        { statement: 'naval activity halts transits', basis: 'analyst package' }, { statement: 'insurers withdraw cover for the strait' },
      ], { kindLabel: 'regional blockade' }),
    ],
  }, forecastOwner.token);
  if (!r.ok) { bad(`scenario refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); process.exit(1); }
  tree = { scenario_id: r.body.scenario.scenarioId };
  ok(`corrected tree declared (${tree.scenario_id.slice(0, 8)}…) with ${r.body.scenario.branches.length} branches`);
}
const T = tree.scenario_id;

/* ── 3. evaluate both conditions against everything the record knows today ─ */
const branchesNow = async () => {
  const g = await call(`${P}/scenarios/${T}/get`, fo({ action: 'prediction.read', objectType: 'SCN', objectId: T, sideEffect: 'none' }), {}, forecastOwner.token);
  return g.body.scenario?.branches ?? [];
};
const evaluate = async (id, label) => {
  const t0 = Date.now();
  const r = await call(`${P}/indicators/${id}/evaluate`, fo({ action: 'prediction.indicator.evaluate', objectType: 'IND', objectId: id }), { knownAt: new Date().toISOString() }, forecastOwner.token);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) { bad(`${label}: evaluation refused (${r.status}) ${r.body?.message ?? ''}`); return null; }
  const ev = r.body.evaluation;
  note(`${label}: ${ev.evaluated} observation(s) evaluated in ${s}s; breached=${ev.breached}, streak=${ev.streak}; ${ev.flips.length} flip(s), ${r.body.warnings.length} warning(s)`);
  return r.body;
};
const kindOf = (branches, id) => branches.find((b) => b.branch_id === id)?.kind ?? '?';

console.log('\n3. the deterioration condition');
const before = await branchesNow();
const d = await evaluate(deterioration, 'deterioration');
if (d !== null) {
  const after = await branchesNow();
  const flippedKinds = d.evaluation.flips.map((f) => kindOf(after, f.branchId)).sort();
  const upside = after.find((b) => b.kind === 'upside');
  if (upside?.state === 'open') ok('the upside branch stays OPEN on the deterioration condition (it does not share it)');
  else bad(`the upside branch is ${upside?.state} after the deterioration evaluation`);
  const deteriorated = after.filter((b) => b.indicator_id === deterioration);
  const flipped = deteriorated.filter((b) => b.state === 'flipped');
  if (flipped.length === deteriorated.length && deteriorated.length === 6) ok(`the six deterioration branches are flipped: ${deteriorated.map((b) => b.kind).join(', ')}`);
  else if (d.evaluation.breached) bad(`${flipped.length}/${deteriorated.length} deterioration branches flipped`);
  else note(`the deterioration condition is not breached on the record (${flipped.length}/${deteriorated.length} flipped); the branches stay open`);
  if (d.evaluation.flips.length > 0) {
    const f = d.evaluation.flips[0];
    note(`flipped on observation ${f.observationAt} (value ${f.value}); kinds flipped this evaluation: ${flippedKinds.join(', ')}`);
    if (d.warnings.length === d.evaluation.flips.length) ok(`one warning raised per flip (${d.warnings.length}), each routed to a named principal`);
    else bad(`${d.warnings.length} warning(s) for ${d.evaluation.flips.length} flip(s)`);
  }
  void before;
}

console.log('\n4. the recovery condition');
const r = await evaluate(recovery, 'recovery');
if (r !== null) {
  const after = await branchesNow();
  const upside = after.find((b) => b.kind === 'upside');
  if (r.evaluation.flips.length > 0) {
    const f = r.evaluation.flips[0];
    if (upside?.state === 'flipped' && r.warnings.length === 1) ok(`recovery observed: five consecutive published days above 50 ending ${f.observationAt} (value ${f.value}); the upside branch flipped and its warning was raised`);
    else bad(`recovery flipped but the upside is ${upside?.state} with ${r.warnings.length} warning(s)`);
  } else {
    if (upside?.state === 'open') ok(`no recovery on the record: no five consecutive published days above 50 since ${RECOVERY_FROM} (${r.evaluation.evaluated} observations judged, streak ${r.evaluation.streak}); the upside branch stays OPEN`);
    else bad(`the upside branch is ${upside?.state} without a recovery flip`);
  }
  const others = after.filter((b) => b.kind !== 'upside' && b.kind !== 'baseline');
  if (others.every((b) => b.indicator_id === deterioration)) ok('every other non-baseline branch watches the deterioration condition, not the recovery');
}

/* ── 5. what the scenario view shows ─────────────────────────────────────── */
console.log('\n5. the scenario view');
const final = await branchesNow();
const ud = final.find((b) => b.kind === 'user-defined');
if (ud?.kind_label === 'regional blockade' && Array.isArray(ud.assumptions) && ud.assumptions.length === 2 && typeof ud.divergence === 'string') {
  ok(`the user-defined branch reads back with kind_label "${ud.kind_label}", its divergence and ${ud.assumptions.length} assumptions (vocabulary v${ud.kind_vocabulary_version})`);
} else bad(`the user-defined branch does not expose label/divergence/assumptions: ${JSON.stringify(ud).slice(0, 200)}`);
const withAssumptions = final.filter((b) => Array.isArray(b.assumptions) && b.assumptions.length > 0).length;
note(`${withAssumptions}/${final.length} branches carry assumptions; kinds: ${final.map((b) => b.kind).sort().join(', ')}`);
const indsAfter = await call(`${P}/indicators/list`, fo({ action: 'prediction.read', objectType: 'IND', sideEffect: 'none' }), {}, forecastOwner.token);
for (const id of [deterioration, recovery]) {
  const i = (indsAfter.body.indicators ?? []).find((x) => x.indicator_id === id);
  note(`indicator ${id.slice(0, 8)}…: ${i?.comparator} ${i?.threshold} × ${i?.consecutive_days}, observes from ${i?.observes_from}, last observation ${i?.last_observation_at ?? '—'} (value ${i?.last_value ?? '—'}), breached=${i?.breached}`);
}
process.exit(failureCount() === 0 ? 0 : 1);
