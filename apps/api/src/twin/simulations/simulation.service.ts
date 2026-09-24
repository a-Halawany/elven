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
 *
 * THE INVALIDATION (CP-6 B18, 0078; L8-I05). A completed run's RESULT is marked
 * unfit — validity `invalidated`, the reason, the trigger — never edited and never
 * removed: the withdrawn SIM version is admitted first (the shared rule,
 * withdrawn-version.ts), then the port marks the row, names the dependants (the
 * packages, commitments and decisions resting on it, the twin versions and runs
 * citing it) and writes run.invalidated; a refusal by the port rolls the admission
 * back. Two triggers: a PERSON's act (`simulation.run.invalidate`, human-gated) or
 * the REPRODUCTION's own verdict (`simulation.reproduce`, in the same write as the
 * verdict it rests on). THE RULE OF THE AUTOMATIC STEP: a reproduction invalidates
 * ONLY when its verdict is `unreproducible` AND the cause is a LIFECYCLE one — a
 * cited object withdrawn or retired (the forecast the chain withdraws, a document
 * withdrawn by a correction, a revoked import's copies). It never invalidates on
 * the other causes of the same verdict, which say nothing about the result: the
 * pinned implementation no longer the one recorded (a deploy), an artefact not
 * available to THIS reader or its bytes refused (policy — a restricted reader
 * would otherwise destroy a valid result for everyone), or a separate process
 * that failed to run (infrastructure). The answer names the invalidation, or
 * which cause withheld it; a run already invalidated records the verdict alone.
 * The completion measures its RESOURCE EVIDENCE around the execution (D15) and
 * the events of the three transitions are built pure (simulation-events.ts).
 *
 * FITNESS, THE ENVELOPE, THE CHALLENGE AND THE PROMOTION (CP-6 B21, 0081; L8-I04,
 * OBJ-29). The opening port refuses an UNFIT twin version and a branch of an
 * INCOHERENT scenario, checks the run's OWN contract against the behaviour model's
 * operating envelope (one rule with the validation — twin.envelope_check, the
 * horizon from the constraints) and admits an outside run only under a twin
 * owner's or the domain administrator's ACKNOWLEDGEMENT, recorded on the row; a
 * RE-RUN answering a challenge names it and is bound by the port. The service
 * performs NO fitness, coherence or challenge pre-check of its own (C1): the port
 * is the one rule and the mapper answers its sentence. A CHALLENGE is a person's
 * typed dispute of a completed valid run (assumptions | model | constraints |
 * interpretation), sent to a re-run, withdrawn by its opener or DECIDED by someone
 * who is neither the opener nor the operator; an UPHELD decision invalidates the
 * run in the same write — the withdrawn SIM version admitted here, then the port
 * with trigger `challenge` — unless the run was invalidated already (said). A
 * PROMOTION marks a completed, valid, undisputed result fit for a stated use by a
 * reviewer other than the operator; no outbox event (OBJ-29 is outside the
 * catalogue) — the state rides the reads. Each challenge write publishes
 * ChallengeSimulation@v1 built from the row as read back (simulation-events.ts).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { canonicalHeaderDigest, errorBody, jcsCanonicalize, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { withdrawnVersionHeaderOf } from '../../shared/withdrawn-version.js';
import { simulationInvalidatedGraphEvent, type OutboxRow } from '../../graph/subscriptions/change-events.js';
import { SeriesService, type Reader } from '../../prediction/series/series.service.js';
import { controlsOf, foldControls, type ControlInput, type Controls } from '../../prediction/controls.js';
import { simulateSupplyFlow, validateParams, SUPPLY_FLOW_METHOD_REF, RNG_ALGORITHM, type Intervention, type SupplyFlowOptions, type SupplyFlowParams, type SupplyFlowOutputs } from '../models/supply-flow.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../models/supply-flow.digest.js';
import type { ChallengeWrites, CompleteWrites, InvalidateWrites, OpenedRun, PromoteWrites, ReproduceWrites, RunWrites, ShockBasis, SimulationReads } from '../simulation.capabilities.js';
import type { Citation, EnvelopeCheck } from '../twin.capabilities.js';
import { SIMULATION_INVALIDATE_METHOD_REF, challengeSimulationEvent, simulationCompletedEvent, simulationInvalidatedEvent, type ChallengeState, type Resource } from './simulation-events.js';

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const digestOf = (v: unknown): string => sha256(jcsCanonicalize(v));

export interface RunIntake {
  twinId: string; twinVersion: number; runKind: 'control' | 'intervention'; controlRunId: string | null; correctsRunId: string | null;
  scenarioId: string | null; scenarioBranchId: string | null; shock: boolean; component: string;
  interventions: Intervention[]; horizonDays: number;
  stochastic: { mode: 'deterministic' } | { mode: 'seeded'; seed: number; samples: number; jitter: Record<string, number> };
  sensitivityRelative: number;
  /** B21 (0081, D3 b): the acknowledgement of a run whose own contract lies outside the operating envelope — `{ acknowledge: true, reason }`; the port checks the holder. */
  envelope: { acknowledge: boolean; reason: string } | null;
  /** B21 (0081, D11): the challenge this run answers as its RE-RUN (with `correctsRunId` the challenged run); the port binds it. */
  challengeId: string | null;
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
  // B21 (0081; C20): the acknowledgement is `{ acknowledge: true, reason (8+) }` or absent — a malformed one is refused here; whether the run
  // IS outside the envelope, and whether the acting principal may acknowledge it, the port decides (the intake never pre-judges the envelope).
  const envRaw = m['envelope'];
  let envelope: RunIntake['envelope'] = null;
  if (envRaw !== undefined && envRaw !== null) {
    const e = envRaw as Record<string, unknown>;
    if (typeof e !== 'object' || Array.isArray(e) || e['acknowledge'] !== true || typeof e['reason'] !== 'string' || e['reason'].trim().length < 8) {
      bad('envelope, when given, acknowledges a run outside the operating envelope: { acknowledge: true, reason (at least 8 characters) }');
    }
    envelope = { acknowledge: true, reason: (e['reason'] as string).trim() };
  }
  const correctsRunId = typeof m['correctsRunId'] === 'string' ? m['correctsRunId'] : null;
  const challengeId = m['challengeId'] === undefined || m['challengeId'] === null ? null : m['challengeId'];
  if (challengeId !== null && (typeof challengeId !== 'string' || !UUID.test(challengeId))) bad('challengeId must be a challenge id');
  if (challengeId !== null && correctsRunId === null) bad('a re-run names the run it corrects (correctsRunId) and the challenge it answers (challengeId)');
  return {
    twinId: m['twinId'] as string, twinVersion: m['twinVersion'] as number, runKind, controlRunId: controlRunId as string | null,
    correctsRunId,
    scenarioId, scenarioBranchId,
    shock: m['shock'] as boolean, component: m['component'] as string, interventions, horizonDays: horizonDays as number, stochastic, sensitivityRelative: rel,
    envelope, challengeId: challengeId as string | null,
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

/**
 * One artefact a run rests on that is NOT available to this reader now (B18, C2): WHICH one, and the CAUSE — `lifecycle`
 * (the cited object withdrawn or retired, at the cited version or by a later one: the run's unfitness), `access` (not readable
 * by this reader, or its bytes refused by policy: the reader's), `bytes` (the governed retrieval returned nothing: the store's).
 * `text` is the sentence the reason carries, unchanged since Phase 5.
 */
export interface UnavailableEntry { key: string; kind: string; id: string; version: number; cause: 'access' | 'lifecycle' | 'bytes'; state?: 'withdrawn' | 'retired'; by_version?: number; text: string }
/** Why an unreproducible verdict did NOT invalidate the run (C2): the cause was not a lifecycle one, or the run was invalidated already. */
export type InvalidationWithheld = 'implementation' | 'access' | 'infrastructure' | 'bytes' | 'already_invalidated';
/**
 * THE EVIDENCE AVAILABILITY ESTABLISHED BEFORE THE WRITE (the B21 rehearsal's wedge, 2026-09-24): what the governed retrieval of
 * each evidence citation answered to this reader, keyed `${id}@${version}` (evidenceKey). A governed retrieval is a governed write
 * of its own (observation.evidence.retrieve: its policy decision, its custody row, its audit row) and MUST NOT run inside another
 * write's transaction: it opened a second connection whose capability context (ctx.issue_commit → ctx.build) swept the same expired
 * nonces the caller's context had swept moments before, waited on the caller's transaction, and the caller's handler waited on it —
 * a deadlock PostgreSQL cannot see (the caller is idle in transaction, not waiting on a lock) that queued every capability issuance
 * of the process behind it, logins included. So the ROUTE establishes the availability first — each retrieval its own act, in
 * sequence (retrieveEvidence) — and the write judges lifecycle under its own snapshot and consults this answer for the bytes.
 */
export type EvidenceAvailability = ReadonlyMap<string, { ok: true } | { refused: string } | { empty: true }>;
export const evidenceKey = (id: string, version: number): string => `${id}@${version}`;
type CitationRef = { key: string; kind: string; id: string; version: number };
/** The citations of a run's immutable snapshot, and the scenario version it bound (the scenario is part of the experiment contract). */
function snapshotCitations(r: Record<string, unknown>): CitationRef[] {
  const snapshot = (r['initial_state'] as Snapshot[]) ?? [];
  const citations: CitationRef[] = snapshot.flatMap((e) => (e.citations ?? []).map((c) => ({ key: e.key, kind: String(c.kind), id: c.id, version: c.version })));
  if (r['scenario_id'] !== null && r['scenario_id'] !== undefined && r['scenario_version'] !== null && r['scenario_version'] !== undefined) {
    citations.push({ key: 'scenario (the bound experiment contract)', kind: 'scenario', id: String(r['scenario_id']), version: Number(r['scenario_version']) });
  }
  return citations;
}

@Injectable()
export class SimulationService {
  constructor(private readonly series: SeriesService) {}

  /**
   * Bind the contract and snapshot the initial state (governed write: `simulation.run`). `evidence` is what the governed retrievals
   * of the component's required evidence answered to this reader BEFORE this write (retrieveEvidence, called by the route): the
   * retrievals are governed writes of their own and never run inside this transaction (EvidenceAvailability).
   */
  async open(cap: RunWrites, ctx: ScopeContext, evidence: EvidenceAvailability, intake: RunIntake, actor: string, correlationId: string, runId: string = newId()):
    Promise<{ runId: string; opened: OpenedRun; params: SupplyFlowParams; options: SupplyFlowOptions; assumptions: Record<string, unknown>;
              /** The behaviour model's declared operating envelope (the ranges the sensitivity sweep marks breaches against). */
              operatingEnvelope: Record<string, unknown>;
              /** B18: what SimulationStarted carries beyond the port's answer — resolved here, never re-read by the route. */
              modelRef: string; implementationDigest: string; environment: { node: string; platform: string; arch: string }; environmentDigest: string; inputsDigest: string;
              shockBasis: ShockBasis; rng: string | null; scenario: { scenario_id: string; version: number; branch_id: string; branch_state: string; flip_event_id: string | null } | null;
              /** B21 (0081): the fitness and envelope contract the port bound at opening — for the route's answer and SimulationStarted. */
              twinFitness: string; envelope: EnvelopeCheck; envelopeAck: Record<string, unknown> | null; challengeId: string | null }> {
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
    const knownAt = instantOf(version['known_at']);
    const observedThrough = dayOf(version['observed_through']);
    /*
     * AVAILABILITY NOW, FOR THIS READER. The version's stored health is what was true
     * when it was grounded; this run is asked for now. A required input whose document
     * has since been withdrawn, deleted or become unreadable to this reader is not one
     * the run may use, however complete the version was. (The port refuses the same,
     * from the object's own lifecycle; here the governed retrieval also decides.)
     */
    const unavailable = await this.unavailableInputs(cap, evidence, intake.twinId, intake.twinVersion, intake.component, correlationId);
    if (unavailable.length > 0) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `required inputs for ${intake.component} are no longer available to this reader under current policy, withdrawal and deletion controls: ${unavailable.join('; ')}`.slice(0, 2000)), 409);
    }
    /*
     * THE SCENARIO IS RESOLVED AND BOUND, UNDER THIS RUN'S OWN RECORD CUT-OFF. A tree
     * admitted after the twin version's `known_at`, or a branch that flipped after it,
     * was not known then and gives this run's shock nothing. A shock's basis is the
     * bound branch's state AS OF that instant — flipped, or it is not a shock the
     * scenario supports. A shock with no scenario is a HYPOTHETICAL: recorded as such,
     * never as an observed flip.
     */
    let scenario: ScenarioBinding | null = null;
    if (intake.scenarioId !== null && intake.scenarioBranchId !== null) {
      const scn = (await cap.readScenarios().selectAll().where('scenario_id' as never, '=', intake.scenarioId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (scn === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `scenario ${intake.scenarioId} is not an authorized scenario in this domain`), 404);
      // 0066 §8 (V04-T-032): a scenario retired by review is not simulated — its branches closed with it; the port refuses too.
      if (String(scn['state']) === 'retired') {
        throw new HttpException(errorBody('EYE_REQ_001', correlationId, `scenario ${intake.scenarioId} was retired by review (${String(scn['retirement_reason'] ?? 'no reason recorded')}); a retired branch is not simulated — declare a successor scenario`), 422);
      }
      const branch = (await cap.readBranches().selectAll().where('branch_id' as never, '=', intake.scenarioBranchId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (branch === undefined || String(branch['scenario_id']) !== intake.scenarioId) {
        throw new HttpException(errorBody('EYE_REQ_001', correlationId, `branch ${intake.scenarioBranchId} is not a branch of scenario ${intake.scenarioId}`), 422);
      }
      const asOfVersion = await cap.versionAsOf({ objectType: 'SCN', id: intake.scenarioId, at: knownAt });
      if (asOfVersion === null) {
        throw new HttpException(errorBody('EYE_REQ_001', correlationId,
          `scenario ${intake.scenarioId} was recorded after this twin version's known_at (${knownAt}); it was not known at record time and cannot give this run's shock its basis`), 422);
      }
      /*
       * BOTH CLOCKS. A flip has two times and Phase 4 records both: the instant it was
       * written, and the day of the observation that caused it. A flip written after this
       * run's `known_at` was not known to it; a flip caused by an observation after its
       * `observed_through` is a day this run's world does not reach. Either way the branch
       * is not flipped FOR THIS RUN, and the shock has no observed basis.
       */
      const asOf = await cap.branchStateAsOf({ branchId: intake.scenarioBranchId, at: knownAt, observedThrough });
      const state = asOf?.state ?? String(branch['state']);
      if (intake.shock !== (state === 'flipped')) {
        const later = String(branch['state']) === 'flipped' && state !== 'flipped'
          ? (asOf?.flipRecordedAt !== null && asOf?.flipRecordedAt !== undefined && new Date(asOf.flipRecordedAt).getTime() > new Date(knownAt).getTime()
              ? ` — its flip was recorded later (${asOf.flipRecordedAt})`
              : asOf?.flipObservedAt !== null && asOf?.flipObservedAt !== undefined
                ? ` — its flip rests on an observation of ${asOf.flipObservedAt}, after this run's world cut-off ${observedThrough}`
                : ' — its flip names no observation date, so nothing establishes that it had happened in this run\'s world')
          : '';
        throw new HttpException(errorBody('EYE_REQ_001', correlationId,
          intake.shock ? `the shock contradicts the bound branch: branch "${String(branch['name'])}" was ${state} under this run's cut-offs (known_at ${knownAt}, observations through ${String(observedThrough)})${later}, not flipped; a shock without a flipped branch is a hypothetical and names no scenario`
                       : `the bound branch "${String(branch['name'])}" was flipped under this run's cut-offs; a run on it applies the shock (shock: true) or names no scenario`), 422);
      }
      const obj = await cap.citedObject({ objectType: 'SCN', id: intake.scenarioId, version: asOfVersion });
      if (obj === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `scenario ${intake.scenarioId} has no authorized canonical version`), 404);
      scenario = { scenarioId: intake.scenarioId, version: obj.object_version, branchId: intake.scenarioBranchId, branchState: state,
                   flipEventId: state === 'flipped' && branch['flip_event_id'] !== null && branch['flip_event_id'] !== undefined ? String(branch['flip_event_id']) : null,
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
      interventions: intake.interventions, constraints, assumptions: derived.assumptions, inputsDigest, validationStatus, controls,
      // B21 (0081): the acknowledgement and the challenge go to the port as given — it judges the envelope, the holder and the challenge's state.
      envelopeAck: intake.envelope, challengeId: intake.challengeId,
      actor, eventId: newId(), correlationId,
    });
    return { runId, opened, params: derived.params, options, assumptions: derived.assumptions, operatingEnvelope: envelope,
             modelRef, implementationDigest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, environment: { node: environment.node, platform: environment.platform, arch: environment.arch },
             environmentDigest, inputsDigest, shockBasis, rng: stochastic.mode === 'seeded' ? RNG_ALGORITHM : null, scenario: scenarioBinding,
             twinFitness: String(opened.twin_fitness ?? 'none'), envelope: opened.envelope, envelopeAck: opened.envelope_ack ?? null, challengeId: opened.challenge_id ?? null };
  }

  /**
   * Is every artefact in this set still available TO THIS READER, now? The exact version
   * must be readable and neither withdrawn nor retired, its object must not have been
   * withdrawn or retired since (a withdrawal supersedes the cited version with a
   * withdrawn one), and evidence bytes must survive the governed retrieval — policy,
   * governed deletion and integrity decide at the moment of asking. Returns what is
   * unavailable, named; an empty list is the only pass.
   *
   * The lifecycle is judged HERE, under this write's own snapshot; the bytes were asked
   * for BEFORE this write (retrieveEvidence — the governed retrievals are governed writes
   * of their own, never nested in this transaction) and `evidence` is what they answered.
   * A citation the retrievals did not reach is not available: nothing established it.
   */
  private async unavailable(cap: SimulationReads, evidence: EvidenceAvailability, citations: CitationRef[]): Promise<UnavailableEntry[]> {
    const out: UnavailableEntry[] = [];
    const seen = new Set<string>();
    for (const c of citations) {
      if (c.kind === 'entity') continue;
      const id = `${c.kind}:${c.id}@${c.version}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const objectType = c.kind === 'evidence' ? 'EVD' : c.kind === 'claim' ? 'CLM' : c.kind === 'forecast' ? 'FCT'
        : c.kind === 'run' ? 'SIM' : c.kind === 'scenario' ? 'SCN' : 'ASU';
      const named = { key: c.key, kind: c.kind, id: c.id, version: c.version };
      const exact = await cap.citedObject({ objectType, id: c.id, version: c.version });
      if (exact === undefined) { out.push({ ...named, cause: 'access', text: `${c.kind} ${c.id}@${c.version} (${c.key}): not available to this reader` }); continue; }
      const latest = await cap.citedObject({ objectType, id: c.id, version: null });
      if (latest !== undefined && (latest.lifecycle_state === 'withdrawn' || latest.lifecycle_state === 'retired')) {
        out.push({ ...named, cause: 'lifecycle', state: latest.lifecycle_state, by_version: Number(latest.object_version),
                   text: `${c.kind} ${c.id}@${c.version} (${c.key}): ${latest.lifecycle_state} at version ${latest.object_version}` });
        continue;
      }
      if (exact.lifecycle_state === 'withdrawn' || exact.lifecycle_state === 'retired') {
        out.push({ ...named, cause: 'lifecycle', state: exact.lifecycle_state, by_version: c.version, text: `${c.kind} ${c.id}@${c.version} (${c.key}): ${exact.lifecycle_state}` });
        continue;
      }
      if (c.kind === 'evidence') {
        const got = evidence.get(evidenceKey(c.id, c.version));
        if (got === undefined) out.push({ ...named, cause: 'access', text: `evidence ${c.id}@${c.version} (${c.key}): its availability to this reader was not established before this write (the governed retrieval precedes the run)` });
        else if ('refused' in got) out.push({ ...named, cause: 'access', text: `evidence ${c.id}@${c.version} (${c.key}): ${got.refused}` });
        else if ('empty' in got) out.push({ ...named, cause: 'bytes', text: `evidence ${c.id}@${c.version} (${c.key}): no bytes` });
      }
    }
    return out;
  }

  /** The selected component's required inputs, as the port selects them, checked for availability now (the sentences, for the refusal). */
  private async unavailableInputs(cap: RunWrites, evidence: EvidenceAvailability, twinId: string, version: number, component: string, correlationId: string): Promise<string[]> {
    void correlationId;
    const citations = await cap.requiredCitations({ twinId, version, component });
    return (await this.unavailable(cap, evidence, citations)).map((u) => u.text);
  }

  /**
   * THE GOVERNED RETRIEVALS, OUTSIDE ANY WRITE (EvidenceAvailability): every distinct evidence citation is retrieved through the reader —
   * each retrieval the governed write it always was (observation.evidence.retrieve: policy, custody, audit), in sequence — and what each
   * answered is the availability the opening or reproducing write consults. Called by the route BEFORE its write; never from a handler.
   */
  async retrieveEvidence(reader: Reader, citations: CitationRef[], readFor: string, context: Record<string, string>): Promise<EvidenceAvailability> {
    const out = new Map<string, { ok: true } | { refused: string } | { empty: true }>();
    for (const c of citations) {
      if (c.kind !== 'evidence') continue;
      const key = evidenceKey(c.id, c.version);
      if (out.has(key)) continue;
      const got = await this.series.retrieveBytes(reader, c.id, c.version, { read_for: readFor, ...context, key: c.key });
      out.set(key, 'refused' in got ? { refused: got.refused } : got.bytes.byteLength === 0 ? { empty: true } : { ok: true });
    }
    return out;
  }

  /** The citations an OPENING establishes availability for: the port's own selection of the component's required inputs (twin.required_citations), read before the write. */
  async citationsForRun(cap: SimulationReads, intake: Pick<RunIntake, 'twinId' | 'twinVersion' | 'component'>): Promise<CitationRef[]> {
    return cap.requiredCitations({ twinId: intake.twinId, version: intake.twinVersion, component: intake.component });
  }

  /**
   * The citations a REPRODUCTION establishes availability for: the completed run's immutable snapshot and the scenario version it bound
   * — none when the reproducing write would refuse or withhold before asking (no such run, not completed, the implementation no longer
   * the pinned one), so no retrieval is recorded that the write would not have made.
   */
  async citationsForReproduction(cap: SimulationReads, runId: string): Promise<CitationRef[]> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined || r['state'] !== 'completed') return [];
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', r['model_ref'] as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (model === undefined || model['implementation_digest'] !== r['implementation_digest'] || SUPPLY_FLOW_IMPLEMENTATION_DIGEST !== r['implementation_digest']) return [];
    return snapshotCitations(r);
  }

  private async elements(cap: SimulationReads, twinId: string, version: number): Promise<Snapshot[]> {
    const rows = (await cap.readElements().selectAll()
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    return rows.map((e) => ({ key: String(e['key']), kind: String(e['kind']), value: e['value'], unit: e['unit'] === null ? null : String(e['unit']),
      valid_from: e['valid_from'] === null || e['valid_from'] === undefined ? null : dayOf(e['valid_from']), material: e['material'] === true,
      health: String(e['health'] ?? 'complete'), inherited_validation: e['inherited_validation'] === undefined ? null : (e['inherited_validation'] as string | null),
      citations: (e['citations'] as Citation[] | undefined) ?? [] }));
  }

  /**
   * Execute from the stored contract and COMPLETE (governed write: `simulation.run.complete`; admits the SIM object). B18 (D15):
   * the RESOURCE EVIDENCE — elapsed, samples, process, memory — is measured around the execution (the model and its sensitivity
   * sweep), lands on the row and in run.completed through the port, and the answer carries it with the impacts against the
   * control, the SIM object admitted and the SimulationCompleted event the route publishes.
   */
  async complete(cap: CompleteWrites, ctx: ScopeContext, runId: string, purposeId: string, actor: string, correlationId: string):
    Promise<{ runId: string; outputsDigest: string; totals: unknown; sensitivity: unknown; outsideEnvelope: boolean;
              impacts: { control_run_id: string | null; deltas: { line_stop_days: number; total_cost: string } | null }; resource: Resource;
              simObject: { object_id: string; version: 1; header_digest: string }; event: OutboxRow }> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    if (r['state'] !== 'opened') throw new HttpException(errorBody('EYE_STA_001', correlationId, `run ${runId} is ${String(r['state'])} and immutable`), 409);
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', r['model_ref'] as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const contract = contractOf(r);
    const t0 = performance.now();
    try {
      const outputs = simulateSupplyFlow(contract.params, contract.options, contract.interventions);
      const outputsDigest = digestOf(outputs);
      const sensitivity = sensitivityOf(contract.params, contract.options, contract.interventions, contract.assumptions, contract.sensitivityRelative,
        (model?.['operating_envelope'] ?? {}) as Record<string, unknown>);
      // The resource evidence of THIS execution, measured here — never a figure the caller asserts.
      const env = environmentOf();
      const resource: Resource = { elapsed_ms: Math.round(performance.now() - t0), samples_run: r['stochastic_mode'] === 'seeded' ? Number(r['samples']) : 1,
                                   process: { node: env.node, platform: env.platform, arch: env.arch }, memory_rss_bytes: process.memoryUsage().rss };
      // The impacts against the control: this run's totals minus the control's (an intervention run); a control compares to nothing.
      const controlId = r['control_run_id'] === null || r['control_run_id'] === undefined ? null : String(r['control_run_id']);
      let deltas: { line_stop_days: number; total_cost: string } | null = null;
      if (controlId !== null) {
        const control = (await cap.readRuns().select(['outputs' as never]).where('run_id' as never, '=', controlId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        const ct = ((control?.['outputs'] ?? {}) as Record<string, unknown>)['totals'] as { line_stop_days?: unknown; cost?: { total?: unknown } } | undefined;
        if (ct !== undefined && ct !== null) {
          deltas = { line_stop_days: outputs.totals.line_stop_days - Number(ct.line_stop_days ?? 0), total_cost: (Number(outputs.totals.cost.total) - Number(ct.cost?.total ?? 0)).toFixed(2) };
        }
      }
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
        headerDigest, resource, actor, eventId: newId(), correlationId });
      const simObject = { object_id: runId, version: 1 as const, header_digest: headerDigest };
      const impacts = { control_run_id: controlId, deltas };
      const event = simulationCompletedEvent({
        runId, state: 'completed', run: r, outputsDigest, totals: outputs.totals, impacts,
        sensitivity: { relative: sensitivity.relative, outside_envelope: sensitivity.outside_envelope, factors: sensitivity.factors },
        validation: { validation_status: r['validation_status'] === null || r['validation_status'] === undefined ? null : String(r['validation_status']), inherited_validation: inherited, outside_envelope: sensitivity.outside_envelope },
        resource, simObject, failure: null, actor, occurredAt: now,
      });
      return { runId, outputsDigest, totals: outputs.totals, sensitivity, outsideEnvelope: sensitivity.outside_envelope, impacts, resource, simObject, event };
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
  async reproduce(cap: ReproduceWrites, ctx: ScopeContext, evidence: EvidenceAvailability, runId: string, actor: string, correlationId: string, purposeId: string):
    Promise<{ runId: string; verdict: string; expected: string; actual: string | null; reason: string; environmentMatches: boolean; coldProcess: boolean; unavailable: string[];
              /** B18: the invalidation this verdict caused (a lifecycle cause), or null — and, when null on an unreproducible verdict, which cause withheld it. */
              invalidation: { invalidated_at: unknown; withdrawn_version: number; cause: 'lifecycle'; named: UnavailableEntry[] } | null;
              invalidation_withheld: InvalidationWithheld | null;
              /** The events of the invalidation, for the route to publish in the same write (none when nothing was invalidated). */
              events: { outboxEvent: OutboxRow | null; outboxEvents: OutboxRow[] } }> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    if (r['state'] !== 'completed') throw new HttpException(errorBody('EYE_STA_001', correlationId, `run ${runId} is ${String(r['state'])}; only a completed run is reproduced`), 409);
    const expected = String(r['outputs_digest']);
    const environment = environmentOf();
    const environmentDigest = digestOf(environment);
    const environmentMatches = environmentDigest === String(r['environment_digest']);
    const model = (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', r['model_ref'] as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    let verdict: 'reproduced' | 'mismatch' | 'unreproducible'; let actual: string | null = null; let reason: string; let cold = false;
    const unavailable: UnavailableEntry[] = [];
    // Which cause an unreproducible verdict rests on (C2): only a lifecycle cause is the RESULT's unfitness; the others withhold the invalidation.
    let withheld: InvalidationWithheld | null = null;
    if (model === undefined || model['implementation_digest'] !== r['implementation_digest'] || SUPPLY_FLOW_IMPLEMENTATION_DIGEST !== r['implementation_digest']) {
      verdict = 'unreproducible'; withheld = 'implementation';
      reason = `the pinned implementation of ${String(r['model_ref'])} is no longer the one the run recorded (${String(r['implementation_digest']).slice(0, 16)}…); the stored contract cannot be re-executed by the same code`;
    } else {
      /*
       * 2. AVAILABILITY of every artefact the run RESTS ON, to this reader, now: every
       *    citation of its immutable snapshot, AND the scenario version it bound — the
       *    scenario is part of the experiment contract, so its availability is part of
       *    what a reproduction establishes. Nothing is re-read to CHANGE the contract:
       *    the stored snapshot is what the separate process executes.
       */
      // The bytes were asked for before this write (citationsForReproduction → retrieveEvidence, the route); the lifecycle is judged here.
      unavailable.push(...await this.unavailable(cap, evidence, snapshotCitations(r)));
      if (unavailable.length > 0) {
        verdict = 'unreproducible';
        reason = `an artefact the run rests on is no longer available to this reader under current policy, withdrawal and deletion controls: ${unavailable.map((u) => u.text).join('; ')}`.slice(0, 2000);
        // No lifecycle cause among them: the first named one says what withheld the invalidation (the reader's access, or the store's bytes).
        if (!unavailable.some((u) => u.cause === 'lifecycle')) withheld = unavailable[0]?.cause === 'bytes' ? 'bytes' : 'access';
      } else {
        // 3. RE-EXECUTION in a separate process the product spawns.
        const child = await executeInSeparateProcess(r);
        if ('failed' in child) {
          verdict = 'unreproducible'; withheld = 'infrastructure'; reason = `the stored contract could not be re-executed in a separate process: ${child.failed}`;
        } else if (child.implementation_digest !== r['implementation_digest']) {
          verdict = 'unreproducible'; withheld = 'infrastructure'; reason = `the separate process (pid ${child.pid}) runs implementation ${child.implementation_digest.slice(0, 16)}…, not the one the run recorded`;
        } else {
          cold = true; actual = child.outputs_digest;
          verdict = actual === expected ? 'reproduced' : 'mismatch';
          reason = verdict === 'reproduced'
            ? `re-executed from the stored contract in a separate process (pid ${child.pid}, implementation ${child.implementation_digest.slice(0, 16)}…); outputs digest identical`
            : `re-executed from the stored contract in a separate process (pid ${child.pid}); the outputs digest differs`;
        }
      }
    }
    const reproductionId = newId();
    await cap.recordReproduction({ reproductionId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, runId, verdict, expected, actual, reason,
      environmentDigest, environmentMatches, cold, actor, eventId: newId(), correlationId });
    /*
     * B18 (D6, C2): THE AUTOMATIC INVALIDATION, in this write, under this write's own action (simulation.reproduce) with the
     * reproduction just recorded as the trigger's reference — ONLY on an unreproducible verdict whose cause is a LIFECYCLE
     * one (a cited object withdrawn or retired). A deploy, a restricted reader, a missing executor say nothing about the
     * result and withhold it, named. A run invalidated already records the verdict alone: an invalidation is recorded once.
     */
    let invalidation: { invalidated_at: unknown; withdrawn_version: number; cause: 'lifecycle'; named: UnavailableEntry[] } | null = null;
    let events: { outboxEvent: OutboxRow | null; outboxEvents: OutboxRow[] } = { outboxEvent: null, outboxEvents: [] };
    if (verdict === 'unreproducible') {
      const lifecycle = unavailable.filter((u) => u.cause === 'lifecycle');
      if (lifecycle.length > 0) {
        if (r['validity'] === 'invalidated') withheld = 'already_invalidated';
        else {
          const inv = await this.invalidate(cap, ctx, runId, { reason: `unreproducible: ${reason}`.slice(0, 2000), trigger: 'reproduction', triggerRef: reproductionId }, actor, correlationId, purposeId);
          invalidation = { invalidated_at: inv.invalidated['invalidated_at'] ?? null, withdrawn_version: inv.withdrawnVersion, cause: 'lifecycle', named: lifecycle };
          events = { outboxEvent: inv.event, outboxEvents: [inv.changed] };
          withheld = null;
        }
      }
    } else withheld = null;
    return { runId, verdict, expected, actual, reason, environmentMatches, coldProcess: cold, unavailable: unavailable.map((u) => u.text), invalidation, invalidation_withheld: withheld, events };
  }

  /**
   * INVALIDATE a completed run's result (governed write: `simulation.run.invalidate` by a person — the twin owner, the operator
   * or the administrator, human-gated — or `simulation.reproduce` by the reproduction whose verdict was unreproducible; the
   * trigger names which). The withdrawn SIM version is admitted BEFORE the port so a refusal rolls it back; the answer carries
   * the port's dependants, the version admitted, and the two events the write publishes — SimulationInvalidated and
   * GraphChanged/simulation.invalidated (the matching subscriptions read here). The service's own refusals say what the port
   * would (C5): an unknown run 404; a run invalidated already, or not completed, 409 in the port's words.
   */
  async invalidate(
    cap: InvalidateWrites, ctx: ScopeContext, runId: string, a: { reason: string; trigger: 'operator' | 'reproduction' | 'challenge'; triggerRef: string | null },
    actor: string, correlationId: string, purposeId: string,
  ): Promise<{ invalidated: Record<string, unknown>; withdrawnVersion: number; event: OutboxRow; changed: OutboxRow }> {
    const reason = a.reason.trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'an invalidation states its reason (payload.reason, at least 8 characters)'), 422);
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    if (r['validity'] === 'invalidated') {
      const inv = (r['invalidation'] ?? {}) as Record<string, unknown>;
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `run invalidation rejected: run ${runId} is already invalidated (at ${instantOf(r['invalidated_at'])}, trigger ${String(inv['trigger'] ?? 'unrecorded')})`), 409);
    }
    if (r['state'] !== 'completed') {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `run invalidation rejected: run ${runId} is ${String(r['state'])}, not completed — only a completed result is invalidated (an opened run has no result; a failed one none to withdraw)`), 409);
    }
    // The SIM object's LATEST version is what the invalidation withdraws (a run has one version until it is invalidated).
    const prior = await cap.runObject({ runId, tenantId, domainId, version: null });
    if (prior === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized run matches'), 404);
    const now = new Date().toISOString();
    const header = withdrawnVersionHeaderOf(prior, {
      actor, correlationId, purposeId, recordedAt: now, methodRef: SIMULATION_INVALIDATE_METHOD_REF, withdrawalReason: `${a.trigger}: ${reason}`, evidenceRef: null,
    });
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `withdrawn simulation header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    const payload = (prior['payload'] !== null && typeof prior['payload'] === 'object' ? prior['payload'] : {}) as Record<string, unknown>;
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    const withdrawnVersion = Number(header.object_version);
    const invalidated = await cap.invalidateRun({ runId, tenantId, domainId, reason, trigger: a.trigger, triggerRef: a.triggerRef, actor, eventId: newId(), correlationId });
    // The bound action of the write, as the port enforced it: a reproduction invalidates under simulation.reproduce, an upheld challenge (0081)
    // under simulation.challenge.decide, a person under simulation.run.invalidate.
    const action = a.trigger === 'reproduction' ? 'simulation.reproduce' as const : a.trigger === 'challenge' ? 'simulation.challenge.decide' as const : 'simulation.run.invalidate' as const;
    const dependants = (invalidated['dependants'] !== null && typeof invalidated['dependants'] === 'object' ? invalidated['dependants'] : {}) as Record<string, unknown>;
    const event = simulationInvalidatedEvent({ invalidated, withdrawnVersion, trigger: a.trigger, reason, actor, occurredAt: now, action });
    const changed = simulationInvalidatedGraphEvent({
      runId, reason, trigger: a.trigger, triggerRef: a.triggerRef, invalidatedAt: String(invalidated['invalidated_at'] ?? now), dependants,
      subscriptions: await cap.changeSubscriptions({ tenantId, domainId, changeKind: 'simulation.invalidated' }), actor, action, occurredAt: now,
    });
    return { invalidated, withdrawnVersion, event, changed };
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

  // ───────────────────────── B21 (0081): the challenge and the promotion ─────────────────────────

  /**
   * The challenge ROW as read back after the port ran, with the run's identity beside it (as the row stands after the
   * write) — what ChallengeSimulation@v1 is built from. The row was just written under this capability, so its absence
   * is a fault, never a silent omission (the twins consumer's rule).
   */
  private async challengeForEvent(cap: SimulationReads, challengeId: string, runId: string): Promise<Record<string, unknown>> {
    const row = (await cap.readChallenges().selectAll().where('challenge_id' as never, '=', challengeId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (row === undefined) throw new Error(`challenge ${challengeId} was written but its row could not be read back`);
    const run = (await cap.readRuns().select(['twin_id', 'twin_version', 'run_kind', 'control_run_id', 'operator_principal_id', 'validity', 'fitness_state', 'promoted_for'] as never)
      .where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    return { ...row, run: run ?? {} };
  }

  /** OPEN a challenge on a completed valid run (governed write: `simulation.challenge.open`); the port refuses the rest. */
  async openChallenge(cap: ChallengeWrites, ctx: ScopeContext, runId: string, a: { kind: string; statement: string; disputed: unknown }, actor: string, correlationId: string):
    Promise<{ challenge: Record<string, unknown>; event: OutboxRow }> {
    const challengeId = newId();
    const challenge = await cap.openChallenge({ challengeId, runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, kind: a.kind, statement: a.statement, disputed: a.disputed, actor, eventId: newId(), correlationId });
    const event = challengeSimulationEvent({ challenge: await this.challengeForEvent(cap, challengeId, runId), state: 'opened', action: 'simulation.challenge.open', invalidation: null, invalidationWithheld: null, actor, occurredAt: new Date().toISOString() });
    return { challenge, event };
  }

  /** REQUEST a re-run of the challenged run (governed write: `simulation.challenge.rerun`): the re-run itself is an ordinary governed run naming correctsRunId and challengeId. */
  async requestRerun(cap: ChallengeWrites, ctx: ScopeContext, runId: string, challengeId: string, note: string | null, actor: string, correlationId: string):
    Promise<{ challenge: Record<string, unknown>; event: OutboxRow }> {
    const challenge = await cap.requestRerun({ challengeId, runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, note, actor, eventId: newId(), correlationId });
    const event = challengeSimulationEvent({ challenge: await this.challengeForEvent(cap, challengeId, runId), state: 'rerun_requested', action: 'simulation.challenge.rerun', invalidation: null, invalidationWithheld: null, actor, occurredAt: new Date().toISOString() });
    return { challenge, event };
  }

  /** WITHDRAW a live challenge — its opener's act (governed write: `simulation.challenge.withdraw`). */
  async withdrawChallenge(cap: ChallengeWrites, ctx: ScopeContext, runId: string, challengeId: string, reason: string, actor: string, correlationId: string):
    Promise<{ challenge: Record<string, unknown>; event: OutboxRow }> {
    const challenge = await cap.withdrawChallenge({ challengeId, runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, reason, actor, eventId: newId(), correlationId });
    const event = challengeSimulationEvent({ challenge: await this.challengeForEvent(cap, challengeId, runId), state: 'withdrawn', action: 'simulation.challenge.withdraw', invalidation: null, invalidationWithheld: null, actor, occurredAt: new Date().toISOString() });
    return { challenge, event };
  }

  /**
   * DECIDE a live challenge (governed write: `simulation.challenge.decide`, human-gated; the port refuses the opener and the
   * run's operator). An UPHELD decision invalidates the run in this same write — the withdrawn SIM version admitted, then
   * simulation.invalidate_run with trigger `challenge` and the challenge as the reference — unless the run was invalidated
   * already (by the operator meanwhile): then the challenge is upheld and the invalidation withheld, said.
   */
  async decideChallenge(cap: ChallengeWrites, ctx: ScopeContext, runId: string, challengeId: string, a: { decision: string; note: string }, actor: string, correlationId: string, purposeId: string):
    Promise<{ challenge: Record<string, unknown>; event: OutboxRow;
              invalidation: { event: OutboxRow; changed: OutboxRow; withdrawnVersion: number; invalidatedAt: unknown } | null; invalidation_withheld: 'already_invalidated' | null }> {
    const challenge = await cap.decideChallenge({ challengeId, runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, decision: a.decision, note: a.note, actor, eventId: newId(), correlationId });
    const state: ChallengeState = challenge['state'] === 'upheld' ? 'upheld' : 'dismissed';
    const run = (challenge['run'] !== null && typeof challenge['run'] === 'object' ? challenge['run'] : {}) as Record<string, unknown>;
    let invalidation: { event: OutboxRow; changed: OutboxRow; withdrawnVersion: number; invalidatedAt: unknown } | null = null;
    let withheld: 'already_invalidated' | null = null;
    if (state === 'upheld') {
      if (run['validity'] === 'invalidated') withheld = 'already_invalidated';
      else {
        const inv = await this.invalidate(cap, ctx, runId, { reason: `challenge ${challengeId} upheld: ${a.note}`.slice(0, 2000), trigger: 'challenge', triggerRef: challengeId }, actor, correlationId, purposeId);
        invalidation = { event: inv.event, changed: inv.changed, withdrawnVersion: inv.withdrawnVersion, invalidatedAt: inv.invalidated['invalidated_at'] ?? null };
      }
    }
    const event = challengeSimulationEvent({
      challenge: await this.challengeForEvent(cap, challengeId, runId), state, action: 'simulation.challenge.decide',
      invalidation: invalidation === null ? null : { invalidated_at: invalidation.invalidatedAt, withdrawn_version: invalidation.withdrawnVersion },
      invalidationWithheld: withheld, actor, occurredAt: new Date().toISOString(),
    });
    return { challenge, event, invalidation, invalidation_withheld: withheld };
  }

  /** PROMOTE a completed, valid, undisputed result as fit for a stated use (governed write: `simulation.result.promote`, human-gated; the port refuses the operator). No outbox event (OBJ-29). */
  async promote(cap: PromoteWrites, ctx: ScopeContext, runId: string, a: { promotedFor: string; limitations: string[]; note: string }, actor: string, correlationId: string): Promise<Record<string, unknown>> {
    return cap.promoteResult({ promotionId: newId(), runId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, promotedFor: a.promotedFor, limitations: a.limitations, note: a.note, actor, eventId: newId(), correlationId });
  }

  /** The challenges of the domain (or of one run), newest first, bounded 200. */
  async listChallenges(cap: SimulationReads, runId: string | null): Promise<unknown[]> {
    let q = cap.readChallenges().selectAll();
    if (runId !== null) q = q.where('run_id' as never, '=', runId as never);
    return (await q.orderBy('opened_at' as never, 'desc').limit(200).execute()) as unknown[];
  }

  async get(cap: SimulationReads, runId: string): Promise<Record<string, unknown> | undefined> {
    const r = (await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (r === undefined) return undefined;
    const events = (await cap.readRunEvents().selectAll().where('run_id' as never, '=', runId as never).orderBy('occurred_at' as never).execute()) as unknown[];
    const reproductions = (await cap.readReproductions().selectAll().where('run_id' as never, '=', runId as never).orderBy('reproduced_at' as never).execute()) as unknown[];
    // B21 (0081): the run's challenges with their event ledger, and its promotion (the row, or null).
    const challenges = (await cap.readChallenges().selectAll().where('run_id' as never, '=', runId as never).orderBy('opened_at' as never).execute()) as Array<Record<string, unknown>>;
    const challengeEvents = challenges.length === 0 ? [] : (await cap.readChallengeEvents().selectAll()
      .where('challenge_id' as never, 'in', challenges.map((c) => String(c['challenge_id'])) as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    const promotion = ((await cap.readPromotions().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined) ?? null;
    return { ...withDays(r), events, reproductions,
             challenges: challenges.map((c) => ({ ...c, events: challengeEvents.filter((e) => String(e['challenge_id']) === String(c['challenge_id'])) })), promotion };
  }

  async list(cap: SimulationReads, twinId: string | null): Promise<unknown[]> {
    let q = cap.readRuns().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    const rows = ((await q.orderBy('opened_at' as never, 'desc').limit(200).execute()) as Array<Record<string, unknown>>).map(withDays);
    // B21 (0081): how many challenges are LIVE (open or awaiting a re-run) on each run — the columns fitness_state, promoted_for, twin_fitness, envelope_* and challenge_id ride selectAll().
    const live = rows.length === 0 ? [] : (await cap.readChallenges().select(['run_id'] as never)
      .where('run_id' as never, 'in', rows.map((r) => String(r['run_id'])) as never).where('state' as never, 'in', ['open', 'rerun_requested'] as never).execute()) as Array<Record<string, unknown>>;
    const counts = new Map<string, number>();
    for (const c of live) { const id = String(c['run_id']); counts.set(id, (counts.get(id) ?? 0) + 1); }
    return rows.map((r) => ({ ...r, live_challenges: counts.get(String(r['run_id'])) ?? 0 }));
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
