#!/usr/bin/env node
/**
 * CP-6 batch B21 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): FITNESS, COHERENCE
 * AND CHALLENGE (migration 0081) and THE COLD TIER UNREACHABLE (0081 §1.C, AU-MEM-0067's vault clause), exercised by the personas through
 * the REAL HTTP path, each scene stating the effect it produced in the ledgers and the outbox, and where nothing happened, saying so. EVERY
 * OBJECT IS LOOKED UP AT RUN TIME by SQL against the database the act is pointed at: no id is hard-coded.
 *
 *   0. THE STATE: the register through the route (40 bound / 10 partial / 0 unbound — L5-I05, L6-I03, L7-I04, L8-I04 bound in 0081; L9-I05's
 *      clause re-homed to B22); the seven subscriptions of the origin checked against this process's consumer digests — the FORECASTS,
 *      SCENARIOS and DECISIONS methods changed in B21 (C4), so those three are REVOKED and registered anew by the administrator with the same
 *      owner, each replacement REPLAYING FROM THE REVOKED CURSOR'S OWN EVENT (B20 C1; act-b20 scene 1), the four others LEFT ("already
 *      active"); the demo's honest defaults printed (twin versions fitness none, forecasts none, scenarios unchecked, runs envelope_state
 *      unrecorded).
 *   1. FITNESS (twin): T. Nakamura — the twin's owner — validates the supply-chain twin's admitted version → 403 (the separation of duties,
 *      verbatim); the administrator validates it FIT: the envelope keys the port computed printed, the calibration summary, ValidateTwin@v1
 *      from the outbox, NO GraphChanged; T. Nakamura opens a control run → twin_fitness fit, envelope_state inside on SimulationStarted.
 *      The outside-envelope run is NOT staged (the demo's elements lie inside; nothing is regrounded for a show — the harness T1.6 carries it).
 *   2. FITNESS (forecast): N. Eriksen assesses the corridor transit forecast (the newest issued of the PortWatch series, looked up) → the
 *      rule's verdict printed WITH the measures (outcomes n of 10 — the ledger is thin; the daily cadence's expiry — an issued forecast whose
 *      refresh cadence lapsed reads envelope_breach → unfit: a scheduler would have re-issued it; none exists, said); if unfit, the
 *      GraphChanged/forecast.fitness_changed and its deliveries printed; the act does NOT withdraw the forecast; the calibration page's live
 *      table read back.
 *   3. COHERENCE: J. Weber declares a scenario with a DUPLICATE downside branch (the demo's indicator, looked up) on a forecast that is not
 *      unfit (an unfit forecast REFUSES a declaration — printed when it happens; the fallback is a scenario without a forecast) → ADMITTED
 *      failed, the findings and routed_to printed, ScenarioCoherenceFailed@v1 from the outbox; T. Nakamura's run on its branch refused 409
 *      (verbatim); J. Weber retires it and declares the successor without the duplicate → passed; promote_to_simulation on the failed one
 *      is shown on the REHEARSAL copy only.
 *   4. CHALLENGE: J. Weber challenges the demo's newest completed valid intervention run (interpretation) → open; the administrator requests
 *      the re-run; T. Nakamura opens the re-run (correctsRunId, challengeId — the row's own contract copied) → compared on the common control;
 *      the administrator decides DISMISSED (the demo's run stays valid — never invalidated by the act); the administrator PROMOTES the
 *      run's control "fit for the NORDWERK corridor routing decision" → fit; THE UPHELD PATH on the rehearsal copy only (a second challenge
 *      upheld → the run invalidated with trigger challenge), printed REHEARSAL ONLY.
 *   5. THE COLD TIER UNREACHABLE: a cold NORDWERK record downloaded verified; the act moves the demonstration's ARCHIVE ROOT MARKER aside
 *      itself (three refusals to start; the marker restored in `finally` and on exit/SIGINT/SIGTERM/SIGHUP — the product's own definition of
 *      reachability, B18, standing in for an unmounted cold volume; nothing under the root moves) → tier/state says reachable false; the
 *      record answers 200 METADATA-ONLY (base64 null, integrity unavailable, availability unreachable, EYE-DEG-001) with ONE
 *      custody.retrieval_degraded row, the audit row success/EYE-DEG-001, no integrity incident; a hot record served beside it; the detail
 *      served; the marker restored → reachable true, the record verified again; the marker's sha256 before and after equal.
 *   6. THE STATE: the four objects' states, the register, the subscriptions, what the act leaves, the limits.
 *
 * CASTING BY ROLE (B21 D14; C10 — the brief's names checked against the seed): the administrator = the platform-admin session; N. Eriksen
 * (forecast_owner, scripts/phase4/seed-prediction.mjs:67); J. Weber (strategy_owner, scripts/phase3/seed-graph.mjs:150); T. Nakamura
 * (twin_owner — the twin's owner and the runs' operator, scripts/phase5/seed-twins.mjs:72-73); A. Hoffmann (domain_analyst; the download).
 * The brief's K. Vogel and S. Roth are MIRROR-domain personas (scripts/phase6/act-b17.mjs:242-243) and R. Adler (record_authority,
 * scripts/phase6/demo-b9-capabilities.mjs:61) and L. Ferreira (extraction_manager) hold no foresight role — named here as the correction;
 * no persona is created. Every wait exceeds the dispatcher's 60-second reconcile tick. Nothing here prints a credential.
 */
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);   // caller-supplied environment values win: the rehearsal's EYE_DB_NAME / EYE_VAULT_*_ROOT reach the act unchanged
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const P = `${X}/prediction`; const W = `${X}/twins`; const O = `${X}/observation`; const R = `${X}/retention`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
/** An instant from the DATABASE clock (the ledgers' occurred_at is the write transaction's clock; the act's own clock is not the record's). */
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const tStart = Date.now();
// THE PERSONAS (D14): every one existing; no new persona.
const eriksen = await who('n.eriksen'); const weber = await who('j.weber'); const nakamura = await who('t.nakamura'); const hoffmann = await who('a.hoffmann');
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ne = P_(eriksen, 'prediction'); const jw = P_(weber, 'prediction'); const jwg = P_(weber, 'graph'); const tn = P_(nakamura, 'twin'); const sm = P_(nakamura, 'simulation'); const ah = P_(hoffmann, 'observation');
/** The administrator's envelope in the origin (the platform-admin session; B20's D25). */
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'];
const SELECTION = { relationships: { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } };
const BROAD = KINDS.filter((k) => SELECTION[k] === undefined);
/** The three consumers whose METHOD_REF literal changed in 0081 (C4): re-registered; the four others left. */
const CHANGED = ['forecasts', 'scenarios', 'decisions'];
let liveBroad = BROAD.length;

