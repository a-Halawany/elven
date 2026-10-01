/**
 * IMPACT ANALYSIS — the service of CP-6 B31 part `impact` (migration 0099 §I; F-P5-07; F-P4-08's comparator sensitivity).
 *
 * THE ORDER OF A COMPUTED ANALYSIS (the B29 rule: a model executes outside any write). The route READS the run, its behaviour model and —
 * for a second-order derivation — the live links reachable from its twin and the linked twins' admitted elements (simulation.impact.read,
 * a consequential read under the caller's RLS); this service EXECUTES the pinned model over the run's STORED contract (supply-flow@1
 * in process; a fabric method through the method runner, contained and out of process); the route then WRITES the record through the
 * port (simulation.impact.sensitivity | simulation.impact.second_order), which re-checks the run (completed, valid, the same outputs
 * digest) and every shape it can. The value of information and the probability statement are COMPUTED BY THEIR PORTS from governed
 * records; this service only validates their intake.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { simulateSupplyFlow, SUPPLY_FLOW_METHOD_REF, type SupplyFlowOutputs } from '../../models/supply-flow.js';
import { contractOf, methodInputOf, SimulationService } from '../simulation.service.js';
import { containmentOf } from '../../methods/method-runner.js';
import {
  SUPPLY_METRICS, digestOf, movedLeaf, numericLeaves, rankFactors, round6, secondOrder, summaryMetric, supplyFlowRobustness, supplyFlowSweep, verdictOf, withPath,
  type ChainLink, type ChainTwin, type Effect, type Factor, type Robustness, type SensitivityIntake, type SupplyMetric,
} from './impact-core.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, message: string, status = 422): never => {
  throw new HttpException(errorBody(status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, message), status);
};

/** What the route read before the computation (simulation.impact.read). */
export interface SensitivityInputs { run: Row; model: Row | null }
export interface SecondOrderInputs { run: Row; twinTitle: string; links: Row[]; twins: Map<string, ChainTwin> }

export interface ComputedSensitivity { outputsDigest: string; metric: string; relative: number; base: number; factors: Factor[]; seeds: number[] | null; robustness: Robustness; timingShiftDays: number | null; digest: string }

@Injectable()
export class ImpactService {
  constructor(private readonly simulations: SimulationService) {}

