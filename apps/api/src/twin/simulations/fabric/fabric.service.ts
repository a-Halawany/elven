/**
 * CP-6 B30 part `experiments` (0103 §EX) — THE FABRIC SERVICE: what the routes compute between their read and their write (the B29
 * rule: a model executes outside any write). The ENVELOPE SWEEP runs the pinned supply-flow@1 over a run's STORED contract (sweep-core.ts);
 * the BENCHMARK VALIDATION is arithmetic over the run's stored paths and the entered sample (benchmark-core.ts). The ports re-check and
 * recompute what they can (simulation.sweep_envelope, simulation.validate_benchmark); a run with nothing to analyse is passed on as such
 * and the port answers its state. Every figure is SYNTHETIC where a harness or the demonstration seeds it.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { SUPPLY_FLOW_METHOD_REF } from '../../models/supply-flow.js';
import { contractOf } from '../simulation.service.js';
import { SUPPLY_METRICS, type SupplyMetric } from '../impact/impact-core.js';
import { envelopeSweep, sweepDigest, type FactorResponse, type Interaction } from './sweep-core.js';
import { benchmarkValidation, BENCHMARK_RULE } from './benchmark-core.js';
import { measureOf, type Measure } from './fabric-plan.js';

type Row = Record<string, unknown>;
const ZERO = '0'.repeat(64);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (correlationId: string, message: string, status = 422): never => {
  throw new HttpException(errorBody(status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, message), status);
};

export interface SweepIntake { metric: SupplyMetric; gridPoints: number }
export interface BenchmarkIntake { measure: Measure; kind: 'observed' | 'benchmark'; values: number[]; basis: string; citations: unknown[]; tolerance: number; tailThreshold: number | null }

export function validateSweepIntake(p: Row, correlationId: string): SweepIntake {
  const metric = p['metric'] === undefined ? 'total_cost' : p['metric'];
  if (typeof metric !== 'string' || !(SUPPLY_METRICS as readonly string[]).includes(metric)) bad(correlationId, `envelope sweep rejected (metric): the metric is one of ${SUPPLY_METRICS.join(', ')}`);
  const g = p['gridPoints'] === undefined ? 9 : p['gridPoints'];
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 3 || g > 25) bad(correlationId, 'envelope sweep rejected (grid): gridPoints is an integer in [3, 25]');
  return { metric: metric as SupplyMetric, gridPoints: g as number };
}

export function validateBenchmarkIntake(p: Row, correlationId: string): BenchmarkIntake {
  const measure = p['measure'];
  if (typeof measure !== 'string' || !(SUPPLY_METRICS as readonly string[]).includes(measure)) bad(correlationId, `benchmark validation rejected (measure): the measure is one of ${SUPPLY_METRICS.join(', ')}`);
  const kind = p['kind'];
  if (kind !== 'observed' && kind !== 'benchmark') bad(correlationId, 'benchmark validation rejected (kind): the comparison is against an observed or a benchmark sample');
  const values = p['values'];
  if (!Array.isArray(values) || values.length === 0 || values.length > 10_000 || !values.every((v) => typeof v === 'number' && Number.isFinite(v))) bad(correlationId, 'benchmark validation rejected (benchmark): values is 1 to 10000 numbers');
  const basis = typeof p['basis'] === 'string' ? p['basis'].trim() : '';
  const citations = p['citations'] === undefined || p['citations'] === null ? [] : p['citations'];
  if (!Array.isArray(citations)) bad(correlationId, 'benchmark validation rejected (citations): citations is a list of {kind, id, version, digest}');
  const tol = p['tolerance'] === undefined ? 0.1 : p['tolerance'];
  if (typeof tol !== 'number' || !(tol > 0 && tol <= 1)) bad(correlationId, 'benchmark validation rejected (tolerance): the tolerance is a fraction in (0, 1]');
  const thr = p['tailThreshold'] === undefined || p['tailThreshold'] === null ? null : p['tailThreshold'];
  if (thr !== null && (typeof thr !== 'number' || !Number.isFinite(thr))) bad(correlationId, 'benchmark validation rejected (tail): tailThreshold, when given, is a number');
  return { measure: measure as Measure, kind: kind as 'observed' | 'benchmark', values: values as number[], basis, citations: citations as unknown[], tolerance: tol as number, tailThreshold: thr as number | null };
}

export const uuidOrNull = (v: unknown, what: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) return bad(correlationId, what);
  return v;
};

/** The values of one measure in a run's outputs, in path order (simulation.sxp_run_values' rule): its sample totals, else its single total. */
export function runValuesOf(outputs: unknown, measure: Measure): number[] {
  const o = (outputs ?? {}) as Row;
  const st = ((o['stochastic'] ?? {}) as Row)['sample_totals'];
  if (Array.isArray(st) && st.length > 0) return st.map((t) => measureOf(t as Row, measure));
  const totals = o['totals'];
  if (totals !== null && typeof totals === 'object' && !Array.isArray(totals)) return [measureOf(totals as Row, measure)];
  return [];
}