/* ── the outbox, the deliveries, the ledgers (the B17/B20 idioms) ─────────── */
/** The newest published row of an event type after a mark satisfying the predicate. */
async function waitEvent(eventType, where, notBefore, seconds = 40) {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, partition_seq::int, correlation_id::text, schema_version, payload from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc limit 20`, [eventType, T, D, new Date(notBefore - 1000)]);
    const row = rows.find((r) => Object.entries(where).every(([k, v]) => r.payload?.[k] === v)) ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
/** The newest published GraphChanged row of a kind caused by a target after a mark. */
async function waitOutbox(kind, targetId, notBefore, seconds = 40) {
  for (let i = 0; i < seconds; i += 1) {
    const row = (await q(`select id::text, status, partition_seq::int, correlation_id::text, payload from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and payload #>> '{change,kind}' = $3 and payload #>> '{cause,target_id}' = $4 and created_at >= $5 order by created_at desc limit 1`, [T, D, kind, targetId, new Date(notBefore - 1000)]))[0] ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const deliveriesOf = (eventId) => q(`select subscription_id::text, consumer_kind, state, items, items_applied, items_unresolved, attempts, deliveries::int deliveries, last_error, failure_class, disposition from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
/** Every delivery of an event terminal (the B16 loop; the wait exceeds the 60 s reconcile tick). */
async function settled(eventId, expected = liveBroad, seconds = 150, subscriptionId = null) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveriesOf(eventId)).filter((d) => subscriptionId === null || d.subscription_id === subscriptionId);
    if (ds.length >= expected && ds.every((d) => ['applied', 'failed', 'refused', 'unresolved'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
const effectsOf = (d) => [...new Set((d.items_applied ?? []).map((x) => x.effect))].join(', ');
const deliveryLine = (ds) => ds.map((d) => `${d.consumer_kind} ${d.state}${(d.items ?? []).length > 0 ? ` (${(d.items ?? []).length} item(s): ${effectsOf(d) || 'no effect recorded'})` : ' (no items)'}${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`).join('; ');
const byKind = (ds, k) => ds.find((d) => d.consumer_kind === k) ?? null;
const retrievalCheck = async (eventId, subscriptionId = null) => (await q(`select check_id::text, mismatched::int from graph.retrieval_checks where outbox_event_id = $1 and ($2::uuid is null or subscription_id = $2::uuid) order by checked_at desc limit 1`, [eventId, subscriptionId]))[0] ?? null;

/* ── the routes ──────────────────────────────────────────────────────────── */
const subscriptionStatus = async (label) => {
  const r = await call(`${G}/subscriptions/status`, ad({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, admin.token);
  if (!r.ok) { fail(`subscriptions/status (${label})`, r); return null; }
  return r.body.subscriptions;
};
const validate = (session, build, twinId, version, payload) => call(`${W}/${twinId}/versions/${version}/validate`, build({ action: 'twin.version.validate', objectType: 'TWN', objectId: twinId, consequence: 'C2' }), payload, session.token);
const runTwin = (payload) => call(`${W}/simulations/run`, sm({ action: 'simulation.run', objectType: 'SIM' }), payload, nakamura.token);
const getRun = (runId) => call(`${W}/simulations/${runId}/get`, sm({ action: 'simulation.read', objectType: 'SIM', objectId: runId, sideEffect: 'none' }), {}, nakamura.token);
const compare = (runIds) => call(`${W}/simulations/compare`, sm({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { runIds }, nakamura.token);
const openChallenge = (runId, payload) => call(`${W}/simulations/${runId}/challenge`, jw({ purposeId: 'simulation', action: 'simulation.challenge.open', objectType: 'SIM', objectId: runId, consequence: 'C2' }), payload, weber.token);
const rerunChallenge = (runId, challengeId, note_) => call(`${W}/simulations/${runId}/challenges/${challengeId}/rerun`, ad({ purposeId: 'simulation', action: 'simulation.challenge.rerun', objectType: 'SIM', objectId: runId, consequence: 'C2' }), { note: note_ }, admin.token);
const decideChallenge = (runId, challengeId, payload) => call(`${W}/simulations/${runId}/challenges/${challengeId}/decide`, ad({ purposeId: 'simulation', action: 'simulation.challenge.decide', objectType: 'SIM', objectId: runId, consequence: 'C2' }), payload, admin.token);
const promote = (runId, payload) => call(`${W}/simulations/${runId}/promote`, ad({ purposeId: 'simulation', action: 'simulation.result.promote', objectType: 'SIM', objectId: runId, consequence: 'C2' }), payload, admin.token);
const assess = (forecastId) => call(`${P}/forecasts/${forecastId}/assess`, ne({ action: 'prediction.forecast.assess', objectType: 'FCT', objectId: forecastId, consequence: 'C2' }), {}, eriksen.token);
const calibration = () => call(`${P}/calibration/summary`, ne({ action: 'prediction.read', objectType: 'FCT', sideEffect: 'none' }), {}, eriksen.token);
const declareScenario = (payload) => call(`${P}/scenarios/declare`, jw({ action: 'prediction.scenario.declare', objectType: 'SCN', consequence: 'C2' }), payload, weber.token);
const reviewScenario = (scenarioId, payload) => call(`${P}/scenarios/${scenarioId}/review`, jw({ action: 'prediction.scenario.review', objectType: 'SCN', objectId: scenarioId, consequence: 'C2' }), payload, weber.token);
const download = (evdId) => call(`${O}/evidence/${evdId}/download`, ah({ action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const detail = (evdId) => call(`${O}/evidence/${evdId}/get`, ah({ action: 'observation.read.evidence', objectType: 'EVD', objectId: evdId, sideEffect: 'none' }), {}, hoffmann.token);
const tierState = async () => { const r = await call(`${R}/tier/state`, ad({ purposeId: 'retention', action: 'retention.read', objectType: 'RTP', sideEffect: 'none' }), {}, admin.token); if (!r.ok) { fail('retention/tier/state (the administrator)', r); return null; } return r.body.state; };

/* ── 0. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n0. THE STATE — the register through the route (40 bound / 10 partial / 0 unbound; the four foresight rows bound in 0081); the three consumers whose method changed in B21 revoked and registered anew, the four others left; the honest defaults of the demonstration\'s rows');
const registerLine = async (label) => {
  const ir = await call(`${G}/interfaces`, jwg({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (!ir.ok) { fail(`graph/interfaces (j.weber, ${label})`, ir); return; }
  const all = ir.body.interfaces ?? [];
  const count = (s) => all.filter((i) => i.binding_state === s).length;
  const four = ['L5-I05', 'L6-I03', 'L7-I04', 'L8-I04'].map((id) => all.find((i) => i.interface_id === id) ?? null);
  const bound = four.every((r) => r !== null && r.binding_state === 'bound' && r.bound_in === '0081' && r.schema_version === 'v1');
  const l9 = all.find((i) => i.interface_id === 'L9-I05') ?? null;
  if (all.length === 50 && count('bound') === 40 && count('partial') === 10 && count('unbound') === 0 && bound && l9 !== null && /\(L10-I05, B22\)/.test(String(l9.bound_to))) ok(`the interface register (J. Weber, ${label}): ${all.length} rows — 40 bound / 10 partial / 0 unbound; ${four.map((r) => `${r.interface_id} ${r.name}@${r.schema_version} bound in ${r.bound_in}`).join(', ')}; L9-I05's clause re-homed to B22`);
  else bad(`the register (${label}): ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}; the four: ${four.map((r) => (r === null ? 'MISSING' : `${r.interface_id} ${r.binding_state} ${r.bound_in ?? '—'}`)).join(', ')}; L9-I05 ${l9 === null ? 'MISSING' : String(l9.bound_to).slice(-40)}`);
};
await registerLine('before');
{
  const st = await subscriptionStatus('the origin');
  if (st !== null) {
    liveBroad = (st.subscriptions ?? []).filter((s) => s.status === 'active' && BROAD.includes(s.consumer_kind)).length;
    let reregistered = 0; let already = 0;
    for (const kind of KINDS) {
      const live = (st.subscriptions ?? []).find((s) => s.consumer_kind === kind && s.status === 'active') ?? null;
      const current = (st.consumers ?? []).find((c) => c.kind === kind) ?? null;
      if (current === null) { bad(`${kind}: this process has no ${kind} consumer`); continue; }
      if (live === null) { bad(`${kind}: no active subscription stands — the act registers nothing where nothing stood (run scripts/phase6/register-subscriptions.mjs first)`); continue; }
      if (live.code_digest === current.codeDigest && live.consumer_version === current.version) {
        already += 1;
        ok(`${kind}: subscription ${short(live.subscription_id)} already active with this process's consumer identity (${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…) — ${CHANGED.includes(kind) ? 'an earlier run re-registered it' : 'no method changed in B21'}`);
        continue;
      }
      // A CHANGED METHOD IS A NEW CONSUMER (the 0063 doctrine; C4): revoked and registered anew with the same owner; the replacement replays from the revoked cursor's OWN event (B20 C1).
      const rv = await call(`${G}/subscriptions/${live.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: live.subscription_id, consequence: 'C2' }), { reason: `B21: the ${kind} consumer's method changed (0081: ${kind === 'forecasts' ? 'the marked forecast assessed' : kind === 'scenarios' ? 'the marked scenario re-checked' : 'forecast.fitness_changed exposed as material_change'}); a changed method is a new consumer` }, admin.token);
      if (!rv.ok) { fail(`${kind}: revoke the outdated subscription`, rv); continue; }
      note(`${kind}: subscription ${short(live.subscription_id)} was registered for consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…; this process's is ${current.version} ${String(current.codeDigest).slice(0, 12)}… — REVOKED (cursor ${live.checkpoint_seq ?? 'none'}), registered anew`);
      const r = await call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: kind, ownerPrincipalId: live.owner_principal_id, backlog: 'leave', ...(SELECTION[kind] ?? {}) }, admin.token);
      if (!r.ok) { fail(`${kind}: register the subscription anew`, r); continue; }
      const s = r.body.subscription;
      reregistered += 1;
      ok(`${kind}: registered subscription ${short(s.subscriptionId)}, principal ${short(s.principalId)} (role ${s.role}), consumer ${s.consumer.version} ${String(s.consumer.codeDigest).slice(0, 12)}…, owner ${short(live.owner_principal_id)}; worker running ${r.body.served.workerRunning}`);
      const from = live.checkpoint_seq === null || live.checkpoint_seq === undefined ? {} : { fromSeq: Number(live.checkpoint_seq) - 1 };
      const rp = await call(`${G}/subscriptions/${s.subscriptionId}/replay`, ad({ action: 'graph.subscription.replay', objectType: 'SUB', objectId: s.subscriptionId, consequence: 'C2' }), { ...from, reason: `B21: the ${kind} consumer changed; the replacement replays from the revoked cursor's own event` }, admin.token);
      if (!rp.ok) bad(`${kind}: the replacement's replay was refused (${refusalLine(rp)})`);
      else {
        note(`${kind}: replayed ${rp.body.replayed} event(s) to the replacement from ${from.fromSeq === undefined ? 'the retained beginning' : `sequence ${from.fromSeq} (the revoked cursor's own event ${Number(live.checkpoint_seq)})`}`);
        for (const eventId of rp.body.events ?? []) {
          // the replacement's delivery is applied by the dispatcher's reconcile tick (60 s): the wait covers two ticks
          const ds = await settled(eventId, 1, 150, s.subscriptionId);
          const d = (ds ?? []).find((x) => x.consumer_kind === kind) ?? null;
          note(`${kind}: replayed event ${short(eventId)}: ${d?.state ?? 'NO DELIVERY'}${d ? ` (${effectsOf(d) || 'no effect'})` : ''}`);
        }
      }
    }
    if (reregistered + already === KINDS.length && CHANGED.every((k) => (st.subscriptions ?? []).some((s) => s.consumer_kind === k && s.status === 'active'))) ok(`the seven subscriptions of the origin: ${reregistered} re-registered (${CHANGED.join(', ')} — their METHOD_REF literals changed in 0081), ${already} already active; the four unchanged kinds (twins, retrieval, memory-mappings, relationships) left`);
    else bad(`the subscriptions: ${reregistered} re-registered, ${already} already active — expected exactly ${CHANGED.length} re-registrations on a first run (4 already active)`);
    if (reregistered !== CHANGED.length && reregistered !== 0) bad(`re-registered ${reregistered}, not the three changed kinds`);
  }
  const defaults = (await q(`select (select count(*)::int from twin.twin_versions v join twin.twins_current t using (twin_id) where t.domain_id = $1 and v.fitness_state = 'none') as twin_none,
                                    (select count(*)::int from twin.twin_versions v join twin.twins_current t using (twin_id) where t.domain_id = $1) as twin_all,
                                    (select count(*)::int from prediction.forecasts_current where domain_id = $1 and fitness_state = 'none') as fct_none, (select count(*)::int from prediction.forecasts_current where domain_id = $1) as fct_all,
                                    (select count(*)::int from prediction.scenarios_current where domain_id = $1 and coherence_state = 'unchecked') as scn_unchecked, (select count(*)::int from prediction.scenarios_current where domain_id = $1) as scn_all,
                                    (select count(*)::int from simulation.runs_current where domain_id = $1 and envelope_state = 'unrecorded') as run_unrecorded, (select count(*)::int from simulation.runs_current where domain_id = $1) as run_all,
                                    (select count(*)::int from observation.custody_events where domain_id = $1 and event = 'custody.retrieval_degraded') as degraded`, [D]))[0];
  note(`THE HONEST DEFAULTS before the act: twin versions fitness none ${defaults.twin_none}/${defaults.twin_all}; forecasts fitness none ${defaults.fct_none}/${defaults.fct_all}; scenarios coherence unchecked ${defaults.scn_unchecked}/${defaults.scn_all} (declared before any check existed); runs envelope_state unrecorded ${defaults.run_unrecorded}/${defaults.run_all} (opened before 0081); custody.retrieval_degraded rows ${defaults.degraded} (0081 §1.C check 3)`);
}

/* ── 1. FITNESS (twin) ───────────────────────────────────────────────────── */
console.log('\n1. FITNESS (twin) — T. Nakamura (the twin\'s owner) is refused by the separation of duties; the administrator validates the admitted version FIT: the envelope the port computed, the calibration history, ValidateTwin@v1, no GraphChanged; T. Nakamura\'s control run carries twin_fitness fit and envelope_state inside');
let TW = null; let TV = null; let CONTROL = null;
{
  const tw = (await q(`select t.twin_id::text id, t.title, t.owner_principal_id::text owner, (select max(v.version)::int from twin.twin_versions v where v.twin_id = t.twin_id and v.state = 'admitted') as version from twin.twins_current t where t.domain_id = $1 and t.kind = 'supply-chain' order by t.declared_at limit 1`, [D]))[0] ?? null;
  if (tw === null || tw.version === null) bad('no supply-chain twin with an admitted version in the origin — run the Phase 5 seed first; scenes 1 and 4 are skipped');
  else {
    TW = tw.id; TV = tw.version;
    note(`the twin ${short(TW)} "${tw.title}", owner ${short(tw.owner)} (${tw.owner === nakamura.principalId ? 'T. Nakamura' : 'NOT T. Nakamura'}), admitted version ${TV}; its fitness before: ${(await q(`select fitness_state from twin.twin_versions where twin_id = $1 and version = $2`, [TW, TV]))[0]?.fitness_state}`);
    const t1 = Date.now();
    const sod = await validate(nakamura, tn, TW, TV, { verdict: 'fit', reason: 'the twin reconciles within tolerance (the owner validating their own twin — the demonstration)', limitations: ['calendar days'] });
    if (!sod.ok && sod.status === 403 && /^twin validation rejected: the twin's owner does not validate their own twin/.test(String(sod.body?.message))) ok(`T. Nakamura (the owner) refused: ${refusalLine(sod)}`);
    else bad(`the owner's validation: ${sod.ok ? 'ADMITTED' : refusalLine(sod)}`);
    const v = await validate(admin, ad, TW, TV, { verdict: 'fit', reason: 'the corridor model reconciles within tolerance on the demonstration (validated by the administrator)', limitations: ['calendar days', 'synthetic grounding'] });
    if (!v.ok) fail('validate (the administrator)', v);
    else {
      const val = v.body.validation; const env_ = val.envelope ?? {}; const cal = val.calibration ?? {};
      const keys = Object.entries(env_.keys ?? {}).map(([k, x]) => `${k}: ${x.verdict}${x.value === null || x.value === undefined ? '' : ` (${x.value} in [${x.range?.[0]}, ${x.range?.[1]}] from ${x.source})`}`).join('; ');
      if (val.verdict === 'fit' && env_.state === 'inside' && val.prior_state === 'none') ok(`the administrator validated version ${TV} FIT: envelope ${env_.state} of ${env_.model} — ${keys}; calibration since ${cal.since ?? 'never'}: ${cal.count} reconciliation(s)${cal.note ? ` (${cal.note})` : ''}; ${(val.runs ?? []).length} run(s) rest on the version (named, never altered)`);
      else bad(`the validation: ${JSON.stringify({ verdict: val.verdict, envelope: env_.state, prior: val.prior_state }).slice(0, 300)}`);
      const row = (await q(`select fitness_state, fitness_validation_id::text vid from twin.twin_versions where twin_id = $1 and version = $2`, [TW, TV]))[0];
      if (row?.fitness_state === 'fit' && row.vid === val.validation_id) ok(`twin_versions.fitness_state fit, fitness_validation_id ${short(row.vid)} (twin.validations ${(await q(`select count(*)::int n from twin.validations where twin_id = $1`, [TW]))[0].n} row(s))`); else bad(`the version row: ${JSON.stringify(row)}`);
      const vt = await waitEvent('ValidateTwin', { twin_id: TW, validation_id: val.validation_id }, t1);
      if (vt !== null && vt.schema_version === 'v1' && vt.payload.verdict === 'fit' && vt.payload.cause?.action === 'twin.version.validate') ok(`ValidateTwin@v1 published (seq ${vt.partition_seq}): version ${vt.payload.version}, verdict ${vt.payload.verdict}, prior ${vt.payload.prior_state}, envelope ${vt.payload.envelope?.state}, dependency_impacts.runs ${(vt.payload.dependency_impacts?.runs ?? []).length}`); else bad(`ValidateTwin: ${vt === null ? 'NOT published' : JSON.stringify(vt.payload).slice(0, 200)}`);
      const gc = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload #>> '{cause,action}' = 'twin.version.validate'`, [T, D, new Date(t1 - 1000)]))[0].n;
      if (Number(gc) === 0) ok('no GraphChanged from the validation: a validation changes no fact (D2)'); else bad(`${gc} GraphChanged row(s) from the validation`);
    }
    // THE RUN: a control run by T. Nakamura on the validated version — its contract carries twin_fitness and the envelope state.
    const t2 = Date.now();
    const r = await runTwin({ twinId: TW, twinVersion: TV, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
    if (!r.ok) fail('simulations/run (t.nakamura)', r);
    else {
      const run = r.body.run; CONTROL = run.runId;
      if (run.state === 'completed' && run.twinFitness === 'fit' && run.envelope?.state === 'inside' && run.envelopeAck === null) ok(`T. Nakamura's control run ${short(CONTROL)} completed: twin_fitness ${run.twinFitness}, envelope ${run.envelope.state} (${Object.entries(run.envelope.keys ?? {}).map(([k, x]) => `${k} ${x.verdict}`).join(', ')}), no acknowledgement needed — SYNTHETIC`);
      else bad(`the run: ${JSON.stringify({ state: run.state, twinFitness: run.twinFitness, envelope: run.envelope?.state, ack: run.envelopeAck }).slice(0, 300)}`);
      const st = await waitEvent('SimulationStarted', { run_id: CONTROL }, t2);
      if (st !== null && st.payload.twin_fitness === 'fit' && st.payload.envelope?.state === 'inside') ok(`SimulationStarted (seq ${st.partition_seq}) carries twin_fitness ${st.payload.twin_fitness} and envelope ${st.payload.envelope.state}`); else bad(`SimulationStarted: ${st === null ? 'NOT published' : JSON.stringify({ twin_fitness: st.payload.twin_fitness, envelope: st.payload.envelope?.state })}`);
      await waitEvent('SimulationCompleted', { run_id: CONTROL }, t2);
    }
    note('STATED: the outside-envelope run is not staged on the demonstration (the demo\'s elements lie inside the model\'s envelope; nothing is regrounded for a show) — the harness T1.6 carries the 422, the operator\'s 403 and the acknowledged run');
  }
}

/* ── 2. FITNESS (forecast) ───────────────────────────────────────────────── */
console.log('\n2. FITNESS (forecast) — N. Eriksen assesses the corridor transit forecast: the rule\'s verdict WITH its measures (the ledger is thin; an issued forecast whose daily cadence lapsed reads envelope_breach); the events and the deliveries when unfit; the calibration summary read back; nothing withdrawn');
let F = null; let FITNESS = null;
{
  const f = (await q(`select forecast_id::text id, series_key, horizon_code, method, state, issued_at, refresh_cadence, fitness_state, label from prediction.forecasts_current where domain_id = $1 and state = 'issued' and series_key like 'portwatch%' order by issued_at desc limit 1`, [D]))[0]
    ?? (await q(`select forecast_id::text id, series_key, horizon_code, method, state, issued_at, refresh_cadence, fitness_state, label from prediction.forecasts_current where domain_id = $1 and state = 'issued' order by issued_at desc limit 1`, [D]))[0] ?? null;
  if (f === null) bad('no issued forecast in the origin — run the Phase 4 seed first; scene 2 is skipped');
  else {
    F = f.id;
    const outcomes = (await q(`select count(*)::int n from prediction.outcome_ledger where tenant_id = $1 and domain_id = $2 and series_key = $3 and horizon_code = $4 and method = $5`, [T, D, f.series_key, f.horizon_code, f.method]))[0].n;
    note(`the forecast ${short(F)}: ${f.series_key} ${f.horizon_code} ${f.method}, ${f.label}, issued ${iso(f.issued_at)}, cadence ${f.refresh_cadence ?? 'none'}, fitness before ${f.fitness_state}; the family's outcome ledger holds ${outcomes} row(s)`);
    const t2 = Date.now();
    const r = await assess(F);
    if (!r.ok) fail('forecasts/assess (n.eriksen)', r);
    else {
      const a = r.body.assessment; const m = a.measures ?? {}; FITNESS = a.verdict;
      const expired = m.expiry?.checked === true && m.expiry?.expires_at !== null && new Date(m.expiry.expires_at).getTime() < Date.now();
      // The rule's classes are judged IN ORDER (0081 §5: calibration_failure, drift, data_shift, envelope_breach): a forecast whose attention mark
      // says data_shift (the demonstration's corridor forecast was reached by a retraction in an earlier act) reads data_shift before the lapsed cadence.
      const marked = a.class === 'data_shift';   // the port judged the class in the rule's order; the act states the reason (the attention mark), never re-derives it
      const expectedClass = marked ? 'data_shift' : (expired ? 'envelope_breach' : null);
      const expectedVerdict = (marked || expired) ? 'unfit' : (Number(m.window?.outcomes) >= Number(m.window?.required) ? 'fit' : 'indeterminate');
      if (a.verdict === expectedVerdict && (a.class ?? null) === expectedClass && a.changed === true && a.prior_state === 'none') ok(`N. Eriksen's assessment under rule v${m.rule_version}: ${a.verdict}${a.class ? ` (${a.class})` : ''} — outcomes ${m.window?.outcomes} of ${m.window?.required} in the family's window (${m.note ?? 'the calibration rules applied'}); coverage ${m.coverage?.observed ?? '—'} (floor ${m.coverage?.floor}, checked ${m.coverage?.checked}); pinball ${m.pinball?.observed ?? '—'} vs backtest ${m.pinball?.backtest ?? 'none'}; attention ${m.attention_state}; expiry ${m.expiry?.expires_at ? iso(m.expiry.expires_at) : 'none'} (cadence ${m.expiry?.cadence ?? 'none'}${expired ? ' — LAPSED: an issued forecast past its refresh cadence is unfit by envelope_breach; a scheduler would have re-issued it, none exists' : ''})`);
      else bad(`the assessment: ${JSON.stringify({ verdict: a.verdict, class: a.class, changed: a.changed, prior: a.prior_state, expected: [expectedVerdict, expectedClass] })}`);
      const row = (await q(`select fitness_state, fitness_class, fitness_assessment_id::text aid from prediction.forecasts_current where forecast_id = $1`, [F]))[0];
      if (row?.fitness_state === a.verdict && row.aid === a.assessment_id) ok(`forecasts_current.fitness_state ${row.fitness_state}${row.fitness_class ? ` (${row.fitness_class})` : ''}, the assessment row ${short(row.aid)} on prediction.forecast_fitness_assessments (trigger operator)`); else bad(`the forecast row: ${JSON.stringify(row)}`);
      const ffc = await waitEvent('ForecastFitnessChanged', { forecast_id: F }, t2);
      if (ffc !== null && ffc.schema_version === 'v1' && ffc.payload.to?.state === a.verdict && ffc.payload.trigger === 'operator' && ffc.payload.cause?.action === 'prediction.forecast.assess') ok(`ForecastFitnessChanged@v1 published (seq ${ffc.partition_seq}): from ${ffc.payload.from?.state} to ${ffc.payload.to?.state}${ffc.payload.to?.class ? ` (${ffc.payload.to.class})` : ''}, rule v${ffc.payload.rule_version}`); else bad(`ForecastFitnessChanged: ${ffc === null ? 'NOT published' : JSON.stringify(ffc.payload).slice(0, 200)}`);
      if (a.verdict === 'unfit') {
        const gc = await waitOutbox('forecast.fitness_changed', F, t2);
        if (gc === null) bad('GraphChanged/forecast.fitness_changed NOT published for the unfit assessment');
        else {
          const ds = await settled(gc.id);
          ok(`GraphChanged/forecast.fitness_changed (seq ${gc.partition_seq}) — ${deliveryLine(ds)}`);
          const sc = byKind(ds, 'scenarios'); const dc = byKind(ds, 'decisions');
          note(`the consumers: scenarios ${(sc?.items ?? []).length} scenario(s) marked input_unverified and re-checked (${effectsOf(sc ?? {}) || 'none rests on it'}); decisions ${(dc?.items ?? []).length} package(s) noted material_change — assessed unfit, not withdrawn (${effectsOf(dc ?? {}) || 'none cites it'}); forecasts answers nothing for its own kind`);
          const chk = await retrievalCheck(gc.id);
          if (chk !== null && chk.mismatched === 0) ok(`the retrieval subscriber verified the event: check ${short(chk.check_id)} mismatched 0`); else bad(`the retrieval check: ${JSON.stringify(chk)}`);
        }
      } else {
        await sleep(3000);
        const n = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and payload #>> '{change,kind}' = 'forecast.fitness_changed' and created_at >= $3`, [T, D, new Date(t2 - 1000)]))[0].n;
        if (Number(n) === 0) ok(`no GraphChanged for a ${a.verdict} verdict: a fit or indeterminate assessment marks nothing (D7)`); else bad(`${n} GraphChanged row(s) for a ${a.verdict} verdict`);
      }
      const again = await assess(F);
      if (again.ok && again.body.assessment.changed === false && again.body.assessment.verdict === a.verdict) ok('a second assessment is idempotent: changed false, the verdict unchanged, no second event'); else bad(`the second assessment: ${again.ok ? JSON.stringify(again.body.assessment).slice(0, 200) : refusalLine(again)}`);
      const cal = await calibration();
      if (!cal.ok) fail('calibration/summary (n.eriksen)', cal);
      else {
        const fam = (cal.body.calibration?.fitness ?? []).find((x) => x.forecast_id === F) ?? null;
        if (fam !== null && fam.state === a.verdict && /Fitness \(below\)/.test(String(cal.body.calibration?.statement))) ok(`the calibration summary's live fitness table names the family: ${fam.series_key} ${fam.horizon_code} ${fam.method} → ${fam.state}${fam.class ? ` (${fam.class})` : ''}, outcomes ${fam.outcomes}, rule v${fam.rule_version}`); else bad(`the calibration summary: ${JSON.stringify({ fam, statement: String(cal.body.calibration?.statement).slice(0, 120) })}`);
      }
      note('STATED: the act does NOT withdraw the forecast — the withdrawal (L6-I05) stays N. Eriksen\'s own act; the assessment names the class the withdraw page would offer');
    }
  }
}

/* ── 3. COHERENCE ────────────────────────────────────────────────────────── */
console.log('\n3. COHERENCE — J. Weber declares a scenario with a DUPLICATE downside branch: admitted FAILED with the findings and routed_to, ScenarioCoherenceFailed@v1; T. Nakamura\'s run on its branch refused; retired by J. Weber; the successor without the duplicate passes');
let SDUP = null; let SOK = null; let SOK_BRANCH = null; let RUN3_VERSION = null; let RUN3_CONTROL = null;   // scene 3: the version whose known_at follows the scenarios and its control run (scene 4 disputes a run on that version)
{
  const forecast = (await q(`select forecast_id::text id, series_key from prediction.forecasts_current where domain_id = $1 and state = 'issued' and fitness_state <> 'unfit' order by issued_at desc limit 1`, [D]))[0] ?? null;
  if (F !== null && FITNESS === 'unfit') {
    const refused_ = await declareScenario({ title: `B21 — a scenario on the unfit corridor forecast (${new Date().toISOString().slice(0, 10)})`, statement: 'declared on a forecast assessed unfit (the demonstration)', forecastId: F, owner: weber.principalId, reviewCadence: 'weekly', branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: weber.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }] });
    if (!refused_.ok && refused_.status === 409 && /^scenario rejected: forecast .* was assessed unfit/.test(String(refused_.body?.message))) ok(`a scenario on the unfit forecast is REFUSED (D8): ${refusalLine(refused_)}`); else bad(`the declaration on the unfit forecast: ${refused_.ok ? 'ADMITTED' : refusalLine(refused_)}`);
  }
  const indicator = (await q(`select indicator_id::text id, description, series_key from prediction.indicators_current where domain_id = $1 ${forecast === null ? '' : 'order by (series_key = $2) desc, defined_at desc'} limit 1`, forecast === null ? [D] : [D, forecast.series_key]))[0] ?? null;
  if (indicator === null) bad('no indicator in the origin — a non-baseline branch needs one; scene 3 is skipped');
  else {
    const on = forecast === null ? { forecastId: null } : { forecastId: forecast.id };
    note(`the scenario rests on ${forecast === null ? 'NO forecast (every issued forecast of the origin is unfit; a scenario without a forecast is admitted — the forecast_relationship rule has nothing to judge)' : `the forecast ${short(forecast.id)} (${forecast.series_key})`}; its downside branches on the indicator ${short(indicator.id)} "${indicator.description}"`);
    const t3 = Date.now();
    const branch = (name, statement) => ({ name, kind: 'downside', statement, indicatorId: indicator.id, owner: weber.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 });
    const r = await declareScenario({ title: `B21 — the corridor with a duplicated collapse branch (${new Date().toISOString().slice(0, 10)})`, statement: 'two downside branches watch the same signal (the demonstration)', ...on, owner: weber.principalId, reviewCadence: 'weekly',
      branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: weber.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }, branch('Corridor collapse', 'below the threshold for five days'), branch('Corridor collapse (restated)', 'the corridor collapses — the same signal, a second branch')] });
    if (!r.ok) fail('scenarios/declare (j.weber)', r);
    else {
      SDUP = r.body.scenario.scenarioId; const co = r.body.scenario.coherence ?? {};
      const fails = (co.findings ?? []).filter((x) => x.severity === 'fail');
      if (co.outcome === 'failed' && co.changed === true && fails.some((x) => x.rule === 'duplicate_branch')) ok(`J. Weber's scenario ${short(SDUP)} ADMITTED failed (never refused): ${(co.findings ?? []).map((x) => `${x.rule} [${x.severity}]: ${x.detail}`).join(' | ')}`); else bad(`the declaration's coherence: ${JSON.stringify(co).slice(0, 300)}`);
      const scf = await waitEvent('ScenarioCoherenceFailed', { scenario_id: SDUP }, t3);
      if (scf !== null && scf.schema_version === 'v1' && scf.payload.trigger === 'declare' && Array.isArray(scf.payload.routed_to)) ok(`ScenarioCoherenceFailed@v1 published (seq ${scf.partition_seq}): ${scf.payload.findings?.length} finding(s), rule v${scf.payload.rule_version}, routed_to ${scf.payload.routed_to.join(', ')}`); else bad(`ScenarioCoherenceFailed: ${scf === null ? 'NOT published' : JSON.stringify(scf.payload).slice(0, 200)}`);
      // THE GATE: a run on the incoherent scenario's branch — on a version admitted after the declaration when the demo's twin is older than the scenario (the world-time cut-off of open_run precedes the coherence gate).
      const branchId = (r.body.scenario.branches ?? []).find((b) => b.kind === 'downside')?.branchId ?? null;
      if (TW !== null && TV !== null && branchId !== null) {
        const cur = (await q(`select known_at, observed_through from twin.twin_versions where twin_id = $1 and version = $2`, [TW, TV]))[0] ?? null;
        const known = cur?.known_at ?? null;
        let runVersion = TV;
        if (known !== null && new Date(known).getTime() < t3) {
          // B18's rule (act-b18.mjs): a carried version names the CURRENT version's world-time cut-off — a pg DATE rendered by local getters, never
          // toISOString (a day early on UTC+ hosts); a version without observed_through is refused at the run ("no world-time cut-off").
          const dayOf = (v) => { if (v === null || v === undefined) return null; const d = v instanceof Date ? v : new Date(String(v)); if (Number.isNaN(d.getTime())) return String(v).slice(0, 10); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
          const observedThrough = dayOf(cur?.observed_through);
          const o = await call(`${W}/${TW}/versions/open`, tn({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough, carryFrom: TV }, nakamura.token);
          if (!o.ok) fail('twins/versions/open (t.nakamura; the version whose known_at follows the scenario)', o);
          else {
            const a = await call(`${W}/${TW}/versions/${o.body.version.version}/admit`, tn({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), { allowIncomplete: true }, nakamura.token);
            if (!a.ok) fail('twins/versions/admit (t.nakamura)', a); else { runVersion = o.body.version.version; note(`T. Nakamura carried version ${TV} into version ${runVersion} (known_at now: the scenario is known to it — the run's shock basis)`); }
          }
        }
        const rr = await runTwin({ twinId: TW, twinVersion: runVersion, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: SDUP, scenarioBranchId: branchId });
        RUN3_VERSION = runVersion; if (rr.ok) RUN3_CONTROL = rr.body.run?.runId ?? null;
        if (!rr.ok && rr.status === 409 && /^run rejected \(incoherent_scenario\): scenario .* failed its coherence check/.test(String(rr.body?.message))) ok(`T. Nakamura's run on the failed scenario's branch REFUSED: ${refusalLine(rr)}`); else bad(`the run on the incoherent branch: ${rr.ok ? `ADMITTED (${short(rr.body.run?.runId)})` : refusalLine(rr)}`);
        if (REHEARSAL) {
          const pr = await reviewScenario(SDUP, { outcome: 'promote_to_simulation', branch_id: branchId, note: 'REHEARSAL ONLY: promoting a failed scenario\'s branch' });
          if (!pr.ok && pr.status === 409 && /^a failed coherence check prohibits promotion to simulation/.test(String(pr.body?.message))) ok(`REHEARSAL ONLY: promote_to_simulation refused: ${refusalLine(pr)}`); else bad(`REHEARSAL ONLY: the promotion review: ${pr.ok ? 'ADMITTED' : refusalLine(pr)}`);
        } else note('the promotion-to-simulation refusal of a failed scenario is shown on the rehearsal copy only (the harness T3.2 carries it)');
      }
      const ret = await reviewScenario(SDUP, { outcome: 'retire', note: 'retired: the duplicated branch; a successor without it follows (the demonstration)' });
      if (ret.ok) ok(`J. Weber RETIRED the scenario (no branch-close act exists — the correction path is retire + a successor, D10)`); else fail('scenarios/review retire (j.weber)', ret);
      const s2 = await declareScenario({ title: `B21 — the corridor, one collapse branch (${new Date().toISOString().slice(0, 10)})`, statement: 'the successor: one downside branch on the signal (the demonstration)', ...on, owner: weber.principalId, reviewCadence: 'weekly',
        branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: weber.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }, branch('Corridor collapse', 'below the threshold for five days')] });
      if (!s2.ok) fail('scenarios/declare successor (j.weber)', s2);
      else {
        SOK = s2.body.scenario.scenarioId; SOK_BRANCH = (s2.body.scenario.branches ?? []).find((b) => b.kind === 'downside')?.branchId ?? null; const co2 = s2.body.scenario.coherence ?? {};
        if (co2.outcome === 'passed' && (co2.findings ?? []).every((x) => x.severity === 'note')) ok(`the successor ${short(SOK)} PASSED: ${(co2.findings ?? []).map((x) => `${x.rule} [${x.severity}]`).join(', ') || 'no finding'} — coherence_state ${(await q(`select coherence_state from prediction.scenarios_current where scenario_id = $1`, [SOK]))[0]?.coherence_state}`); else bad(`the successor's coherence: ${JSON.stringify(co2).slice(0, 300)}`);
      }
    }
  }
}

/* ── 4. CHALLENGE ────────────────────────────────────────────────────────── */
console.log('\n4. CHALLENGE — J. Weber disputes the demo\'s newest completed valid intervention run; the administrator requests the re-run; T. Nakamura opens it as a governed run naming the challenge; compared on the common control; the administrator DISMISSES (the run stays valid); the administrator PROMOTES the control as fit for the routing decision; the upheld path on the rehearsal copy only');
let CH = null; let RUN = null; let RERUN = null; let PROMOTED = null;
// The demonstration's intervention runs all sit on scenarios retired by review (act IV's and B18's Suez scenarios); a re-run is opened on the run's own
// branch, so the act disputes a run of its own: T. Nakamura's intervention run on scene 3's successor branch, citing scene 1's control run.
{
  let run = (await q(`select run_id::text id, twin_id::text twin_id, twin_version::int twin_version, control_run_id::text control_run_id, operator_principal_id::text operator, shock, component, interventions, constraints, stochastic_mode, scenario_id::text scenario_id, scenario_branch_id::text scenario_branch_id, fitness_state, envelope_state, twin_fitness from simulation.runs_current r where r.domain_id = $1 and r.state = 'completed' and r.validity = 'valid' and r.run_kind = 'intervention' and r.control_run_id is not null and (r.scenario_id is null or exists (select 1 from prediction.scenarios_current sc where sc.scenario_id = r.scenario_id and sc.retired_at is null)) order by r.opened_at desc limit 1`, [D]))[0] ?? null;   // a re-run is opened on the run's own branch: a run whose scenario was retired by review cannot be re-run (the demonstration's newest intervention run sits on the superseded Suez scenario) — the newest whose scenario is live is disputed
  if (run === null && TW !== null && CONTROL !== null && SOK !== null && SOK_BRANCH !== null) {
    const ctlRow = (await q(`select twin_version::int v, shock, component, interventions, constraints from simulation.runs_current where run_id = $1`, [CONTROL]))[0] ?? null;
    // The successor scenario was declared AFTER scene 3's carried version was opened: a run's shock takes its basis from a scenario known at the
    // version's record time, so the act carries the current version once more (known_at now, the current cut-off — B18's rule), admits it, opens a
    // control run on it, and only then the intervention run on the successor's branch.
    const curV = (await q(`select version::int v, observed_through from twin.twin_versions where twin_id = $1 and state = 'admitted' order by version desc limit 1`, [TW]))[0] ?? null;
    const dayOf4 = (v) => { if (v === null || v === undefined) return null; const d = v instanceof Date ? v : new Date(String(v)); if (Number.isNaN(d.getTime())) return String(v).slice(0, 10); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    let ver = Number(curV?.v ?? TV); let ctlId = CONTROL;
    // the intervention's shape is the demonstration's own (the newest completed intervention run, whatever its scenario): its shock, component,
    // interventions and horizon are copied verbatim — the supply-flow@1 contract names the shipments the twin holds; nothing is invented. The
    // control run must be COMPARABLE with it (the same version, shock, component and constraints — the product refuses otherwise), so both take the shape.
    const tpl = (await q(`select shock, component, interventions, constraints from simulation.runs_current where domain_id = $1 and state = 'completed' and validity = 'valid' and run_kind = 'intervention' order by opened_at desc limit 1`, [D]))[0] ?? null;
    const o4 = await call(`${W}/${TW}/versions/open`, tn({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: dayOf4(curV?.observed_through), carryFrom: ver }, nakamura.token);
    if (!o4.ok) fail('twins/versions/open (t.nakamura; the version carried after the successor scenario)', o4);
    else { const a4 = await call(`${W}/${TW}/versions/${o4.body.version.version}/admit`, tn({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW, consequence: 'C2' }), { allowIncomplete: true }, nakamura.token);
      if (!a4.ok) fail('twins/versions/admit (t.nakamura; scene 4)', a4); else { ver = o4.body.version.version; note(`T. Nakamura carried version ${curV?.v} into version ${ver} (known_at now: the successor scenario is known to it; observed through ${dayOf4(curV?.observed_through)})`);
        const c4 = tpl === null ? { ok: false, status: 0, body: { message: 'no intervention run of the demonstration to copy the shape from' } } : await runTwin({ twinId: TW, twinVersion: ver, runKind: 'control', controlRunId: null, shock: tpl.shock, component: tpl.component, interventions: [{ type: 'none' }], horizonDays: Number(tpl.constraints?.horizon_days ?? 90), stochastic: { mode: 'deterministic' } });
        if (!c4.ok) fail('simulations/run (t.nakamura; the control on the carried version)', c4); else ctlId = c4.body.run.runId; } }
    // the intervention's shape is the demonstration's own (the newest completed intervention run, whatever its scenario): its shock, component,
    // interventions and horizon are copied verbatim — the supply-flow@1 contract names the shipments the twin holds; nothing is invented.
    const own = tpl === null ? { ok: false, status: 0, body: { message: 'no intervention run of the demonstration to copy the shape from' } } : await runTwin({ twinId: TW, twinVersion: ver, runKind: 'intervention', controlRunId: ctlId, shock: tpl.shock, component: tpl.component, interventions: tpl.interventions, horizonDays: Number(tpl.constraints?.horizon_days ?? 90), stochastic: { mode: 'deterministic' } });   // a HYPOTHETICAL shock naming no scenario: the successor's downside branch has no flip observation within the cut-offs, and a shock bound to an unflipped branch is refused by the product (the demonstration's live scenario is not flipped) — said
    if (!own.ok) fail('simulations/run (t.nakamura; the intervention run on the successor branch)', own);
    else { const rid = own.body.run.runId; note(`no completed valid intervention run of the demonstration sits on a live scenario (act IV's and B18's are retired by review): T. Nakamura opened intervention run ${short(rid)} as a HYPOTHETICAL shock naming no scenario (the live scenario's branch is not flipped within the cut-offs — the product refuses a shock bound to an unflipped branch), citing control ${short(ctlId)} on version ${ver} (scene 3's, whose known_at follows the scenario) — the act disputes a run of its own`);
      run = (await q(`select run_id::text id, twin_id::text twin_id, twin_version::int twin_version, control_run_id::text control_run_id, operator_principal_id::text operator, shock, component, interventions, constraints, stochastic_mode, scenario_id::text scenario_id, scenario_branch_id::text scenario_branch_id, fitness_state, envelope_state, twin_fitness from simulation.runs_current where run_id = $1 and state = 'completed' and validity = 'valid'`, [rid]))[0] ?? null; }
  }
  if (run === null) bad('no completed valid intervention run in the origin — run the Phase 5 seed (or the B18 act) first; scene 4 is skipped');
  else {
    RUN = run.id;
    const ctl = (await q(`select run_id::text id, state, validity, fitness_state, operator_principal_id::text operator from simulation.runs_current where run_id = $1`, [run.control_run_id]))[0] ?? null;
    note(`the run ${short(RUN)}: twin ${short(run.twin_id)}@${run.twin_version}, operator ${short(run.operator)} (${run.operator === nakamura.principalId ? 'T. Nakamura' : 'NOT T. Nakamura'}), control ${short(run.control_run_id)} (${ctl?.state} ${ctl?.validity}, fitness ${ctl?.fitness_state}), interventions ${JSON.stringify(run.interventions)}, scenario ${run.scenario_id === null ? 'none' : `${short(run.scenario_id)} branch ${short(run.scenario_branch_id)}`}; fitness ${run.fitness_state}, envelope ${run.envelope_state}, twin_fitness ${run.twin_fitness} (opened ${run.envelope_state === 'unrecorded' ? 'before 0081 — the honest default' : 'under 0081'})`);
    const t4 = Date.now();
    const o = await openChallenge(RUN, { kind: 'interpretation', statement: 'the reroute saving assumes the Cape leg is bookable within the horizon (the demonstration)', disputed: ['route.reroute_delay_days'] });
    if (!o.ok) fail('simulations/:runId/challenge (j.weber)', o);
    else {
      CH = o.body.challenge.challenge_id;
      if (o.body.challenge.state === 'open' && o.body.challenge.kind === 'interpretation') ok(`J. Weber OPENED challenge ${short(CH)} (interpretation) on run ${short(RUN)}; the run's operator ${short(o.body.challenge.run?.operator_principal_id)} and J. Weber may not decide it (separation of duties)`); else bad(`the challenge: ${JSON.stringify(o.body.challenge).slice(0, 200)}`);
      const cs = await waitEvent('ChallengeSimulation', { challenge_id: CH, state: 'opened' }, t4);
      if (cs !== null && cs.schema_version === 'v1' && cs.payload.cause?.action === 'simulation.challenge.open') ok(`ChallengeSimulation@v1 published (seq ${cs.partition_seq}): state ${cs.payload.state}, kind ${cs.payload.kind}, run validity ${cs.payload.run?.validity}`); else bad(`ChallengeSimulation (opened): ${cs === null ? 'NOT published' : JSON.stringify(cs.payload).slice(0, 200)}`);
      const sod = await call(`${W}/simulations/${RUN}/challenges/${CH}/decide`, jw({ purposeId: 'simulation', action: 'simulation.challenge.decide', objectType: 'SIM', objectId: RUN, consequence: 'C2' }), { decision: 'dismissed', note: 'deciding my own challenge (the demonstration)' }, weber.token);
      if (!sod.ok && sod.status === 403 && /^simulation challenge rejected: the decider is the challenge's opener/.test(String(sod.body?.message))) ok(`J. Weber may not decide his own challenge: ${refusalLine(sod)}`); else bad(`the opener's decision: ${sod.ok ? 'ADMITTED' : refusalLine(sod)}`);
      // THE RE-RUN requested by the administrator; opened by T. Nakamura as a governed run with the row's own contract, naming correctsRunId and challengeId.
      const rq = await rerunChallenge(RUN, CH, 'please re-run the reroute with the bookable leg (the demonstration)');
      if (rq.ok && rq.body.challenge.state === 'rerun_requested') ok(`the administrator requested a re-run: ${rq.body.challenge.how}`); else fail('challenges/rerun (the administrator)', rq);
      const t4b = Date.now();
      const rr = await runTwin({ twinId: run.twin_id, twinVersion: run.twin_version, runKind: 'intervention', controlRunId: run.control_run_id, correctsRunId: RUN, challengeId: CH, shock: run.shock, component: run.component, interventions: run.interventions, horizonDays: Number(run.constraints?.horizon_days ?? 90), stochastic: { mode: 'deterministic' }, ...(run.scenario_id === null ? {} : { scenarioId: run.scenario_id, scenarioBranchId: run.scenario_branch_id }) });
      if (!rr.ok) fail('simulations/run (t.nakamura; the re-run)', rr);
      else {
        RERUN = rr.body.run.runId;
        const chRow = (await q(`select state, rerun_run_id::text rerun from simulation.challenges where challenge_id = $1`, [CH]))[0];
        if (rr.body.run.state === 'completed' && rr.body.run.challengeId === CH && chRow?.rerun === RERUN) ok(`T. Nakamura's re-run ${short(RERUN)} completed, bound to the challenge (challenge_id on the run; rerun_run_id on the challenge; challenge.rerun_opened on its ledger) — SYNTHETIC`); else bad(`the re-run: ${JSON.stringify({ state: rr.body.run.state, challengeId: rr.body.run.challengeId, chRow })}`);
        await waitEvent('SimulationCompleted', { run_id: RERUN }, t4b);
        const cmp = await compare([run.control_run_id, RUN, RERUN]);
        if (cmp.ok && (cmp.body.comparison?.runs ?? []).length === 3) ok(`compared on the common control: ${(cmp.body.comparison.runs ?? []).map((x) => `${short(x.run_id ?? x.runId)} line_stop_days ${x.totals?.line_stop_days}`).join(', ')}`); else bad(`simulations/compare: ${cmp.ok ? JSON.stringify(cmp.body).slice(0, 200) : refusalLine(cmp)}`);
      }
      // DISMISSED by the administrator: the run stays valid; nothing invalidated; no GraphChanged.
      const t4c = Date.now();
      const dc = await decideChallenge(RUN, CH, { decision: 'dismissed', note: 'the Cape leg was bookable on the record; the interpretation stands (the demonstration)' });
      if (dc.ok && dc.body.challenge?.state === 'dismissed' && dc.body.invalidation === null) ok(`the administrator DISMISSED challenge ${short(CH)}: the run stays valid (${(await q(`select validity, fitness_state from simulation.runs_current where run_id = $1`, [RUN]))[0]?.validity}); no invalidation, no GraphChanged`); else bad(`the decision: ${dc.ok ? JSON.stringify(dc.body).slice(0, 200) : refusalLine(dc)}`);
      const csd = await waitEvent('ChallengeSimulation', { challenge_id: CH, state: 'dismissed' }, t4c);
      if (csd !== null) ok(`ChallengeSimulation@v1 published (seq ${csd.partition_seq}): state dismissed, rerun ${short(csd.payload.rerun_run_id)}`); else bad('ChallengeSimulation (dismissed) NOT published');
      // THE PROMOTION (OBJ-29): the administrator (not the operator) marks the CONTROL fit for the routing decision.
      if (ctl !== null && ctl.state === 'completed' && ctl.validity === 'valid') {
        const t4d = Date.now();
        const pr = await promote(run.control_run_id, { promotedFor: 'the NORDWERK corridor routing decision (the demonstration)', limitations: ['calendar days', 'synthetic grounding'], note: 'the control run reproduces and its envelope holds; fit for the routing decision it informs (the demonstration)' });
        if (!pr.ok) fail('simulations/:runId/promote (the administrator)', pr);
        else {
          PROMOTED = run.control_run_id; const p = pr.body.promotion;
          if (p.fitness_state === 'fit' && p.promoted_for === 'the NORDWERK corridor routing decision (the demonstration)') ok(`the administrator PROMOTED the control ${short(PROMOTED)} FIT for "${p.promoted_for}": the validation restated from the row (${JSON.stringify(p.validation)}), the sensitivity kept, limitations ${JSON.stringify(p.limitations)}; run.promoted on its ledger`); else bad(`the promotion: ${JSON.stringify(p).slice(0, 200)}`);
          await sleep(3000);
          const n = (await q(`select count(*)::int n from objects.object_outbox where tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload #>> '{cause,action}' = 'simulation.result.promote'`, [T, D, new Date(t4d - 1000)]))[0].n;
          if (Number(n) === 0) ok('no outbox event for a promotion (OBJ-29 is a work-object action outside the fifty-interface catalogue; the state rides the get, the list and the page — D12)'); else bad(`${n} outbox row(s) caused by the promotion`);
          const own = await call(`${W}/simulations/${run.control_run_id}/promote`, sm({ action: 'simulation.result.promote', objectType: 'SIM', objectId: run.control_run_id, consequence: 'C2' }), { promotedFor: 'my own run (the demonstration)', note: 'the operator promotes (the demonstration)' }, nakamura.token);
          if (!own.ok && (own.status === 403 || own.status === 409)) ok(`T. Nakamura (the operator) refused: ${refusalLine(own)}`); else bad(`the operator's promotion: ${own.ok ? 'ADMITTED' : refusalLine(own)}`);
        }
      } else note(`the control ${short(run.control_run_id)} is ${ctl?.state} ${ctl?.validity}: not promoted (a promotion needs a completed valid run), said`);
      if (REHEARSAL && RUN !== null) {
        // THE UPHELD PATH — on the rehearsal copy only: a second challenge (model) upheld by the administrator → the run invalidated with trigger challenge.
        const t4e = Date.now();
        const o2 = await openChallenge(RUN, { kind: 'model', statement: 'REHEARSAL ONLY: the model mishandles the reroute delay' });
        if (!o2.ok) fail('REHEARSAL ONLY: the second challenge', o2);
        else {
          const CH2 = o2.body.challenge.challenge_id;
          const up = await decideChallenge(RUN, CH2, { decision: 'upheld', note: 'REHEARSAL ONLY: the model does mishandle the reroute delay' });
          const row = (await q(`select validity, fitness_state, invalidation ->> 'trigger' trigger, invalidation ->> 'trigger_ref' ref from simulation.runs_current where run_id = $1`, [RUN]))[0];
          if (up.ok && up.body.challenge?.state === 'upheld' && up.body.invalidation !== null && row?.validity === 'invalidated' && row.trigger === 'challenge' && row.ref === CH2 && row.fitness_state === 'unfit') ok(`REHEARSAL ONLY: challenge ${short(CH2)} UPHELD by the administrator → run ${short(RUN)} INVALIDATED in the same write (trigger challenge, SIM version ${up.body.invalidation.withdrawnVersion} withdrawn, fitness unfit)`); else bad(`REHEARSAL ONLY: the upheld path: ${up.ok ? JSON.stringify({ body: up.body, row }).slice(0, 300) : refusalLine(up)}`);
          const si = await waitEvent('SimulationInvalidated', { run_id: RUN }, t4e);
          const gi = await waitOutbox('simulation.invalidated', RUN, t4e);
          if (si !== null && gi !== null && si.payload.trigger === 'challenge') { const ds = await settled(gi.id); ok(`REHEARSAL ONLY: SimulationInvalidated (trigger challenge) and GraphChanged/simulation.invalidated published — ${deliveryLine(ds)}`); } else bad(`REHEARSAL ONLY: the invalidation's events: SimulationInvalidated ${si === null ? 'MISSING' : 'published'}, GraphChanged ${gi === null ? 'MISSING' : 'published'}`);
        }
      } else note('the UPHELD path (a challenge upheld → the run invalidated with trigger challenge) is shown on the rehearsal copy only — the demonstration\'s run is never invalidated by the act; the harness T4.6 carries the three outbox rows and the six deliveries');
    }
  }
}

/* ── 5. THE COLD TIER UNREACHABLE ────────────────────────────────────────── */
console.log('\n5. THE COLD TIER UNREACHABLE — a cold NORDWERK record downloaded verified; the archive root\'s marker moved aside by the act itself (three refusals to start; restored whatever ends the process); the record answers metadata-only with its custody row and audit row; a hot record served beside it; the marker restored, the record verified again');
const MARKER = '.eye-vault-root';
/** The vault roots AS THE API RESOLVES THEM (config.ts: a relative root resolves against the WORKSPACE root; the act-b11 idiom) — the rehearsal exports the copy's absolute roots. */
const vaultRoot = (name) => resolvePath(ROOT, env[`EYE_VAULT_${name.toUpperCase()}_ROOT`] ?? `.eye-local/vault/${name}`);
const archiveRoot = vaultRoot('archive');
const marker = join(archiveRoot, MARKER);
const aside = join(dirname(archiveRoot), `${MARKER}.archive-aside`);   // OUTSIDE every root: the roots' parent (B18's placement)
let DEGRADED_EVD = null; let asideNow = false;
const restore = () => { if (asideNow && existsSync(aside)) { renameSync(aside, marker); asideNow = false; console.log(`     the archive root's marker restored (${marker})`); } };
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restore(); process.exit(sig === 'SIGINT' ? 130 : 143); });
{
  note(`the archive root as this act resolves it: ${archiveRoot} (nothing under a root is ever printed)`);
  const cold = (await q(`select o.object_id::text id, m.manifest_id::text manifest_id, m.content_digest, m.byte_length::int byte_length, o.recorded_at
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    where o.tenant_id = $1 and o.domain_id = $2 and o.object_type = 'EVD' and o.lifecycle_state <> 'withdrawn' and observation.manifest_tier(m.manifest_id) = 'archive'
      and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 1`, [T, D]))[0] ?? null;
  const hot = (await q(`select o.object_id::text id, m.manifest_id::text manifest_id, m.content_digest
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
    where o.tenant_id = $1 and o.domain_id = $2 and o.object_type = 'EVD' and o.lifecycle_state <> 'withdrawn' and observation.manifest_tier(m.manifest_id) = 'hot'
      and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 1`, [T, D]))[0] ?? null;
  if (cold === null) bad('no cold (archived, not tombstoned) NORDWERK record in the origin — run the B12 act first; scene 5 is skipped');
  else {
    DEGRADED_EVD = cold.id;
    const degradedBefore = (await q(`select count(*)::int n from observation.custody_events where tenant_id = $1 and domain_id = $2 and event = 'custody.retrieval_degraded'`, [T, D]))[0].n;
    note(`the cold record ${short(cold.id)} (manifest ${short(cold.manifest_id)}, ${cold.byte_length} bytes, recorded ${iso(cold.recorded_at)}); the hot record ${hot === null ? 'NONE' : short(hot.id)}; custody.retrieval_degraded rows in the domain before: ${degradedBefore}`);
    const d0 = await download(cold.id);
    if (d0.ok && d0.body.download?.tier === 'archive' && d0.body.download.availability === 'archived' && d0.body.download.integrity === 'verified' && d0.body.download.contentDigest === cold.content_digest) ok(`A. Hoffmann downloaded the cold record VERIFIED from the archive tier: ${d0.body.download.byteLength} bytes, digest equal — SYNTHETIC`); else bad(`the cold download before: ${d0.ok ? JSON.stringify({ tier: d0.body.download?.tier, availability: d0.body.download?.availability, integrity: d0.body.download?.integrity }) : refusalLine(d0)}`);
    const served = (await q(`select details from observation.custody_events where manifest_id = $1 and event = 'custody.retrieved' order by occurred_at desc limit 1`, [cold.manifest_id]))[0]?.details ?? null;
    if (served?.served_from === 'published') note(`the newest custody.retrieved row: tier ${served.tier}, served_from ${served.served_from}`); else note(`the newest custody.retrieved row: ${JSON.stringify(served)} — the hot copy lingers: the scene's degraded answer is by the tier alone (D2.3 a)`);
    if (hot !== null) { const h0 = await download(hot.id); if (h0.ok && h0.body.download?.integrity === 'verified') ok(`the hot record ${short(hot.id)} downloaded verified (tier ${h0.body.download.tier})`); else bad(`the hot download before: ${h0.ok ? JSON.stringify(h0.body.download).slice(0, 120) : refusalLine(h0)}`); }
    // THREE REFUSALS TO START: the marker must read 'archive'; no aside file may exist (a previous run stopped mid-scene — restored by hand first, the runbook §8); the API must report the root reachable now.
    let start = true;
    if (!existsSync(marker) || readFileSync(marker, 'utf8').trim() !== 'archive') { bad(`the archive root's marker is not the product's (${marker}); the scene does not start`); start = false; }
    if (existsSync(aside)) { bad(`a marker is already aside at ${aside}: a previous run stopped mid-scene; restore it by hand (mv) before running; the scene does not start`); start = false; }
    const stateBefore = start ? await tierState() : null;
    if (start && stateBefore?.vault?.archive?.reachable !== true) { bad(`the API does not report the archive root reachable before the scene (${JSON.stringify(stateBefore?.vault?.archive ?? null)}) — the act and the API must name the same root; the scene does not start`); start = false; }
    if (start) {
      const shaBefore = createHash('sha256').update(readFileSync(marker)).digest('hex');
      note(`the marker's sha256 before: ${shaBefore.slice(0, 16)}…; tier/state before: archive reachable ${stateBefore.vault.archive.reachable} (blobs ${stateBefore.vault.archive.blobs}), evidence reachable ${stateBefore.vault.evidence.reachable}`);
      const t5 = Date.now();
      try {
        renameSync(marker, aside); asideNow = true;
        console.log('     the archive root of the demonstration\'s vault is now unreachable by the product\'s own definition (B18: its marker cannot be read) — standing in for an unmounted cold volume; nothing under the root moved');
        const st = await tierState();
        if (st !== null && st.vault?.archive?.reachable === false && st.vault?.evidence?.reachable === true) ok(`tier/state: archive reachable false, evidence reachable true (the inventory still lists: blobs ${st.vault.archive.blobs} — the marker is the rule; an unmounted volume would read zeros)`); else bad(`tier/state while aside: ${JSON.stringify(st?.vault ?? null)}`);
        const d1 = await download(cold.id);
        if (d1.ok && d1.body.download?.base64 === null && d1.body.download.integrity === 'unavailable' && d1.body.download.availability === 'unreachable' && d1.body.download.tier === 'archive' && d1.body.download.degraded?.kind === 'tier_unreachable' && d1.body.download.degraded.code === 'EYE-DEG-001' && d1.body.download.degraded.root === 'archive' && d1.body.download.contentDigest === cold.content_digest && d1.body.download.byteLength === cold.byte_length) {
          ok(`the cold record answers 200 METADATA-ONLY: base64 null, integrity unavailable, availability unreachable, tier archive, the manifest's digest and ${d1.body.download.byteLength} bytes, degraded { tier_unreachable, EYE-DEG-001, root archive }`);
          note(`the label, verbatim: ${d1.body.download.degraded.label}`);
          const aud = (await q(`select outcome, result_code from audit.audit_events where audit_seq = $1`, [d1.body.receipt?.auditSeq]))[0] ?? null;
          if (aud?.outcome === 'success' && aud.result_code === 'EYE-DEG-001') ok(`the audit row (seq ${d1.body.receipt.auditSeq}): success / EYE-DEG-001`); else bad(`the audit row: ${JSON.stringify(aud)}`);
          const cus = (await q(`select event, digest_verified, details from observation.custody_events where manifest_id = $1 order by occurred_at desc limit 1`, [cold.manifest_id]))[0] ?? null;
          if (cus?.event === 'custody.retrieval_degraded' && cus.digest_verified === null && cus.details?.failure === 'root_unreachable' && cus.details?.root === 'archive' && cus.details?.tier === 'archive' && cus.details?.disclosure === 'none') ok(`the custody chain's newest row: custody.retrieval_degraded { failure root_unreachable, root archive, tier archive, disclosure none }, digest_verified null`); else bad(`the newest custody row: ${JSON.stringify(cus)}`);
        } else bad(`the cold download while aside: ${d1.ok ? JSON.stringify(d1.body.download).slice(0, 300) : refusalLine(d1)}`);
        const inc = (await q(`select count(*)::int n from observation.custody_events where manifest_id = $1 and event = 'custody.integrity_failed' and occurred_at >= $2`, [cold.manifest_id, new Date(t5 - 1000)]))[0].n;
        if (Number(inc) === 0) ok('no custody.integrity_failed row for the cold record since the scene began: an unreachable root is never an integrity incident'); else bad(`${inc} integrity incident(s) recorded for the cold record`);
        const dt = await detail(cold.id);
        if (dt.ok && dt.body.availability?.tier === 'archive' && dt.body.availability?.state === 'archived' && (dt.body.custody ?? []).some((c) => c.event === 'custody.retrieval_degraded')) ok(`the detail route serves the metadata tier untouched: availability { tier archive, state archived }, the custody chain carrying the degraded read`); else bad(`the detail while aside: ${dt.ok ? JSON.stringify({ availability: dt.body.availability, custody: (dt.body.custody ?? []).length }) : refusalLine(dt)}`);
        if (hot !== null) { const h1 = await download(hot.id); if (h1.ok && h1.body.download?.integrity === 'verified' && h1.body.download.availability === 'verified') ok(`the hot record ${short(hot.id)} served verified in the same window (the evidence root is reachable)`); else bad(`the hot download while aside: ${h1.ok ? JSON.stringify(h1.body.download).slice(0, 120) : refusalLine(h1)}`); }
        note('S. Okafor\'s briefing and L. Brandt\'s memory retrieval are not exercised: no memory path reads vault bytes (memory.service.ts derives from the payload\'s digest)');
        // THE CONSUMERS and THE SCHEDULER, observed: a registered series with an archived window; the polls' unverifiable confirmations — expected none on the demonstration.
        const series = (await q(`select distinct s.series_key from prediction.series s join observation.source_contracts_current c on c.source_key = s.source_key join observation.blob_manifests m on m.source_id = c.source_id where s.tenant_id = $1 and s.domain_id = $2 and observation.manifest_tier(m.manifest_id) = 'archive'`, [T, D]).catch(() => []));
        if (series.length === 0) note('no registered series has an archived window on the demonstration (PortWatch\'s evidence is hot): the series and extraction disclosures are V4 on the harness');
        else note(`registered series with an archived window: ${series.map((s) => s.series_key).join(', ')} — their reads would disclose the window as degraded (EYE-DEG-001); not read here (A. Hoffmann reads evidence, not series, in this scene)`);
        const polls = await q(`select event, details ->> 'availability' availability from observation.collection_run_events where tenant_id = $1 and occurred_at >= $2 and details ->> 'availability' = 'unverifiable'`, [T, new Date(t5 - 1000)]);
        if (polls.length === 0) note('the scheduler, observed: no poll confirmed by an unverifiable held record in the window (no scheduled source\'s held evidence is archived on the demonstration)'); else note(`the scheduler, observed: ${polls.length} unverifiable confirmation(s) (D2.9\'s honest noop)`);
      } finally { restore(); }
      const shaAfter = existsSync(marker) ? createHash('sha256').update(readFileSync(marker)).digest('hex') : null;
      if (shaAfter === shaBefore && readFileSync(marker, 'utf8').trim() === 'archive') ok(`the marker restored byte-identical (sha256 ${shaAfter.slice(0, 16)}…)`); else bad(`the marker after: ${shaAfter === null ? 'MISSING' : `sha256 ${shaAfter.slice(0, 16)}… (before ${shaBefore.slice(0, 16)}…)`}`);
      const stAfter = await tierState();
      if (stAfter?.vault?.archive?.reachable === true) ok('tier/state: archive reachable true again'); else bad(`tier/state after: ${JSON.stringify(stAfter?.vault ?? null)}`);
      const d2 = await download(cold.id);
      if (d2.ok && d2.body.download?.integrity === 'verified' && d2.body.download.availability === 'archived' && d2.body.download.contentDigest === cold.content_digest) ok('the cold record verified again after the restore, the digest equal'); else bad(`the cold download after: ${d2.ok ? JSON.stringify(d2.body.download).slice(0, 120) : refusalLine(d2)}`);
      const chain = (await q(`select event from observation.custody_events where manifest_id = $1 and occurred_at >= $2 order by occurred_at, event_id`, [cold.manifest_id, new Date(t5 - 60_000)])).map((r) => r.event);
      const degradedAfter = (await q(`select count(*)::int n from observation.custody_events where tenant_id = $1 and domain_id = $2 and event = 'custody.retrieval_degraded'`, [T, D]))[0].n;
      if (chain.slice(-3).join(',') === 'custody.retrieved,custody.retrieval_degraded,custody.retrieved' && Number(degradedAfter) === Number(degradedBefore) + 1) ok(`the chain of this scene: [${chain.join(', ')}]; the domain's custody.retrieval_degraded rows ${degradedBefore} → ${degradedAfter} (the act read the cold record ONCE while aside)`); else bad(`the chain: [${chain.join(', ')}]; degraded rows ${degradedBefore} → ${degradedAfter}`);
    }
  }
}

/* ── 6. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n6. THE STATE — the four objects\' states, the register, the subscriptions, what the act leaves, the stated limits');
await registerLine('after');
{
  const twinState = TW === null ? '—' : (await q(`select version::int, fitness_state from twin.twin_versions where twin_id = $1 order by version`, [TW])).map((v) => `v${v.version} ${v.fitness_state}`).join(', ');
  const fct = F === null ? '—' : (await q(`select fitness_state, fitness_class, state from prediction.forecasts_current where forecast_id = $1`, [F]))[0];
  const scn = SDUP === null ? '—' : `${short(SDUP)} ${JSON.stringify((await q(`select state, coherence_state from prediction.scenarios_current where scenario_id = $1`, [SDUP]))[0])}, successor ${short(SOK)} ${JSON.stringify((await q(`select state, coherence_state from prediction.scenarios_current where scenario_id = $1`, [SOK]))[0] ?? null)}`;
  const runs = RUN === null ? '—' : (await q(`select run_id::text id, validity, fitness_state, promoted_for from simulation.runs_current where run_id = any($1::uuid[]) order by opened_at`, [[RUN, RERUN, PROMOTED].filter((x) => x !== null)])).map((r) => `${short(r.id)} ${r.validity} fitness ${r.fitness_state}${r.promoted_for ? ` (${r.promoted_for})` : ''}`).join('; ');
  const subsNow = await q(`select consumer_kind, status, checkpoint_seq::int cs from graph.subscriptions where tenant_id = $1 and domain_id = $2 and status = 'active' order by consumer_kind`, [T, D]);
  const challenges = RUN === null ? [] : await q(`select state from simulation.challenges where run_id = $1 order by opened_at`, [RUN]);
  note(`the twin ${short(TW)}: ${twinState}; the forecast ${short(F)}: ${fct === '—' ? '—' : `${fct.state}, fitness ${fct.fitness_state}${fct.fitness_class ? ` (${fct.fitness_class})` : ''}`}; the scenarios: ${scn}; the runs: ${runs}; the challenges on ${short(RUN)}: ${challenges.map((c) => c.state).join(', ') || 'none'}`);
  note(`the subscriptions of the origin: ${subsNow.map((s) => `${s.consumer_kind}@${s.cs ?? 'none'}`).join(', ')}`);
  note(`WHAT THE ACT LEAVES: one validation (fit), one assessment (${FITNESS ?? '—'}), two scenarios (one retired), ${challenges.length} challenge(s) on the disputed run (${REHEARSAL ? 'dismissed + upheld — REHEARSAL' : 'dismissed'}), one re-run, one promotion, one custody.retrieval_degraded row on ${short(DEGRADED_EVD)} with two custody.retrieved rows beside it; the three re-registered subscriptions; nothing retired; nothing withdrawn on the demonstration; no persona created; the archive root's marker back in place`);
}
note('STATED: no forecast scheduler or re-issue exists (the assessment is event-driven; an expired daily cadence reads envelope_breach honestly); the fitness rules are versioned constants over the ledgers this product holds — not bias tests, expert review or alternative assumptions; the series-length breach is not detected; the twin\'s calibration history is the reconciliation ledger and "domain validation on representative data" is not a harness; the envelope covers the keys the model declares (horizon_days checked at open_run; a model with no ranges validates unchecked); coherence is structural over the fields the product holds (a free-text assumption is noted, never judged; distinctiveness, relevance, bias and sensitivity are not computed); no branch suspension, no add-branch or close-branch command (retire + a successor); the challenge re-run is a governed run, never an in-process re-execution; no frequency-to-probability mapping; no decision gate on unpromoted runs; the challenge DISPOSITION on a delivery is not produced; no outbox event for a promotion; the outside-envelope run and the upheld path are harness / rehearsal cases; a fitness or coherence failure reaches no briefing');
note('STATED (the cold tier): a metadata-only answer for a PER-OBJECT missing or corrupt read is never given (A7 — one 409, one custody.integrity_failed row, no disclosure; the metadata is the detail route\'s); the class is decided BEFORE the read by the primary root\'s marker alone (a fallback root\'s state never re-classifies); reachability is the marker\'s readability — the moved marker is an honest stand-in for an unmounted volume; the quarantine root has no marker; /readyz does not probe the vault roots (tier/state says reachable); one custody.retrieval_degraded row per read; the twin\'s disclosure is the series\' refused string verbatim (V4 on the harness)');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: the four foresight objects of this product now carry ONE fitness vocabulary set only by a recorded act whose measures the port computes — the administrator validated T. Nakamura's twin fit over the envelope the port computed (T. Nakamura himself refused by the separation of duties) and the run that followed carried the verdict and its envelope state; N. Eriksen's assessment of the corridor forecast answered what the rule says over a thin ledger and the lapsed cadence, and where it said unfit the scenarios resting on it were marked and re-checked and the packages citing it noted; J. Weber's duplicated branch was ADMITTED incoherent, refused for simulation and retired for a successor that passed; J. Weber's dispute of the reroute was re-run under governance, compared on the common control and dismissed by the administrator, who then promoted the control fit for the routing decision; and the cold tier, made unreachable by the product's own definition, answered the NORDWERK record's metadata with its custody row and no integrity incident, then served the bytes again once mounted.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-fitness-b21, phase6-evidence-degradation-b21, phase6-graph-projections-b21 on fresh databases): the outside-envelope run refused, refused for a simulation operator's acknowledgement and admitted under a twin owner's; the calibration-failure family across eleven scored forecasts with the six deliveries; data shift through a real GraphChanged; the outcome write's skips of a withdrawn and a superseded forecast; the coherence rules one by one and the warning gate; the upheld challenge invalidating its run in the same write with the withdrawn SIM version and the citation gate; Class A pinned through the route beside Class B on both roots, the series reader, the extraction, the verifier and the poll; Codex's B20-F1 rows through HTTP.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
