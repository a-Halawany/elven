#!/usr/bin/env node
/**
 * CP-6 batch B3 on the demonstration (NORDWERK, eye_demo): the forecast owner declares ONE scenario
 * tree that uses every kind of scenario kind vocabulary v1 (migration 0058) through the governed
 * route — baseline, upside, downside, disruption, stress, adversarial, counterfactual and a
 * user-defined "regional blockade" — each branch with its own assumptions, the non-baseline branches
 * on the existing Bab el-Mandeb transit indicator. Idempotent: a tree with this title is not declared
 * twice. Nothing is purchased, collected or changed in any contract, cadence or budget.
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
const TITLE = 'Bab el-Mandeb over the next quarter — every scenario kind (vocabulary v1)';

console.log('\n=== CP-6 batch B3 · the eight scenario kinds on the demonstration ===\n');
const existing = await call(`${P}/scenarios/list`, fo({ action: 'prediction.read', objectType: 'SCN', sideEffect: 'none' }), {}, forecastOwner.token);
const already = (existing.body.scenarios ?? []).find((s) => s.title === TITLE);
if (already !== undefined) { ok(`scenario "${TITLE}" already declared (${already.scenario_id?.slice(0, 8) ?? '?'}…); nothing to do`); process.exit(0); }

const indicators = await call(`${P}/indicators/list`, fo({ action: 'prediction.read', objectType: 'IND', sideEffect: 'none' }), {}, forecastOwner.token);
const ind = (indicators.body.indicators ?? []).find((i) => String(i.series_key ?? '').startsWith('portwatch:chokepoint4'));
if (ind === undefined) { bad('no Bab el-Mandeb indicator on the demonstration; the Phase 4 seed defines it'); process.exit(1); }
const indicatorId = ind.indicator_id;
note(`indicator ${indicatorId.slice(0, 8)}…: ${ind.description}`);

const owner = forecastOwner.principalId;
const branch = (name, kind, divergence, assumptions, extra = {}) => ({
  name, kind, statement: `${name}: transits stay below the indicator's threshold for five consecutive published days`,
  indicatorId, signpost: 'five consecutive published observations under the threshold', owner, reviewCadence: 'weekly',
  responseWindowHours: 48, consequence: 'rebook shipment SYN-SHIP-4468 via the Cape before the booking deadline closes',
  divergence, assumptions, ...extra,
});
const r = await call(`${P}/scenarios/declare`, fo({ action: 'prediction.scenario.declare', objectType: 'SCN' }), {
  title: TITLE, statement: 'what we expect the strait to do, and every kind of departure from it that the product must be able to hold',
  forecastId: null, subjectEntityId: null, owner, reviewCadence: 'weekly',
  branches: [
    { name: 'Baseline', kind: 'baseline', statement: 'transits hold near their seasonal level; the third shipment sails as booked',
      owner, reviewCadence: 'weekly', responseWindowHours: 72, consequence: 'keep the booked routing',
      assumptions: [{ statement: 'the strait stays open to commercial traffic', basis: 'no closure notice on file' }] },
    branch('Upside', 'upside', null, [{ statement: 'transits recover above the seasonal level', basis: 'carrier advisories' }]),
    branch('Downside', 'downside', null, [{ statement: 'transits fall and stay below the threshold' }]),
    branch('Disruption', 'disruption', 'a sudden closure of the strait interrupts every booked transit at once, unlike the gradual decline of the downside branch',
      [{ statement: 'a closure lasts at least a week', basis: 'historical closures' }]),
    branch('Stress', 'stress', 'the strait and the Cape route degrade together, so rerouting buys no time — the compound case the downside branch does not cover',
      [{ statement: 'two corridors degrade in the same fortnight', basis: 'stress design' }]),
    branch('Adversarial', 'adversarial', 'capacity is withheld deliberately by a counterparty rather than lost to conditions, so published transit counts understate what is available to us',
      [{ statement: 'a counterparty prioritises other shippers', basis: 'contract terms under review' }]),
    branch('Counterfactual', 'counterfactual', 'the third shipment had been rebooked in October: what the corridor collapse would have cost us then, for the post-mortem',
      [{ statement: 'the October rebooking was available at the published rate' }]),
    branch('Blockade', 'user-defined', 'naval activity halts transits outright and insurers withdraw cover, which no listed kind names', [
      { statement: 'naval activity halts transits', basis: 'analyst package' }, { statement: 'insurers withdraw cover for the strait' },
    ], { kindLabel: 'regional blockade' }),
  ],
}, forecastOwner.token);
if (!r.ok) { bad(`scenario refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); process.exit(1); }
const kinds = r.body.scenario.branches.map((b) => b.kind).sort();
ok(`scenario declared (${r.body.scenario.scenarioId.slice(0, 8)}…) with ${r.body.scenario.branches.length} branches: ${kinds.join(', ')}`);
const back = await call(`${P}/scenarios/${r.body.scenario.scenarioId}/get`, fo({ action: 'prediction.read', objectType: 'SCN', objectId: r.body.scenario.scenarioId, sideEffect: 'none' }), {}, forecastOwner.token);
if (back.ok) {
  const ud = (back.body.scenario?.branches ?? back.body.branches ?? []).find((b) => b.kind === 'user-defined');
  note(`read back: user-defined branch kind_label = ${ud?.kind_label ?? '(not exposed on this read)'}; assumptions carried = ${(back.body.scenario?.branches ?? back.body.branches ?? []).every((b) => Array.isArray(b.assumptions)) ? 'yes' : 'not exposed on this read'}`);
}
process.exit(failureCount() === 0 ? 0 : 1);