  /** THE SWEEP, executed over the run's stored contract: supply-flow@1 in process; a fabric method through the method runner. */
  async sensitivity(inputs: SensitivityInputs, intake: SensitivityIntake, correlationId: string): Promise<ComputedSensitivity> {
    const r = inputs.run;
    const outputsDigest = typeof r['outputs_digest'] === 'string' ? r['outputs_digest'] : '';
    const modelRef = String(r['model_ref']);
    const envelope = ((inputs.model?.['operating_envelope'] ?? {}) as Record<string, unknown>);
    if (r['outputs'] === null || r['outputs'] === undefined || outputsDigest === '') {
      // Nothing was produced to analyse: the port answers the run's state (a failed, partial or opened run is not analysed).
      return { outputsDigest: '0'.repeat(64), metric: intake.metric, relative: intake.relative, base: 0, factors: [], seeds: null, robustness: { verdict: 'not_assessed' }, timingShiftDays: null, digest: '0'.repeat(64) };
    }
    let base: number; let factors: Factor[]; let robustness: Robustness = { verdict: 'not_assessed' };
    if (modelRef === SUPPLY_FLOW_METHOD_REF) {
      if (!(SUPPLY_METRICS as readonly string[]).includes(intake.metric)) bad(correlationId, `impact analysis rejected (metric): ${modelRef} reads ${SUPPLY_METRICS.join(', ')}; ${intake.metric} is not one of its outputs`);
      const metric = intake.metric as SupplyMetric;
      const contract = contractOf(r);
      const named = intake.parameters;
      const snapshotKeys = ((r['initial_state'] as Array<{ key: string; kind: string }>) ?? []).map((e) => ({ key: e.key, kind: e.kind }))
        .filter((e) => named === null || named.some((k) => e.key === k || e.key.startsWith(`${k}:`)));
      if (named !== null && snapshotKeys.length === 0) bad(correlationId, `impact analysis rejected (parameters): none of ${named.join(', ')} is an element key of the run's snapshot`);
      const sweep = supplyFlowSweep({ params: contract.params, options: contract.options, interventions: contract.interventions, snapshotKeys, relative: intake.relative, metric, envelope,
                                      shiftDays: intake.timingShiftDays });
      base = sweep.base; factors = sweep.factors;
      if (intake.seeds !== null) {
        const jitter = intake.jitter ?? (r['stochastic_mode'] === 'seeded' ? (r['jitter'] as Record<string, number> | null) : null);
        if (jitter === null || Object.keys(jitter).length === 0) {
          bad(correlationId, 'impact analysis rejected (robustness): a deterministic run declares the lead-time jitter its robustness is judged under (jitter: {days: probability})');
        }
        robustness = supplyFlowRobustness({ params: contract.params, options: contract.options, interventions: contract.interventions, snapshotKeys, relative: intake.relative, metric, envelope,
                                            shiftDays: intake.timingShiftDays, seeds: intake.seeds, samples: intake.samples, jitter: jitter as Record<string, number> });
      }
    } else {
      const fabric = await this.fabricSweep(r, inputs.model, intake, correlationId);
      base = fabric.base; factors = fabric.factors; robustness = fabric.robustness;
    }
    const digest = digestOf({ run_id: r['run_id'], outputs_digest: outputsDigest, metric: intake.metric, relative: intake.relative, base, factors, robustness, timing_shift_days: intake.timingShiftDays, parameters: intake.parameters });
    return { outputsDigest, metric: intake.metric, relative: intake.relative, base, factors, seeds: intake.seeds, robustness, timingShiftDays: intake.timingShiftDays, digest };
  }