@Injectable()
export class FabricService {
  /** THE ENVELOPE SWEEP over the run's stored contract (supply-flow@1's deterministic trajectory); a run with nothing to sweep is passed on for the port to answer. */
  sweep(run: Row, model: Row | null, intake: SweepIntake, correlationId: string): { outputsDigest: string; base: number; factors: FactorResponse[]; interactions: Interaction[]; digest: string } {
    const outputsDigest = typeof run['outputs_digest'] === 'string' ? run['outputs_digest'] : '';
    if (run['model_ref'] !== SUPPLY_FLOW_METHOD_REF || outputsDigest === '' || run['state'] !== 'completed') {
      return { outputsDigest: outputsDigest || ZERO, base: 0, factors: [], interactions: [], digest: ZERO };
    }
    const c = contractOf(run);
    let s: ReturnType<typeof envelopeSweep>;
    try {
      s = envelopeSweep({ params: c.params, options: c.options, interventions: c.interventions, envelope: ((model?.['operating_envelope'] ?? {}) as Row), metric: intake.metric, points: intake.gridPoints });
    } catch (e) { return bad(correlationId, `envelope sweep rejected (grid): ${e instanceof Error ? e.message : String(e)}`); }
    const digest = sweepDigest({ run_id: run['run_id'], outputs_digest: outputsDigest, metric: intake.metric, grid_points: intake.gridPoints, base: s.base, factors: s.factors, interactions: s.interactions });
    return { outputsDigest, ...s, digest };
  }

  /** THE BENCHMARK VALIDATION over the run's stored paths of the measure; the port recomputes the discrepancy and the tail and decides the verdict. */
  benchmark(run: Row, intake: BenchmarkIntake): { outputsDigest: string; discrepancy: unknown; tail: unknown; convergence: unknown; verdict: string; digest: string } {
    const outputsDigest = typeof run['outputs_digest'] === 'string' && run['outputs_digest'] !== '' ? run['outputs_digest'] : ZERO;
    const values = runValuesOf(run['outputs'], intake.measure);
    if (values.length === 0 || values.some((v) => !Number.isFinite(v))) return { outputsDigest, discrepancy: {}, tail: {}, convergence: {}, verdict: 'insufficient', digest: ZERO };
    const v = benchmarkValidation(values, run['stochastic_mode'] === 'seeded', intake.values, intake.tolerance, intake.tailThreshold);
    const digest = sweepDigest({ rule: BENCHMARK_RULE, run_id: run['run_id'], outputs_digest: outputsDigest, measure: intake.measure, kind: intake.kind, values: intake.values, basis: intake.basis,
                                 tolerance: intake.tolerance, tail_threshold: intake.tailThreshold, ...v });
    return { outputsDigest, ...v, digest };
  }
}
