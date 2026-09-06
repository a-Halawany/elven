/**
 * The corridor demonstration, ACT IV — "what happens next, and how wrong have
 * we been?"
 *
 * Phase 3 ended with a memory that knows when the world changed under it. This
 * act asks it what it expects, what would change that, and how honest its
 * record is. Every step is a request an operator could make, through the same
 * governed API; there is no back door.
 *
 *   1. register two SERIES: the ECB rate collected live in P4-M0b, and the
 *      Bab el-Mandeb transit count from the frozen PortWatch replay
 *   2. BACKTEST both at 30 days — the learned model against seasonal naive on
 *      identical origins — in both knowledge modes: RETROSPECTIVE (one vintage
 *      cut by publisher date) and HISTORICAL (each origin sees only what was
 *      recorded by its own day, which a backfilled vintage cannot satisfy)
 *   3. ISSUE forecasts: ECB as `live` on 27 years of history; the corridor as a
 *      REPLAY DEMONSTRATION whose quality CANNOT be validated, and which says so
 *   4. declare a SCENARIO TREE on the corridor forecast with a downside branch
 *      whose indicator is "transits below 40/day for five consecutive
 *      observations", owned by a named person with a 48-hour response window
 *   5. EVALUATE the indicator over the replayed January collapse in REPLAY
 *      timing: the branch FLIPS with a receipt, a WARNING is raised AS OF the
 *      breaching observation against the declared decision deadline, the owner
 *      acknowledges it
 *   6. the publisher CORRECTS evidence the corridor forecast rests on: Phase 3's
 *      propagation reaches the forecast and marks it for attention
 *   7. the CALIBRATION screen reports what it can and cannot say
 *
 * Idempotent: re-running reuses what it finds.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from './governed.mjs';
import { ECB_ATTRIBUTION } from './ecb-contract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

console.log('\n=== Act IV — what happens next, and how wrong have we been? ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const P = `/v1/tenants/${T}/domains/${D}/prediction`;
const G = `/v1/tenants/${T}/domains/${D}/graph`;
const O = `/v1/tenants/${T}/domains/${D}/observation`;

/* ── 0. operators ────────────────────────────────────────────────────────── */
console.log('0. operators');
const principals = await call(`/v1/tenants/${T}/principals/list`, {
  scope: 'TENANT', tenantId: T, action: 'identity.principal.list', objectType: 'PRN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
}, {}, admin.token);
const existing = principals.ok ? (principals.body.principals ?? []) : [];
async function ensureOperator(loginName, displayName, roleCode) {
  const found = existing.find((p) => p.login_name === loginName);
  if (found !== undefined) { ok(`${displayName} present (${roleCode})`); return found.id; }
  const r = await call(`/v1/tenants/${T}/principals`, {
    scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, { kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD, roleCode, domainId: D }, admin.token);
  if (r.ok) { ok(`${displayName} created (${roleCode})`); return r.body.principal?.principalId; }
  if (r.status === 409) { ok(`${displayName} present (${roleCode}; the login below confirms it)`); return null; }
  bad(`could not create ${displayName}: ${r.status} ${r.body?.message ?? ''}`); return null;
}
await ensureOperator('n.eriksen', 'N. Eriksen — forecast owner', 'forecast_owner');
const forecastOwner = await login('n.eriksen', OPERATOR_PASSWORD);
const strategyOwner = await login('j.weber', OPERATOR_PASSWORD);
const collectionManager = await login('m.dvorak', OPERATOR_PASSWORD);
const operator = await login('a.hoffmann', OPERATOR_PASSWORD);
if (!forecastOwner || !strategyOwner || !collectionManager || !operator) { console.error('operator authentication failed'); process.exit(1); }
const fo = (over) => as(forecastOwner, scope, { purposeId: 'prediction', ...over });
const so = (over) => as(strategyOwner, scope, { purposeId: 'graph', ...over });
const cm = (over) => as(collectionManager, scope, { purposeId: 'observation', ...over });
const op = (over) => as(operator, scope, { purposeId: 'observation', ...over });
note(`forecast owner n.eriksen ${forecastOwner.principalId.slice(0, 8)}…`);

/* ── 1. the series ───────────────────────────────────────────────────────── */
console.log('\n1. the series — a number read out of evidence by a named, deterministic parser');
const entities = await call(`${G}/entities/list`, so({ action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), { limit: 500 }, strategyOwner.token);
const places = (entities.body.entities ?? []).filter((e) => e.entity_type === 'place');
const listed = await call(`${P}/series/list`, fo({ action: 'prediction.read', objectType: 'SER', sideEffect: 'none' }), {}, forecastOwner.token);
const have = new Set((listed.body.series ?? []).map((s) => s.series_key));
/*
 * THE THREE CHOKEPOINTS THE FROZEN REPLAY SET COVERS. Which one carries the
 * demonstration is chosen from the data below — the deepest collapse — not
 * named in advance, for the same reason act III chose its entity that way.
 */
const CHOKEPOINTS = [
  { portid: 'chokepoint1', name: 'Suez Canal' },
  { portid: 'chokepoint4', name: 'Bab el-Mandeb Strait' },
  { portid: 'chokepoint7', name: 'Cape of Good Hope' },
];
const SERIES = [
  { seriesKey: 'ecb-eurusd', sourceKey: 'ecb-eurusd', parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', selector: null,
    unit: 'USD per EUR', seasonalityDays: 1, subjectEntityId: null, attribution: ECB_ATTRIBUTION,
    description: 'ECB euro foreign exchange reference rate against the US dollar, daily (TARGET business days)',
    // The publisher's calendar as attested: business days. TARGET closing days are NOT listed here, so an
    // outcome whose target falls on one stays unscored until the closure is attested — no guessing.
    publicationCalendar: { rule: 'business-days', closures: [],
      authority: 'ECB: euro foreign exchange reference rates are published on TARGET business days only' } },
  ...CHOKEPOINTS.map((c) => ({
    seriesKey: `portwatch:${c.portid}:n_total`, sourceKey: 'imf-portwatch-chokepoints', parserRef: 'arcgis-feature-attribute@1',
    valueField: 'n_total', selector: c.portid, unit: 'transits/day', seasonalityDays: 7,
    subjectEntityId: places.find((e) => e.canonical_name === c.name)?.entity_id ?? null,
    attribution: 'Source: IMF PortWatch (IMF / Oxford). Replay set; collection rights pending.',
    description: `daily vessel transits through the ${c.name}, from the frozen PortWatch replay set` })),
];
for (const s of SERIES) {
  if (have.has(s.seriesKey)) { ok(`${s.seriesKey} already registered`); continue; }
  const r = await call(`${P}/series/register`, fo({ action: 'prediction.series.register', objectType: 'SER' }), s, forecastOwner.token);
  if (r.ok) ok(`${s.seriesKey} registered (${s.parserRef})`); else bad(`${s.seriesKey} refused (${r.status}) ${r.body?.message ?? ''}`);
}
const seriesPoints = {};
for (const s of SERIES) {
  const pts = await call(`${P}/series/${encodeURIComponent(s.seriesKey)}/points`, fo({ action: 'prediction.read', objectType: 'SER', sideEffect: 'none' }), { limit: 5000 }, forecastOwner.token);
  if (pts.ok) {
    const p = pts.body; seriesPoints[s.seriesKey] = p.points;
    ok(`${s.seriesKey}: ${p.total} observation(s) from ${p.evidence} evidence version(s)${p.points.length ? `, last ${p.points[p.points.length - 1].date} = ${p.points[p.points.length - 1].value} ${p.unit}` : ''}`);
    if (p.note) note(p.note);
  } else bad(`${s.seriesKey} could not be read (${pts.status}) ${pts.body?.message ?? ''}`);
}
// The corridor for the demonstration: the chokepoint whose replay shows the deepest drawdown against its median.
function median(xs) { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; }
const corridorPick = CHOKEPOINTS.map((c) => {
  const pts = seriesPoints[`portwatch:${c.portid}:n_total`] ?? [];
  const med = median(pts.map((p) => p.value)); const min = Math.min(...pts.map((p) => p.value));
  return { ...c, med, min, drawdown: med === 0 ? 0 : 1 - min / med, n: pts.length };
}).sort((a, b) => b.drawdown - a.drawdown)[0];
if (corridorPick === undefined || corridorPick.n === 0) { bad('no PortWatch series could be read — run the Phase 1 seed first'); process.exit(1); }
const CORRIDOR_SERIES = `portwatch:${corridorPick.portid}:n_total`;
const threshold = Math.round(0.75 * corridorPick.med);
const corridor = places.find((e) => e.canonical_name === corridorPick.name) ?? places[0];
ok(`the corridor: ${corridorPick.name} — median ${corridorPick.med}, minimum ${corridorPick.min} (${(corridorPick.drawdown * 100).toFixed(0)}% drawdown); indicator threshold ${threshold}`);
if (corridor === undefined) { bad('no place entity from act III — run scripts/phase3/seed-graph.mjs first'); process.exit(1); }

/* ── 2. backtests ────────────────────────────────────────────────────────── */
console.log('\n2. backtests at 30 days — the learned model against seasonal naive, on identical origins, in both knowledge modes');
const verdicts = {};
for (const s of SERIES) {
  for (const mode of ['retrospective', 'historical']) {
    const r = await call(`${P}/backtests/run`, fo({ action: 'prediction.backtest.record', objectType: 'BKT' }),
      { seriesKey: s.seriesKey, horizon: '30d', origins: 40, mode }, forecastOwner.token);
    if (!r.ok) { bad(`${mode} backtest refused for ${s.seriesKey} (${r.status}) ${r.body?.message ?? ''}`); continue; }
    const b = r.body.backtest;
    verdicts[`${s.seriesKey}:${mode}`] = b;
    ok(`${s.seriesKey} (${mode}): ${b.verdict}`);
    if (b.t1_met !== null) note(`coverage ${(b.coverage_80 * 100).toFixed(1)}% (naive ${(b.baseline_coverage_80 * 100).toFixed(1)}%) · pinball ${b.pinball_mean} vs ${b.baseline_pinball_mean} · skill ${(b.skill_vs_baseline * 100).toFixed(1)}%`);
    if (mode === 'historical' && b.t2_met !== null) bad('a historical backtest validated on a vintage recorded after every origin');
  }
}

/* ── 3. forecasts ────────────────────────────────────────────────────────── */
console.log('\n3. forecasts — distribution, drivers, assumptions and evidence, or refused');
const strategy = await call(`${G}/strategy/list`, so({ action: 'graph.read', objectType: 'OBJ', sideEffect: 'none' }), { limit: 300 }, strategyOwner.token);
const rows = strategy.body.strategy ?? [];
const corridorAsu = rows.find((x) => x.object_type === 'ASU' && /corridor/i.test(x.title));
let fxAsu = rows.find((x) => x.object_type === 'ASU' && /EUR\/USD/i.test(x.title));
if (fxAsu === undefined) {
  const r = await call(`${G}/strategy/declare`, so({ action: 'graph.strategy.declare', objectType: 'ASU' }), {
    objectType: 'ASU', title: 'EUR/USD stays within its recent regime',
    statement: 'the euro reference rate against the dollar does not leave the range of the last two years before the third shipment is paid',
    status: 'active', restsOn: [{ kind: 'entity', id: corridor.entity_id, rationale: 'the cost exposure of the corridor routing is settled in dollars' }],
  }, strategyOwner.token);
  if (r.ok) { fxAsu = { strategy_object_id: r.body.strategy.objectId }; ok('assumption "EUR/USD stays within its recent regime" declared by j.weber'); }
  else bad(`assumption refused (${r.status}) ${r.body?.message ?? ''}`);
}
if (corridorAsu === undefined) bad('no corridor assumption from act III — run scripts/phase3/seed-graph.mjs first');

const refusedNoAssumption = await call(`${P}/forecasts/issue`, fo({ action: 'prediction.forecast.issue', objectType: 'FCT' }),
  { seriesKey: 'ecb-eurusd', horizon: '30d', assumptions: [], label: 'live' }, forecastOwner.token);
if (!refusedNoAssumption.ok) ok(`a forecast that rests on nothing is refused (${refusedNoAssumption.status})`); else bad('a forecast resting on nothing was admitted');

const issued = {};
if (fxAsu) {
  const r = await call(`${P}/forecasts/issue`, fo({ action: 'prediction.forecast.issue', objectType: 'FCT' }),
    { seriesKey: 'ecb-eurusd', horizon: '30d', assumptions: [fxAsu.strategy_object_id], refreshCadence: 'daily', label: 'live' }, forecastOwner.token);
  if (r.ok) { issued.ecb = r.body.forecast; ok(`ECB 30d [${r.body.forecast.validationState}] ${r.body.forecast.statement}`); }
  else bad(`ECB forecast refused (${r.status}) ${r.body?.message ?? ''}`);
  if (r.ok && r.body.forecast.validationState === 'validated') bad('a forecast on a backfilled vintage was presented as validated under historical knowledge');
}
if (corridorAsu) {
  // The corridor forecast is issued AS OF the eve of the collapse, from what was published up to 2024-01-11.
  const r = await call(`${P}/forecasts/issue`, fo({ action: 'prediction.forecast.issue', objectType: 'FCT' }),
    { seriesKey: CORRIDOR_SERIES, horizon: '30d', observedThrough: '2024-01-11',
      assumptions: [corridorAsu.strategy_object_id], refreshCadence: 'daily', label: 'replay demonstration' }, forecastOwner.token);
  if (r.ok) { issued.corridor = r.body.forecast; ok(`corridor 30d [${r.body.forecast.validationState}] ${r.body.forecast.statement}`); }
  else bad(`corridor forecast refused (${r.status}) ${r.body?.message ?? ''}`);
  if (r.ok && r.body.forecast.validationState !== 'validation_impossible') bad('a 20-observation replay series was presented as validatable');
}
const hindsight = await call(`${P}/forecasts/list`, fo({ action: 'prediction.read', objectType: 'FCT', sideEffect: 'none' }),
  { knownAt: '2024-01-01T00:00:00Z' }, forecastOwner.token);
if (hindsight.ok && (hindsight.body.forecasts ?? []).length === 0) ok('as known on 2024-01-01, no forecast existed — the list has no hindsight');
else bad('a forecast issued today was visible to a reader positioned in the past');

/* ── 4. the scenario tree ────────────────────────────────────────────────── */
console.log('\n4. the scenario tree — a baseline, and the branch that would replace it');
const scenarios = await call(`${P}/scenarios/list`, fo({ action: 'prediction.read', objectType: 'SCN', sideEffect: 'none' }), {}, forecastOwner.token);
let scenario = (scenarios.body.scenarios ?? []).find((s) => s.title.startsWith(corridorPick.name));
let indicatorId = null;
if (scenario === undefined && issued.corridor) {
  const ind = await call(`${P}/indicators/define`, fo({ action: 'prediction.indicator.define', objectType: 'IND' }), {
    seriesKey: CORRIDOR_SERIES, description: `${corridorPick.name} transits below ${threshold} per day for five consecutive published observations`,
    comparator: '<', threshold, consecutiveDays: 5, owner: forecastOwner.principalId,
  }, forecastOwner.token);
  if (!ind.ok) { bad(`indicator refused (${ind.status}) ${ind.body?.message ?? ''}`); }
  else {
    indicatorId = ind.body.indicator.indicatorId;
    ok(`indicator defined: transits < ${threshold} for 5 consecutive observations (${indicatorId.slice(0, 8)}…)`);
    const r = await call(`${P}/scenarios/declare`, fo({ action: 'prediction.scenario.declare', objectType: 'SCN' }), {
      title: `${corridorPick.name} over the next 30 days`, statement: 'what we expect the corridor to do, and what would make us rebook',
      forecastId: issued.corridor.forecastId, subjectEntityId: corridor.entity_id, owner: forecastOwner.principalId, reviewCadence: 'weekly',
      branches: [
        { name: 'Baseline', kind: 'baseline', statement: 'transits hold near their seasonal level; the third shipment sails as booked',
          owner: forecastOwner.principalId, reviewCadence: 'weekly', responseWindowHours: 72, consequence: 'keep the booked routing' },
        { name: 'Corridor collapse', kind: 'downside', statement: `transits stay below ${threshold}/day for five consecutive published days`,
          indicatorId, signpost: `five consecutive published observations under ${threshold} transits/day`,
          owner: forecastOwner.principalId, reviewCadence: 'daily', responseWindowHours: 48,
          // The decision the warning serves: the booking deadline, set from the decision, not from the clock.
          decisionDeadline: '2024-01-22T00:00:00Z',
          consequence: 'rebook shipment SYN-SHIP-4468 via the Cape before the booking deadline closes' },
      ],
    }, forecastOwner.token);
    if (r.ok) { scenario = r.body.scenario; ok(`scenario declared with ${r.body.scenario.branches.length} branches (${r.body.scenario.scenarioId.slice(0, 8)}…)`); }
    else bad(`scenario refused (${r.status}) ${r.body?.message ?? ''}`);
  }
} else if (scenario !== undefined) {
  ok(`scenario "${scenario.title}" already declared`);
  indicatorId = (scenario.branches ?? []).find((b) => b.kind === 'downside')?.indicator_id ?? null;
}

/* ── 5. the collapse, replayed ───────────────────────────────────────────── */
console.log('\n5. the January collapse, replayed — the branch flips, the warning is raised as of the breach, the owner answers');
if (indicatorId !== null) {
  const r = await call(`${P}/indicators/${indicatorId}/evaluate`, fo({ action: 'prediction.indicator.evaluate', objectType: 'IND', objectId: indicatorId }),
    { confidence: 0.85, timing: 'replay' }, forecastOwner.token);
  if (!r.ok) bad(`evaluation refused (${r.status}) ${r.body?.message ?? ''}`);
  else {
    const e = r.body.evaluation;
    ok(`${e.evaluated} observation(s) evaluated · streak ${e.streak} · ${e.flips.length} flip(s) · ${r.body.warnings.length} warning(s)`);
    for (const f of e.flips) note(`branch ${f.branchId.slice(0, 8)}… FLIPPED on ${f.observationAt} at ${f.value} transits — event ${f.flipEventId.slice(0, 8)}…`);
    for (const w of r.body.warnings) {
      note(`warning ${w.warningId.slice(0, 8)}… routed to ${w.routedTo.slice(0, 8)}… (n.eriksen), raised AS OF ${w.raisedAsOf} (${w.timingMode}), window closes ${w.closesAt}, ${w.timely === null ? 'T3 unmeasured' : w.timely ? 'before the decision deadline' : 'AFTER the decision deadline'}`);
      if (w.timingMode !== 'replay' || String(w.raisedAsOf).startsWith('202' + '6')) bad('a replayed warning was timed by the audit clock');
      // The response is AS OF a replay instant inside the window; the audit clock (2026) is recorded beside it.
      const ack = await call(`${P}/warnings/${w.warningId}/acknowledge`, fo({ action: 'prediction.warning.acknowledge', objectType: 'WRN', objectId: w.warningId }),
        { note: 'rebooked SYN-SHIP-4468 via the Cape of Good Hope; 11-day delay accepted over an unbounded one', asOf: '2024-01-18T09:00:00Z' }, forecastOwner.token);
      if (!ack.ok) bad(`acknowledgement refused (${ack.status}) ${ack.body?.message ?? ''}`);
      else if (ack.body.warning.state !== 'acknowledged') bad(`the replayed response was recorded as ${ack.body.warning.state}`);
      else ok('acknowledged as of 2024-01-18 — inside the replay window; response timely, recorded on the audit clock');
    }
    if (e.flips.length === 0 && e.evaluated > 0) bad('the replayed collapse did not flip the downside branch');
  }
  const warnings = await call(`${P}/warnings/list`, fo({ action: 'prediction.read', objectType: 'WRN', sideEffect: 'none' }), {}, forecastOwner.token);
  const mine = (warnings.body.warnings ?? []).filter((w) => w.indicator_id === indicatorId);
  if (mine.length > 0) ok(`${mine.length} warning(s) on record for this indicator: ${mine.map((w) => w.state).join(', ')}`);
}

/* ── 6. the correction reaches the forecast ──────────────────────────────── */
console.log('\n6. the publisher corrects evidence the corridor forecast rests on');
if (issued.corridor) {
  const f = await call(`${P}/forecasts/${issued.corridor.forecastId}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: issued.corridor.forecastId, sideEffect: 'none' }), {}, forecastOwner.token);
  const evd = (f.body.forecast?.evidence_refs ?? [])[0]?.evidence_object_id;
  if (evd === undefined) bad('the forecast names no evidence');
  else {
    const sources = await call(`${O}/sources/list`, cm({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, collectionManager.token);
    const src = (sources.body.sources ?? []).find((s) => s.source_key === 'imf-portwatch-chokepoints');
    const opened = await call(`${O}/corrections/submit`, op({ action: 'observation.correction.receive', objectType: 'COR' }), {
      sourceId: src.source_id, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'PortWatch chokepoints @ restated transit count',
      reason: 'the publisher restated one day of the corridor series the forecast was fitted on', affectedEvdIds: [evd],
    }, operator.token);
    if (!opened.ok) bad(`correction refused (${opened.status}) ${opened.body?.message ?? ''}`);
    else {
      const caseId = opened.body.correction.caseId;
      const applied = await call(`${O}/corrections/${caseId}/apply`, cm({ action: 'observation.correction.apply', objectType: 'COR', objectId: caseId }),
        { decision: 'apply', affectedEvdIds: [evd], reason: 'restatement verified against the publisher' }, collectionManager.token);
      if (!applied.ok) bad(`apply refused (${applied.status}) ${applied.body?.message ?? ''}`);
      else {
        ok(`correction case ${caseId.slice(0, 8)}… applied: evidence ${evd.slice(0, 8)}… superseded`);
        const prop = await call(`${G}/impact/propagate`, so({ action: 'graph.impact.propagate', objectType: 'INV', objectId: evd }),
          { triggerObjectId: evd, triggerKind: 'evidence_correction', correctionCaseId: caseId }, strategyOwner.token);
        if (!prop.ok) bad(`propagation refused (${prop.status}) ${prop.body?.message ?? ''}`);
        else {
          const p = prop.body.impact;
          ok(`propagated — ${p.statement}`);
          const reached = (p.forecasts ?? []).map((x) => x.strategy_object_id);
          if (reached.includes(issued.corridor.forecastId)) ok('the corridor forecast was reached and marked for attention');
          else bad('the walk did not reach the forecast that rests on the corrected evidence');
          const after = await call(`${P}/forecasts/${issued.corridor.forecastId}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: issued.corridor.forecastId, sideEffect: 'none' }), {}, forecastOwner.token);
          const a = after.body.forecast;
          if (a?.attention_state === 'assumption_unverified') ok(`the forecast now says: ${a.attention_reason}`); else bad(`attention state is ${a?.attention_state}`);
        }
      }
    }
  }
}

/* ── 7. calibration ──────────────────────────────────────────────────────── */
console.log('\n7. calibration — what the record can say, and what it cannot yet');
const cal = await call(`${P}/calibration/summary`, fo({ action: 'prediction.read', objectType: 'OUT', sideEffect: 'none' }), {}, forecastOwner.token);
if (cal.ok) {
  const c = cal.body.calibration;
  ok(c.statement);
  for (const b of c.backtests) note(`${b.series_key} ${b.horizon_code}: ${b.verdict}`);
  if (c.outcomes.length !== 0) bad('an outcome was scored before any horizon elapsed');
} else bad(`calibration could not be read (${cal.status})`);
if (issued.corridor) {
  const r = await call(`${P}/outcomes/record`, fo({ action: 'prediction.outcome.record', objectType: 'OUT', objectId: issued.corridor.forecastId }),
    { forecastId: issued.corridor.forecastId }, forecastOwner.token);
  if (!r.ok) ok(`scoring the corridor forecast is refused until its target day is observed (${r.status}: ${(r.body?.message ?? '').slice(0, 90)})`);
  else bad('a forecast whose horizon has not elapsed was scored');
}

console.log(`\n=== act IV complete — ${failureCount()} problem(s) ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
