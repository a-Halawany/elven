/**
 * SIMULATIONS — Phase 5 (L8), stage P5-M3, corrected against the Codex review of f66a958d.
 *
 * A run is opened (the contract is bound and the initial state snapshotted in the
 * port), executed from THAT snapshot by the pinned implementation, and completed
 * (outputs and their digest bound, the SIM canonical object admitted as
 * synthetic). The contract binds the exact scenario version and branch the run
 * applies — a shock has a BASIS: the bound branch is flipped, or the operator
 * asserted a hypothetical and it is recorded as one. A run reads the SELECTED
 * component's inputs, under two cut-offs, and refuses what is not usable.
 *
 * Reproduction is executed BY THE PRODUCT in a separate process from the stored
 * contract — never from the twin as it stands, never on the caller's word — after
 * establishing that every artefact the run rests on is still available to this
 * reader under current policy, withdrawal and deletion controls. Otherwise the
 * run is `unreproducible` for them, and says why.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalHeaderDigest, errorBody, jcsCanonicalize, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { SeriesService, type Reader } from '../../prediction/series/series.service.js';
import { controlsOf, foldControls, type ControlInput, type Controls } from '../../prediction/controls.js';
import { simulateSupplyFlow, validateParams, SUPPLY_FLOW_METHOD_REF, RNG_ALGORITHM, type Intervention, type SupplyFlowOptions, type SupplyFlowParams, type SupplyFlowOutputs } from '../models/supply-flow.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../models/supply-flow.digest.js';
import type { CompleteWrites, OpenedRun, ReproduceWrites, RunWrites, ShockBasis, SimulationReads } from '../simulation.capabilities.js';
import type { Citation } from '../twin.capabilities.js';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const digestOf = (v: unknown): string => sha256(jcsCanonicalize(v));

export interface RunIntake {
  twinId: string; twinVersion: number; runKind: 'control' | 'intervention'; controlRunId: string | null; correctsRunId: string | null;
  scenarioId: string | null; scenarioBranchId: string | null; shock: boolean; component: string;
  interventions: Intervention[]; horizonDays: number;
  stochastic: { mode: 'deterministic' } | { mode: 'seeded'; seed: number; samples: number; jitter: Record<string, number> };
  sensitivityRelative: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateRunIntake(m: Record<string, unknown>, correlationId: string): RunIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (typeof m['twinId'] !== 'string' || !UUID.test(m['twinId'])) bad('twinId must be a twin id');
  if (!Number.isInteger(m['twinVersion']) || (m['twinVersion'] as number) < 1) bad('twinVersion must be a positive integer');
  const runKind = m['runKind'] as 'control' | 'intervention';
  if (runKind !== 'control' && runKind !== 'intervention') bad("runKind must be 'control' or 'intervention'");
  const controlRunId = m['controlRunId'] ?? null;
  if (runKind === 'control' && controlRunId !== null) bad('a control run references no control (control_run_id must be null)');
  if (runKind === 'intervention' && (typeof controlRunId !== 'string' || !UUID.test(controlRunId))) bad('an intervention run must reference a completed control run');
  if (typeof m['component'] !== 'string' || m['component'].length < 2) bad('component is required');
  if (typeof m['shock'] !== 'boolean') bad('shock must be declared true or false; a shock has a basis — the bound scenario branch is flipped, or it is a hypothetical the run says so');
  const scenarioId = typeof m['scenarioId'] === 'string' ? m['scenarioId'] : null;
  const scenarioBranchId = typeof m['scenarioBranchId'] === 'string' ? m['scenarioBranchId'] : null;
  if (scenarioId !== null && !UUID.test(scenarioId)) bad('scenarioId must be a scenario id');
  if (scenarioBranchId !== null && !UUID.test(scenarioBranchId)) bad('scenarioBranchId must be a branch id');
  if ((scenarioId === null) !== (scenarioBranchId === null)) bad('a scenario is bound with its branch: name both scenarioId and scenarioBranchId, or neither');
  const interventions = Array.isArray(m['interventions']) ? (m['interventions'] as Intervention[]) : bad('interventions must be an array; `none` is an intervention');
  if (runKind === 'control' && (interventions.length !== 1 || interventions[0]?.type !== 'none')) bad("a control run's only intervention is { type: 'none' }");
  if (runKind === 'intervention' && interventions.some((i) => i.type === 'none')) bad("an intervention run does not list 'none'");
  const horizonDays = m['horizonDays'];
  if (!Number.isInteger(horizonDays) || (horizonDays as number) < 1 || (horizonDays as number) > 365) bad('horizonDays must be an integer in [1, 365]');
  const st = (m['stochastic'] ?? { mode: 'deterministic' }) as Record<string, unknown>;
  let stochastic: RunIntake['stochastic'];
  if (st['mode'] === 'deterministic') stochastic = { mode: 'deterministic' };
  else if (st['mode'] === 'seeded') {
    if (!Number.isInteger(st['seed'])) bad('a seeded run declares an integer seed');
    if (!Number.isInteger(st['samples']) || (st['samples'] as number) < 1) bad('a seeded run declares its sample count');
    if (typeof st['jitter'] !== 'object' || st['jitter'] === null) bad('a seeded run declares its jitter distribution');
    stochastic = { mode: 'seeded', seed: st['seed'] as number, samples: st['samples'] as number, jitter: st['jitter'] as Record<string, number> };
  } else return bad("stochastic.mode must be 'deterministic' or 'seeded'; an unseeded stochastic run is refused");
  const rel = typeof m['sensitivityRelative'] === 'number' ? m['sensitivityRelative'] : 0.2;
  if (rel <= 0 || rel > 1) bad('sensitivityRelative must be in (0, 1]');
  return {
    twinId: m['twinId'] as string, twinVersion: m['twinVersion'] as number, runKind, controlRunId: controlRunId as string | null,
    correctsRunId: typeof m['correctsRunId'] === 'string' ? m['correctsRunId'] : null,
    scenarioId, scenarioBranchId,
    shock: m['shock'] as boolean, component: m['component'] as string, interventions, horizonDays: horizonDays as number, stochastic, sensitivityRelative: rel,
  };
}

/** The runtime this process is: what a reproduction compares itself against. */
export function environmentOf(): { node: string; platform: string; arch: string; model_ref: string; implementation_digest: string } {
  return { node: process.version, platform: process.platform, arch: process.arch, model_ref: SUPPLY_FLOW_METHOD_REF, implementation_digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST };
}