  /**
   * A FABRIC METHOD's sweep: each numeric leaf of the run's stored parameters moved ±relative and EXECUTED through the method runner under
   * the registry row's containment (out of process, bounded); the metric is a numeric value of the method's summary; the base is the run's
   * own stored summary. Robustness: the same under each seed (a seeded run only — a deterministic method has no seed to vary).
   */
  private async fabricSweep(r: Row, model: Row | null, intake: SensitivityIntake, correlationId: string): Promise<{ base: number; factors: Factor[]; robustness: Robustness }> {
    const modelRef = String(r['model_ref']);
    const stored = ((r['outputs'] as Row | null)?.['summary'] ?? {}) as Record<string, unknown>;
    const base = summaryMetric(stored, intake.metric);
    if (base === null) {
      bad(correlationId, `impact analysis rejected (metric): ${modelRef}'s summary carries no numeric ${intake.metric} (it carries ${Object.keys(stored).join(', ') || 'nothing'})`);
    }
    if (intake.timingShiftDays !== null) bad(correlationId, 'impact analysis rejected (timing): timing sensitivity moves supply-flow@1 interventions; a fabric run\'s dates are its parameters');
    const input = methodInputOf(r);
    const containment = containmentOf(model?.['containment']);
    const all = numericLeaves(input.params);
    const unknown = (intake.parameters ?? []).filter((k) => !all.some((l) => l.path === k));
    if (unknown.length > 0) bad(correlationId, `impact analysis rejected (parameters): ${unknown.join(', ')} is not a numeric parameter of ${modelRef}'s run (it carries ${all.map((l) => l.path).join(', ') || 'none'})`);
    const leaves = (intake.parameters === null ? all : all.filter((l) => (intake.parameters as string[]).includes(l.path))).slice(0, 24);
    const execute = async (params: Record<string, unknown>, seed: number | null, label: string): Promise<number> => {
      const got = await this.simulations.execute({ modelRef, input: { ...input, params, seed }, containment });
      if (got.outcome !== 'ok') {
        bad(correlationId, `impact analysis rejected (execution): the execution of ${modelRef} with ${label} did not complete — name the parameters the method admits moved (parameters) (${got.outcome}${got.outcome === 'fault' ? `: ${got.kind} — ${got.message}` : got.outcome === 'invalid' ? `: ${got.problems.join('; ')}` : got.outcome === 'unavailable' ? `: ${got.reason}` : ''})`, 409);
      }
      const v = summaryMetric((got as Extract<typeof got, { outcome: 'ok' }>).output.summary as Record<string, unknown>, intake.metric);
      if (v === null) bad(correlationId, `impact analysis rejected (execution): the execution of ${modelRef} with ${label} answered no numeric ${intake.metric}`, 409);
      return v as number;
    };
    const sweepAt = async (seed: number | null, b: number): Promise<Array<Factor>> => {
      const rows: Array<Omit<Factor, 'rank'>> = [];
      for (const leaf of leaves) {
        const moved = movedLeaf(leaf.value, intake.relative);
        const lo = await execute(withPath(input.params, leaf.path, moved[0]), seed, `${leaf.path} = ${moved[0]}`);
        const hi = await execute(withPath(input.params, leaf.path, moved[1]), seed, `${leaf.path} = ${moved[1]}`);
        const dl = round6(lo - b); const dh = round6(hi - b);
        rows.push({ key: `params.${leaf.path}`, field: leaf.path, kind: 'parameter', element_kind: null, base_value: leaf.value, low: { value: moved[0], metric: lo }, high: { value: moved[1], metric: hi },
                    delta_low: dl, delta_high: dh, swing: round6(Math.max(Math.abs(dl), Math.abs(dh))), outside_envelope: false });
      }
      return rankFactors(rows);
    };
    const factors = await sweepAt(input.seed, base as number);
    let robustness: Robustness = { verdict: 'not_assessed' };
    if (intake.seeds !== null) {
      if (input.seed === null) bad(correlationId, `impact analysis rejected (robustness): run ${String(r['run_id'])} is deterministic; robustness across seeds needs a seeded method run`);
      const ranks: Record<string, string[]> = {};
      for (const seed of intake.seeds) ranks[String(seed)] = (await sweepAt(seed, await execute(input.params, seed, `seed ${seed}`))).map((f) => f.key);
      robustness = { verdict: verdictOf(ranks), ranks, basis: `the swing of each parameter on ${intake.metric} of the method's summary, per seed` };
    }
    return { base: base as number, factors, robustness };
  }

  /** THE SECOND-ORDER DERIVATION (rule second-order@1) of a supply-flow@1 run over the live links reachable from its twin. */
  secondOrder(inputs: SecondOrderInputs, correlationId: string): { outputsDigest: string; effects: Effect[] } {
    const r = inputs.run;
    const outputsDigest = typeof r['outputs_digest'] === 'string' ? r['outputs_digest'] : '';
    if (r['outputs'] === null || r['outputs'] === undefined || outputsDigest === '') return { outputsDigest: '0'.repeat(64), effects: [] };
    if (String(r['model_ref']) !== SUPPLY_FLOW_METHOD_REF) {
      bad(correlationId, `impact analysis rejected (method): rule second-order@1 reads a supply-flow@1 trajectory; run ${String(r['run_id'])} is ${String(r['model_ref'])}`);
    }
    const contract = contractOf(r);
    const run = r['outputs'] as SupplyFlowOutputs;
    const shocked = r['shock'] === true;
    const counterfactual = shocked ? simulateSupplyFlow(contract.params, { ...contract.options, shock: false }, contract.interventions) : run;
    const links: ChainLink[] = inputs.links.map((l) => ({ linkId: String(l['link_id']), upstreamTwinId: String(l['upstream_twin_id']), downstreamTwinId: String(l['downstream_twin_id']), mapping: l['mapping'] }));
    const effects = secondOrder({
      runTwin: { twinId: String(r['twin_id']), title: inputs.twinTitle, elements: [] }, run, counterfactual,
      counterfactualBasis: shocked ? 'the stored contract re-executed without the shock — the same interventions, the same seeds (paired sample by sample)' : 'the run applies no shock: its counterfactual is itself',
      links, twins: inputs.twins,
    });
    return { outputsDigest, effects };
  }
}