interface Snapshot { key: string; kind: string; value: unknown; unit: string | null; valid_from: string | null; material: boolean; health: string; inherited_validation?: string | null; citations?: Citation[] }

/**
 * The twin's snapshot → the model's parameters, for ONE component. Only a COMPLETE
 * element is usable: a stale, unreadable or incomplete input is a problem the run
 * names, never a number it consumes — and a healthy element of ANOTHER component
 * never stands in for it. Nothing here is a literal about the world.
 */
export function paramsFromSnapshot(snapshot: Snapshot[], component: string): { params: SupplyFlowParams; assumptions: Record<string, unknown>; problems: string[] } {
  const byKey = new Map(snapshot.map((e) => [e.key, e]));
  const problems: string[] = [];
  const usable = (e: Snapshot | undefined, name: string): Snapshot | undefined => {
    if (e === undefined) return undefined;
    if ((e.health ?? 'complete') !== 'complete') { problems.push(`${e.key} is ${e.health}, not usable for ${name}`); return undefined; }
    return e;
  };
  const pick = (base: string, suffix: string | null): Snapshot | undefined => {
    const name = suffix === null ? base : `${base}:${suffix}`;
    const own = byKey.get(name);
    if (own !== undefined || suffix === null) return usable(own, name);
    return usable(byKey.get(base), name);
  };
  const num = (base: string, suffix: string | null): number => {
    const e = pick(base, suffix);
    if (e === undefined) { if (!problems.some((p) => p.startsWith(`${base}${suffix === null ? '' : `:${suffix}`} is`))) problems.push(`${base}${suffix === null ? '' : `:${suffix}`} is not in the twin`); return NaN; }
    const v = typeof e.value === 'string' ? Number(e.value) : (e.value as number);
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${e.key} is not numeric`);
    return v;
  };
  const inv = pick('inventory.on_hand', component);
  const t0 = inv?.valid_from ?? null;
  if (inv !== undefined && t0 === null) problems.push(`inventory.on_hand:${component} carries no valid_from; t0 is undefined`);
  const shipments = snapshot.filter((e) => e.key.startsWith('shipment:')).map((e) => {
    const v = e.value as Record<string, unknown>;
    return { id: e.key.slice('shipment:'.length), qty: Number(v['qty']), eta_port: String(v['eta_port']), position: String(v['position']), status: String(v['status']),
             component: typeof v['component'] === 'string' ? v['component'] : component, health: e.health ?? 'complete' };
  }).filter((s) => s.component === component);
  for (const s of shipments) if (s.health !== 'complete') problems.push(`shipment:${s.id} is ${s.health}, not usable`);
  const shipmentParams = shipments.filter((s) => s.health === 'complete').map(({ component: _c, health: _h, ...s }) => s);
  const lineKey = [...byKey.keys()].find((k) => k.startsWith('terms.line_stop_cost_per_day')) ?? 'terms.line_stop_cost_per_day';
  const policyEl = pick('production.policy', component);
  const params: SupplyFlowParams = {
    component, t0: t0 ?? '1970-01-01', on_hand: num('inventory.on_hand', component), safety_stock: num('inventory.safety_stock', component),
    weekly_consumption: num('consumption.weekly', component), shipments: shipmentParams, inland_days: num('route.inland_days', null), reroute_delay_days: num('route.reroute_delay_days', null),
    reroute_cost_per_container: num('terms.reroute_cost_per_container', null), units_per_container: num('terms.units_per_container', component),
    air_cost_per_kg: num('terms.air_cost_per_kg', null), kg_per_unit: num('terms.kg_per_unit', component), air_lead_days: num('terms.air_lead_days', null),
    line_stop_cost_per_day: (() => { const e = usable(byKey.get(lineKey), lineKey); const v = e === undefined ? NaN : Number(e.value); if (byKey.get(lineKey) === undefined) problems.push('terms.line_stop_cost_per_day is not in the twin'); return v; })(),
    corridor_delay_days: num('shock.corridor_delay_days', null),
    production_policy: (policyEl?.value === 'consume_to_zero' ? 'consume_to_zero' : 'hold_safety_stock'),
  };
  if (policyEl === undefined && byKey.get(`production.policy:${component}`) === undefined && byKey.get('production.policy') === undefined) problems.push(`production.policy:${component} is not in the twin`);
  // The ASSUMED elements the run rests on, by key — what sensitivity perturbs and what compatibility compares.
  const assumptions: Record<string, unknown> = {};
  for (const e of snapshot) if (e.kind === 'assumed') assumptions[e.key] = e.value;
  return { params, assumptions, problems };
}

/** One-at-a-time sensitivity over numeric assumed elements: perturb each by ±relative, report the deltas, mark envelope breaches. */
export function sensitivityOf(params: SupplyFlowParams, options: SupplyFlowOptions, interventions: Intervention[], assumptions: Record<string, unknown>, relative: number,
                              envelope: Record<string, unknown>): { relative: number; base: { line_stop_days: number; total_cost: string }; factors: Array<Record<string, unknown>>; outside_envelope: boolean } {
  const base = simulateSupplyFlow(params, options, interventions);
  const map: Array<[string, keyof SupplyFlowParams]> = [
    ['route.inland_days', 'inland_days'], ['route.reroute_delay_days', 'reroute_delay_days'], ['terms.reroute_cost_per_container', 'reroute_cost_per_container'],
    ['terms.units_per_container', 'units_per_container'], ['terms.air_cost_per_kg', 'air_cost_per_kg'], ['terms.kg_per_unit', 'kg_per_unit'],
    ['terms.air_lead_days', 'air_lead_days'], ['terms.line_stop_cost_per_day', 'line_stop_cost_per_day'], ['shock.corridor_delay_days', 'corridor_delay_days'],
    ['consumption.weekly', 'weekly_consumption'], ['inventory.safety_stock', 'safety_stock'],
  ];
  const factors: Array<Record<string, unknown>> = [];
  let outside = false;
  for (const [prefix, field] of map) {
    const key = Object.keys(assumptions).find((k) => k === prefix || k.startsWith(`${prefix}:`));
    if (key === undefined) continue;
    const baseValue = params[field] as number;
    const rows: Array<Record<string, unknown>> = [];
    for (const dir of [-1, 1]) {
      const raw = baseValue * (1 + dir * relative);
      const value = ['inland_days', 'reroute_delay_days', 'air_lead_days', 'corridor_delay_days'].includes(field) ? Math.round(raw) : raw;
      const range = envelope[field] ?? envelope[prefix];
      const breach = Array.isArray(range) && (value < Number(range[0]) || value > Number(range[1]));
      if (breach) outside = true;
      const out = simulateSupplyFlow({ ...params, [field]: value }, options, interventions);
      rows.push({ direction: dir < 0 ? '-' : '+', value, line_stop_days: out.totals.line_stop_days, total_cost: out.totals.cost.total,
                  delta_line_stop_days: out.totals.line_stop_days - base.totals.line_stop_days,
                  delta_total_cost: (Number(out.totals.cost.total) - Number(base.totals.cost.total)).toFixed(2), outside_envelope: breach });
    }
    const spread = Math.max(...rows.map((r) => Math.abs(Number(r['delta_total_cost']))));
    factors.push({ key, field, base_value: baseValue, perturbations: rows, cost_spread: spread.toFixed(2) });
  }
  factors.sort((a, b) => Number(b['cost_spread']) - Number(a['cost_spread']));
  return { relative, base: { line_stop_days: base.totals.line_stop_days, total_cost: base.totals.cost.total }, factors, outside_envelope: outside };
}

/** The scenario binding a run applies, resolved from the authorized tree at opening. */
interface ScenarioBinding { scenarioId: string; version: number; branchId: string; branchState: string; flipEventId: string | null; controls: ControlInput | null }

@Injectable()
export class SimulationService {
  constructor(private readonly series: SeriesService) {}

  /** Bind the contract and snapshot the initial state (governed write: `simulation.run`). */
  async open(cap: RunWrites, ctx: ScopeContext, intake: RunIntake, actor: string, correlationId: string, runId: string = newId()):
    Promise<{ runId: string; opened: OpenedRun; params: SupplyFlowParams; options: SupplyFlowOptions; assumptions: Record<string, unknown>; envelope: Record<string, unknown> }> {
    const twin = (await cap.readTwins().selectAll().where('twin_id' as never, '=', intake.twinId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (twin === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized twin matches'), 404);
    const modelRef = String(twin['behaviour_model_ref']);
    if (modelRef !== SUPPLY_FLOW_METHOD_REF) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `no implementation is pinned for ${modelRef}`), 422);
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', modelRef as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const envelope = (model?.['operating_envelope'] ?? {}) as Record<string, unknown>;
    // The snapshot the port will take is the admitted version's element set; read it here only to derive parameters and refuse early.
    const version = (await cap.readVersions().selectAll().where('twin_id' as never, '=', intake.twinId as never).where('version' as never, '=', intake.twinVersion as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (version === undefined || version['state'] !== 'admitted') throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${intake.twinVersion} is not an admitted version of this twin`), 409);
    if (version['completeness'] !== 'complete') {
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `twin version ${intake.twinVersion} is incomplete (${JSON.stringify(version['missing_keys'])}); a run cannot use inputs the twin does not hold`), 409);
    }
    if (version['observed_through'] === null || version['observed_through'] === undefined) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `twin version ${intake.twinVersion} has no world-time cut-off (observed_through); a run reads the twin under two cut-offs and this version names only one`), 409);
    }
    /*
     * THE SCENARIO IS RESOLVED AND BOUND. A shock's basis is the bound branch's state at
     * opening — flipped, or it is not a shock the scenario supports. A shock with no
     * scenario is a HYPOTHETICAL: recorded as such, never as an observed flip.
     */
    let scenario: ScenarioBinding | null = null;
    if (intake.scenarioId !== null && intake.scenarioBranchId !== null) {
      const scn = (await cap.readScenarios().selectAll().where('scenario_id' as never, '=', intake.scenarioId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (scn === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `scenario ${intake.scenarioId} is not an authorized scenario in this domain`), 404);
      const branch = (await cap.readBranches().selectAll().where('branch_id' as never, '=', intake.scenarioBranchId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (branch === undefined || String(branch['scenario_id']) !== intake.scenarioId) {
        throw new HttpException(errorBody('EYE_REQ_001', correlationId, `branch ${intake.scenarioBranchId} is not a branch of scenario ${intake.scenarioId}`), 422);
      }
      const state = String(branch['state']);
      if (intake.shock !== (state === 'flipped')) {
        throw new HttpException(errorBody('EYE_REQ_001', correlationId,
          intake.shock ? `the shock contradicts the bound branch: branch "${String(branch['name'])}" is ${state}, not flipped — a shock without a flipped branch is a hypothetical and names no scenario`
                       : `the bound branch "${String(branch['name'])}" is flipped; a run on it applies the shock (shock: true) or names no scenario`), 422);
      }
      const obj = await cap.citedObject({ objectType: 'SCN', id: intake.scenarioId, version: null });
      if (obj === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `scenario ${intake.scenarioId} has no authorized canonical version`), 404);
      scenario = { scenarioId: intake.scenarioId, version: obj.object_version, branchId: intake.scenarioBranchId, branchState: state,
                   flipEventId: branch['flip_event_id'] === null || branch['flip_event_id'] === undefined ? null : String(branch['flip_event_id']),
                   controls: { synthetic_state: obj.synthetic_state, classification: obj.classification, rights_profile: obj.rights_profile,
                               residency_profile: obj.residency_profile, retention_profile: obj.retention_profile, access_policy_ref: obj.access_policy_ref } };
    }
    const shockBasis: ShockBasis = !intake.shock ? 'none' : (scenario === null ? 'hypothetical' : 'scenario-branch-flipped');
    // CONTROLS fold from the twin version and the scenario into the run (rule 7).
    const twinControls = controlsOf(version['controls']) ?? { synthetic_state: version['synthetic_state'] === true, classification: 'restricted' };
    const controls: Controls = foldControls(scenario === null || scenario.controls === null ? [twinControls] : [twinControls, scenario.controls]);
    const environment = environmentOf();
    const environmentDigest = digestOf(environment);
    const stochastic: SupplyFlowOptions['stochastic'] = intake.stochastic.mode === 'seeded'
      ? { mode: 'seeded', seed: intake.stochastic.seed, samples: intake.stochastic.samples, jitter: intake.stochastic.jitter } : { mode: 'deterministic' };
    const options: SupplyFlowOptions = { horizon_days: intake.horizonDays, shock: intake.shock, stochastic };
    const constraints = { horizon_days: intake.horizonDays, sensitivity_relative: intake.sensitivityRelative, single_component: intake.component };
    const scenarioBinding = scenario === null ? null : { scenario_id: scenario.scenarioId, version: scenario.version, branch_id: scenario.branchId, branch_state: scenario.branchState, flip_event_id: scenario.flipEventId };
    // Open: the port snapshots the state set and checks compatibility. Parameters are derived from the SNAPSHOT it returns.
    const provisionalInputs = digestOf({ twin: [intake.twinId, intake.twinVersion], model: [modelRef, SUPPLY_FLOW_IMPLEMENTATION_DIGEST], environment: environmentDigest,
      interventions: intake.interventions, constraints, stochastic, shock: intake.shock, shock_basis: shockBasis, scenario: scenarioBinding,
      component: intake.component, run_kind: intake.runKind, control: intake.controlRunId });
    // Derive the assumptions the port compares (they come from the element set; identical to the snapshot the port takes in this transaction).
    const elements = await this.elements(cap, intake.twinId, intake.twinVersion);
    const derived = paramsFromSnapshot(elements, intake.component);
    if (derived.problems.length > 0) throw new HttpException(errorBody('EYE_STA_001', correlationId, `the twin does not hold what the model needs for ${intake.component}: ${derived.problems.join('; ')}`), 409);
    const problems = validateParams(derived.params, options, intake.interventions);
    if (problems.length > 0) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `supply-flow@1 contract invalid: ${problems.join('; ')}`), 422);
    const inputsDigest = digestOf({ provisional: provisionalInputs, assumptions: derived.assumptions });
    // VALIDATION STATUS: the twin's declared status, then every predicted input's inherited state, by name.
    const inherited = elements.filter((e) => e.kind === 'predicted' && e.inherited_validation).map((e) => ({
      key: e.key, forecast: (e.citations ?? []).filter((c) => c.kind === 'forecast').map((c) => `FCT:${c.id}@${c.version}`).join(','), state: String(e.inherited_validation) }));
    const validationStatus = `${String(twin['validation'] && (twin['validation'] as Record<string, unknown>)['status'])}`
      + (inherited.length === 0 ? '' : `; predicted inputs: ${inherited.map((i) => `${i.key} rests on ${i.forecast} (${i.state})`).join('; ')}`)
      + (shockBasis === 'hypothetical' ? '; the shock is HYPOTHETICAL (no scenario branch supports it)' : '')
      + '; outputs are SYNTHETIC';
    const opened = await cap.openRun({
      runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, twinId: intake.twinId, twinVersion: intake.twinVersion, runKind: intake.runKind,
      controlRunId: intake.controlRunId, correctsRunId: intake.correctsRunId,
      scenarioId: scenario?.scenarioId ?? null, scenarioBranchId: scenario?.branchId ?? null, scenarioVersion: scenario?.version ?? null, scenarioBranchState: scenario?.branchState ?? null,
      shock: intake.shock, shockBasis, component: intake.component, modelRef, implementationDigest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, environmentDigest, environment,
      stochasticMode: stochastic.mode, rng: stochastic.mode === 'seeded' ? RNG_ALGORITHM : null, seed: stochastic.mode === 'seeded' ? stochastic.seed : null,
      samples: stochastic.mode === 'seeded' ? stochastic.samples : null, jitter: stochastic.mode === 'seeded' ? stochastic.jitter : null,
      interventions: intake.interventions, constraints, assumptions: derived.assumptions, inputsDigest, validationStatus, controls, actor, eventId: newId(), correlationId,
    });
    return { runId, opened, params: derived.params, options, assumptions: derived.assumptions, envelope };
  }

  private async elements(cap: SimulationReads, twinId: string, version: number): Promise<Snapshot[]> {
    const rows = (await cap.readElements().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    return rows.map((e) => ({ key: String(e['key']), kind: String(e['kind']), value: e['value'], unit: e['unit'] === null ? null : String(e['unit']),
      valid_from: e['valid_from'] === null || e['valid_from'] === undefined ? null : dayOf(e['valid_from']), material: e['material'] === true,
      health: String(e['health'] ?? 'complete'), inherited_validation: e['inherited_validation'] === undefined ? null : (e['inherited_validation'] as string | null),
      citations: (e['citations'] as Citation[] | undefined) ?? [] }));
  }

  /** Execute from the stored contract and COMPLETE (governed write: `simulation.run.complete`; admits the SIM object). */
  async complete(cap: CompleteWrites, ctx: ScopeContext, runId: string, purposeId: string, actor: string, correlationId: string):
    Promise<{ runId: string; outputsDigest: string; totals: unknown; sensitivity: unknown; outsideEnvelope: boolean }> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    if (r['state'] !== 'opened') throw new HttpException(errorBody('EYE_STA_001', correlationId, `run ${runId} is ${String(r['state'])} and immutable`), 409);
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', r['model_ref'] as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const contract = contractOf(r);
    try {
      const outputs = simulateSupplyFlow(contract.params, contract.options, contract.interventions);
      const outputsDigest = digestOf(outputs);
      const sensitivity = sensitivityOf(contract.params, contract.options, contract.interventions, contract.assumptions, contract.sensitivityRelative,
        (model?.['operating_envelope'] ?? {}) as Record<string, unknown>);
      const controls = foldControls([controlsOf(r['controls']) ?? { synthetic_state: true, classification: 'restricted' }]);
      const now = new Date().toISOString();
      const scenarioId = r['scenario_id'] === null || r['scenario_id'] === undefined ? null : String(r['scenario_id']);
      const scenarioVersion = r['scenario_version'] === null || r['scenario_version'] === undefined ? null : Number(r['scenario_version']);
      const inherited = ((r['initial_state'] as Snapshot[]) ?? []).filter((e) => e.kind === 'predicted' && e.inherited_validation).map((e) => ({
        key: e.key, forecast: (e.citations ?? []).filter((c) => c.kind === 'forecast').map((c) => `FCT:${c.id}@${c.version}`).join(','), state: String(e.inherited_validation) }));
      const payload = {
        twin: { twin_id: r['twin_id'], version: Number(r['twin_version']), branch_id: r['branch_id'] }, run_kind: r['run_kind'], control_run_id: r['control_run_id'] ?? null,
        corrects_run_id: r['corrects_run_id'] ?? null,
        scenario: scenarioId === null ? null : { scenario_id: scenarioId, version: scenarioVersion, branch_id: r['scenario_branch_id'], branch_state: r['scenario_branch_state'],
                                               flip_event_id: r['scenario_flip_event'] ?? null },
        shock: r['shock'], shock_basis: String(r['shock_basis']), component: r['component'],
        cutoffs: { known_at: instantOf(r['known_at']), observed_through: dayOf(r['observed_through']) },
        initial_state_digest: r['initial_state_digest'], model: { ref: r['model_ref'], implementation_digest: r['implementation_digest'] },
        environment: { digest: r['environment_digest'], ...(r['environment'] as Record<string, unknown>) },
        stochastic: r['stochastic_mode'] === 'seeded' ? { mode: 'seeded', rng: r['rng'], seed: Number(r['seed']), samples: Number(r['samples']), jitter: r['jitter'] } : { mode: 'deterministic' },
        interventions: r['interventions'], constraints: r['constraints'], assumptions: r['assumptions'], inputs_digest: r['inputs_digest'], outputs_digest: outputsDigest,
        totals: outputs.totals, sensitivity: { relative: sensitivity.relative, carrying: sensitivity.factors.slice(0, 3).map((f) => ({ key: f['key'], cost_spread: f['cost_spread'] })) },
        outside_envelope: sensitivity.outside_envelope, validation_status: r['validation_status'], inherited_validation: inherited, operator: `principal:${String(r['operator_principal_id'])}`,
      };
      const header: CanonicalHeader = {
        object_id: runId, object_type: 'SIM', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
        owning_component: 'CP-SIM-01', accountable_owner: `principal:${String(r['operator_principal_id'])}`,
        source_object_ids: [`TWN:${String(r['twin_id'])}@${String(r['twin_version'])}`, ...(r['control_run_id'] ? [`SIM:${String(r['control_run_id'])}@1`] : []),
                            ...(scenarioId === null ? [] : [`SCN:${scenarioId}@${String(scenarioVersion)}`])],
        event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
        truth_state: 'synthetic', synthetic_state: true, confidence: null, uncertainty: null,
        evidence_refs: [], provenance_ref: `twin:${String(r['twin_id'])}@${String(r['twin_version'])}`, method_ref: `${String(r['model_ref'])}#${String(r['implementation_digest']).slice(0, 16)}`,
        contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${String(r['operator_principal_id'])}`],
        classification: controls.classification, purpose_scope: purposeId, rights_profile: controls.rights_profile, residency_profile: controls.residency_profile,
        retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref, quality_profile: null,
        quality_state: { validation: r['validation_status'], outside_envelope: sensitivity.outside_envelope, shock_basis: r['shock_basis'] }, freshness_state: null, schema_ref: 'SIM@v2', ontology_ref: null,
        correction_of: r['corrects_run_id'] ? `SIM:${String(r['corrects_run_id'])}@1` : null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
      };
      const check = validateHeader(header);
      if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `simulation header invalid: ${(check.errors ?? []).join('; ')}`), 422);
      const headerDigest = canonicalHeaderDigest(header, payload);
      await cap.admitObject(header, payload, headerDigest);
      await cap.completeRun({ runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, outputs, outputsDigest, sensitivity, outsideEnvelope: sensitivity.outside_envelope,
        headerDigest, actor, eventId: newId(), correlationId });
      return { runId, outputsDigest, totals: outputs.totals, sensitivity, outsideEnvelope: sensitivity.outside_envelope };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `the run could not be completed: ${e instanceof Error ? e.message : String(e)}`), 409);
    }
  }

  /**
   * REPRODUCE from the stored contract — never from the twin as it stands, and
   * never on the caller's word.
   *
   *   1. The pinned implementation must be the one the run recorded, or the run is
   *      `unreproducible`.
   *   2. Every artefact the run rests on must still be AVAILABLE TO THIS READER under
   *      current policy, withdrawal and deletion controls: every cited evidence version
   *      is retrieved through the governed path (authorised, custody-recorded,
   *      integrity-checked), every cited claim, forecast and run is read under RLS and
   *      must be neither withdrawn nor retired. Anything unavailable makes the run
   *      `unreproducible` for this reader, and the reason names it. Nothing is
   *      reassembled from newer evidence: the snapshot is what is re-executed.
   *   3. The re-execution runs in a SEPARATE PROCESS the product spawns from the pinned
   *      implementation; the cold attestation is derived from that execution — the
   *      child's pid and implementation digest are recorded — not from a request flag.
   */
  async reproduce(cap: ReproduceWrites, ctx: ScopeContext, reader: Reader, runId: string, actor: string, correlationId: string):
    Promise<{ runId: string; verdict: string; expected: string; actual: string | null; reason: string; environmentMatches: boolean; coldProcess: boolean; unavailable: string[] }> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    if (r['state'] !== 'completed') throw new HttpException(errorBody('EYE_STA_001', correlationId, `run ${runId} is ${String(r['state'])}; only a completed run is reproduced`), 409);
    const expected = String(r['outputs_digest']);
    const environment = environmentOf();
    const environmentDigest = digestOf(environment);
    const environmentMatches = environmentDigest === String(r['environment_digest']);
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', r['model_ref'] as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    let verdict: 'reproduced' | 'mismatch' | 'unreproducible'; let actual: string | null = null; let reason: string; let cold = false;
    const unavailable: string[] = [];
    if (model === undefined || model['implementation_digest'] !== r['implementation_digest'] || SUPPLY_FLOW_IMPLEMENTATION_DIGEST !== r['implementation_digest']) {
      verdict = 'unreproducible';
      reason = `the pinned implementation of ${String(r['model_ref'])} is no longer the one the run recorded (${String(r['implementation_digest']).slice(0, 16)}…); the stored contract cannot be re-executed by the same code`;
    } else {
      // 2. AVAILABILITY of every cited artefact, to this reader, now.
      const snapshot = (r['initial_state'] as Snapshot[]) ?? [];
      const seen = new Set<string>();
      for (const e of snapshot) for (const c of e.citations ?? []) {
        const id = `${c.kind}:${c.id}@${c.version}`;
        if (c.kind === 'entity' || seen.has(id)) continue;
        seen.add(id);
        const objectType = c.kind === 'evidence' ? 'EVD' : c.kind === 'claim' ? 'CLM' : c.kind === 'forecast' ? 'FCT' : c.kind === 'run' ? 'SIM' : 'ASU';
        // The exact version must be readable by this reader, and the object must not have been WITHDRAWN or retired since
        // (a withdrawal supersedes the object with a withdrawn version: what the run cited is no longer served as standing).
        const exact = await cap.citedObject({ objectType, id: c.id, version: c.version });
        const latest = exact === undefined ? undefined : await cap.citedObject({ objectType, id: c.id, version: null });
        if (exact === undefined) { unavailable.push(`${c.kind} ${c.id}@${c.version} (${e.key}): not available to this reader`); continue; }
        if (latest !== undefined && (latest.lifecycle_state === 'withdrawn' || latest.lifecycle_state === 'retired')) {
          unavailable.push(`${c.kind} ${c.id}@${c.version} (${e.key}): ${latest.lifecycle_state} at version ${latest.object_version}`); continue;
        }
        if (exact.lifecycle_state === 'withdrawn' || exact.lifecycle_state === 'retired') { unavailable.push(`${c.kind} ${c.id}@${c.version} (${e.key}): ${exact.lifecycle_state}`); continue; }
        if (c.kind === 'evidence') {
          // The BYTES: governed retrieval for this reader — policy, governed deletion and integrity decide, now.
          const got = await this.series.retrieveBytes(reader, c.id, c.version, { read_for: 'simulation.reproduce', run_id: runId, key: e.key });
          if ('refused' in got) unavailable.push(`evidence ${c.id}@${c.version} (${e.key}): ${got.refused}`);
          else if (got.bytes.byteLength === 0) unavailable.push(`evidence ${c.id}@${c.version} (${e.key}): no bytes`);
        }
      }
      if (unavailable.length > 0) {
        verdict = 'unreproducible';
        reason = `an artefact the run rests on is no longer available to this reader under current policy, withdrawal and deletion controls: ${unavailable.join('; ')}`.slice(0, 2000);
      } else {
        // 3. RE-EXECUTION in a separate process the product spawns.
        const child = await executeInSeparateProcess(r);
        if ('failed' in child) {
          verdict = 'unreproducible'; reason = `the stored contract could not be re-executed in a separate process: ${child.failed}`;
        } else if (child.implementation_digest !== r['implementation_digest']) {
          verdict = 'unreproducible'; reason = `the separate process (pid ${child.pid}) runs implementation ${child.implementation_digest.slice(0, 16)}…, not the one the run recorded`;
        } else {
          cold = true; actual = child.outputs_digest;
          verdict = actual === expected ? 'reproduced' : 'mismatch';
          reason = verdict === 'reproduced'
            ? `re-executed from the stored contract in a separate process (pid ${child.pid}, implementation ${child.implementation_digest.slice(0, 16)}…); outputs digest identical`
            : `re-executed from the stored contract in a separate process (pid ${child.pid}); the outputs digest differs`;
        }
      }
    }
    await cap.recordReproduction({ reproductionId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, runId, verdict, expected, actual, reason,
      environmentDigest, environmentMatches, cold, actor, eventId: newId(), correlationId });
    return { runId, verdict, expected, actual, reason, environmentMatches, coldProcess: cold, unavailable };
  }

  /** Compare completed runs that share a control (the control itself may be included); refuse anything else. */
  async compare(cap: SimulationReads, runIds: string[], correlationId: string): Promise<Record<string, unknown>> {
    const rows = (await cap.readRuns().selectAll().where('run_id' as never, 'in', runIds as never).execute()) as Array<Record<string, unknown>>;
    if (rows.length !== runIds.length) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches one of the ids'), 404);
    const controls = new Set(rows.map((r) => (r['run_kind'] === 'control' ? String(r['run_id']) : String(r['control_run_id']))));
    if (controls.size !== 1) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'runs can be compared only against one common control case'), 422);
    if (rows.some((r) => r['state'] !== 'completed')) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'every compared run must be completed'), 409);
    const digests = new Set(rows.map((r) => String(r['initial_state_digest'])));
    if (digests.size !== 1) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'runs on different initial states are not comparable'), 422);
    const control = rows.find((r) => r['run_kind'] === 'control') ?? rows[0] as Record<string, unknown>;
    return {
      control_run_id: [...controls][0], initial_state_digest: [...digests][0],
      shock: control['shock'], shock_basis: control['shock_basis'] ?? 'unrecorded',
      scenario: control['scenario_id'] === null || control['scenario_id'] === undefined ? null
        : { scenario_id: control['scenario_id'], version: control['scenario_version'] ?? null, branch_id: control['scenario_branch_id'], branch_state: control['scenario_branch_state'] ?? null },
      runs: rows.map((r) => ({ run_id: r['run_id'], run_kind: r['run_kind'], interventions: r['interventions'], totals: (r['outputs'] as Record<string, unknown>)['totals'],
        outputs_digest: r['outputs_digest'], carrying: (r['sensitivity'] as Record<string, unknown>)['factors'] instanceof Array
          ? ((r['sensitivity'] as Record<string, unknown>)['factors'] as Array<Record<string, unknown>>).slice(0, 2).map((f) => f['key']) : [] })),
      synthetic: true,
    };
  }

  async get(cap: SimulationReads, runId: string): Promise<Record<string, unknown> | undefined> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) return undefined;
    const events = (await cap.readRunEvents().selectAll().where('run_id' as never, '=', runId as never).orderBy('occurred_at' as never).execute()) as unknown[];
    const reproductions = (await cap.readReproductions().selectAll().where('run_id' as never, '=', runId as never).orderBy('reproduced_at' as never).execute()) as unknown[];
    return { ...withDays(r), events, reproductions };
  }

  async list(cap: SimulationReads, twinId: string | null): Promise<unknown[]> {
    let q = cap.readRuns().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    return ((await q.orderBy('opened_at' as never, 'desc').limit(200).execute()) as Array<Record<string, unknown>>).map(withDays);
  }
}

/** The stored contract, as the model needs it. Parameters come from the SNAPSHOT on the run, never from the twin. */
export function contractOf(r: Record<string, unknown>): { params: SupplyFlowParams; options: SupplyFlowOptions; interventions: Intervention[]; assumptions: Record<string, unknown>; sensitivityRelative: number } {
  const snapshot = (r['initial_state'] as Snapshot[]).map((e) => ({ ...e, health: e.health ?? 'complete', valid_from: e.valid_from === null ? null : dayOf(e.valid_from) }));
  const derived = paramsFromSnapshot(snapshot, String(r['component']));
  if (derived.problems.length > 0) throw new Error(`stored contract incomplete: ${derived.problems.join('; ')}`);
  const constraints = r['constraints'] as Record<string, unknown>;
  const options: SupplyFlowOptions = {
    horizon_days: Number(constraints['horizon_days']), shock: r['shock'] === true,
    stochastic: r['stochastic_mode'] === 'seeded'
      ? { mode: 'seeded', seed: Number(r['seed']), samples: Number(r['samples']), jitter: r['jitter'] as Record<string, number> } : { mode: 'deterministic' },
  };
  return { params: derived.params, options, interventions: r['interventions'] as Intervention[], assumptions: r['assumptions'] as Record<string, unknown>,
           sensitivityRelative: Number(constraints['sensitivity_relative'] ?? 0.2) };
}

/**
 * The separate process: `reproduce-worker.js` beside this file (in `dist`, where the
 * product runs), fed the stored run on stdin, answering with the outputs digest, the
 * implementation digest it ran and its pid. Under a source checkout the worker is
 * looked for in the built tree; when no executor is installed the run is
 * unreproducible, not silently re-executed in-process.
 */
export function workerPath(): string | null {
  const candidates: string[] = [];
  // The built tree: this file's own directory (CommonJS output carries __dirname).
  const here = typeof __dirname === 'string' ? __dirname : null;
  if (here !== null) {
    candidates.push(join(here, 'reproduce-worker.js'));
    candidates.push(join(here.replace(/([\\/])src([\\/])/, '$1dist$2'), 'reproduce-worker.js'));
  }
  // A source checkout under test: the built tree beside it.
  candidates.push(join(process.cwd(), 'dist', 'twin', 'simulations', 'reproduce-worker.js'));
  candidates.push(join(process.cwd(), 'apps', 'api', 'dist', 'twin', 'simulations', 'reproduce-worker.js'));
  return candidates.find((c) => existsSync(c)) ?? null;
}

async function executeInSeparateProcess(r: Record<string, unknown>): Promise<{ outputs_digest: string; implementation_digest: string; pid: number } | { failed: string }> {
  const worker = workerPath();
  if (worker === null) return { failed: 'no isolated executor is installed beside the simulation service (reproduce-worker.js)' };
  const stored = { ...r, known_at: instantOf(r['known_at']), observed_through: dayOf(r['observed_through']) };
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [worker], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, EYE_REPRODUCE_WORKER: '1' } }, (error, stdout, stderr) => {
      if (error) { resolve({ failed: `${error.message}${stderr ? `: ${String(stderr).slice(0, 300)}` : ''}` }); return; }
      try {
        const out = JSON.parse(String(stdout)) as { outputs_digest?: string; implementation_digest?: string; pid?: number; error?: string };
        if (typeof out.error === 'string') { resolve({ failed: out.error }); return; }
        if (typeof out.outputs_digest !== 'string' || typeof out.implementation_digest !== 'string' || typeof out.pid !== 'number') { resolve({ failed: 'the executor answered without a digest' }); return; }
        resolve({ outputs_digest: out.outputs_digest, implementation_digest: out.implementation_digest, pid: out.pid });
      } catch (e) { resolve({ failed: `the executor's answer could not be read: ${e instanceof Error ? e.message : String(e)}` }); }
    });
    child.stdin?.end(JSON.stringify(stored));
  });
}

export type { SupplyFlowOutputs };

function instantOf(v: unknown): string { return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString(); }
/* A DATE names a day; the driver's local-midnight Date would print in UTC a day west of Greenwich. */
function withDays<T extends Record<string, unknown>>(row: T): T {
  return 'observed_through' in row ? { ...row, observed_through: dayOf(row['observed_through']) } : row;
}

function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
