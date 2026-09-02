/**
 * Executable coverage and source health — PHASE1_PLAN §6, acceptance A6.
 *
 * THE RULE THAT SHAPES EVERY LINE HERE: state is never computed from an unstored
 * `now`. Every measurement carries the evaluation instant it was computed at, and
 * the health timeline is derived from stored measurements and stored events only,
 * so replaying the stream reproduces the identical timeline — which is what A6
 * asserts and what makes the panel defensible a year later.
 *
 * The second rule: `unknown`, `indeterminate` and `insufficient_evidence` NEVER
 * map to a healthy state. A source we cannot measure is a fact about our
 * coverage, not an absence to round away. 60 of 62 days measured is not 96.8%
 * rounded to healthy — it is 96.8% actual coverage AND completeness
 * `insufficient_evidence`, reported side by side.
 */
import { Inject, Injectable } from '@nestjs/common';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AcquisitionWrites, MeasurementArgs, ObservationReads } from '../observation.capabilities.js';

export const CALC_VERSION = 'coverage-calc@1.1.0';

/**
 * Dimensions that are UNKNOWN BY CONSTRUCTION in Phase 1 and will stay unknown
 * until a later phase supplies what they need. They are always displayed as
 * unknown and are never rendered as healthy; they are excluded from the health
 * roll-up only so that "unknown" does not become the permanent state of every
 * source, which would make the signal useless rather than honest.
 */
export const STRUCTURALLY_UNKNOWN = ['authenticity', 'blind_spots', 'degraded_regions'];

/**
 * The dimensions the SOURCE HEALTH signal rolls up.
 *
 * Health answers one question: are we collecting what this contract says we
 * should? That is expected coverage, actual coverage, freshness and completeness.
 *
 * Latency, correction lag, authenticity, blind spots and degraded regions are
 * real measurements and are always displayed in their own right — but they
 * describe the QUALITY and CONTEXT of what we hold, not whether collection is
 * working. Rolling them in would make a source that has simply never been
 * corrected indistinguishable from one that has stopped collecting, which is the
 * kind of conflation that teaches an operator to ignore the panel. They feed the
 * decision-use constraint instead, where they are recorded rather than averaged.
 */
export const COLLECTION_HEALTH_DIMENSIONS = [
  'expected_coverage', 'actual_coverage', 'freshness', 'completeness',
];

/**
 * The standing constraint the structural unknowns place on anything that uses
 * this source's evidence. It is RETURNED AND RECORDED, not merely displayed.
 */
export function decisionUseConstraint(dims: DimensionResult[]): string | null {
  const open = dims.filter(
    (d) => !COLLECTION_HEALTH_DIMENSIONS.includes(d.dimension)
      && d.state !== 'not_applicable' && d.state !== 'measured',
  );
  if (open.length === 0) return null;
  return `evidence from this source carries unresolved ${open.map((d) => d.dimension).join(', ')}: it may be used, and it may not be presented as established on those dimensions`;
}

export type MeasurementState =
  | 'measured' | 'unknown' | 'indeterminate' | 'not_applicable' | 'insufficient_evidence';

export type HealthState = 'healthy' | 'degraded' | 'unknown' | 'suspended' | 'failed';

export interface CoverageInput {
  sourceId: string;
  /** The evaluation instant, supplied by the caller and STORED on every row. */
  evaluatedAt: string;
  windowStart: string;
  windowEnd: string;
  universeVersion: string;
  /** Contract-declared expectation of how many items the window should contain. */
  expectedItems: number | null;
  denominatorDerivation: string;
  /** Dimensions the CONTRACT approves as not applicable, with its reason. */
  notApplicableDimensions: string[];
  notApplicableReason: string | null;
  freshnessThresholdSeconds: number;
}

export interface ObservedFacts {
  /** Distinct admitted items within the window. */
  admittedInWindow: number;
  /** Distinct evaluation buckets (e.g. days) that actually carry an admission. */
  bucketsCovered: number;
  bucketsExpected: number | null;
  /** Latest admitted item's OBSERVATION time, or null if the source has none. */
  lastAdmittedAt: string | null;
  /** Latest SUCCESSFUL run, whether or not it produced an item. */
  lastSuccessfulRunAt: string | null;
  /** Latest FAILED run. */
  lastFailedRunAt: string | null;
  /** Median publication-to-admission latency, in seconds, when derivable. */
  medianLatencySeconds: number | null;
  correctionCount: number;
  medianCorrectionLagSeconds: number | null;
  evidenceRefs: string[];
}

export interface DimensionResult {
  dimension: string;
  state: MeasurementState;
  valueNumeric: number | null;
  valueText: string | null;
  denominator: number | null;
  naReason: string | null;
  errorClass: string | null;
  confidence: string;
}

@Injectable()
export class CoverageService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  /**
   * Compute all nine dimensions from STORED facts. A pure function of its inputs:
   * given the same facts it returns the same results, which is what makes the
   * replay deterministic rather than merely repeatable-in-practice.
   */
  compute(input: CoverageInput, facts: ObservedFacts): DimensionResult[] {
    const na = (d: string): DimensionResult | null =>
      input.notApplicableDimensions.includes(d)
        ? {
            dimension: d, state: 'not_applicable', valueNumeric: null, valueText: null,
            denominator: null, naReason: input.notApplicableReason, errorClass: null,
            confidence: 'contract-declared',
          }
        : null;

    const out: DimensionResult[] = [];

    // expected_coverage — what the contract says the window should contain.
    out.push(na('expected_coverage') ?? (input.expectedItems === null
      ? {
          dimension: 'expected_coverage', state: 'unknown', valueNumeric: null,
          valueText: 'the contract declares no expected item count for this window',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : {
          dimension: 'expected_coverage', state: 'measured', valueNumeric: 100,
          valueText: null, denominator: input.expectedItems, naReason: null,
          errorClass: null, confidence: 'contract-declared',
        }));

    // actual_coverage — what we actually hold, against that denominator.
    out.push(na('actual_coverage') ?? (input.expectedItems === null || input.expectedItems === 0
      ? {
          dimension: 'actual_coverage', state: 'unknown', valueNumeric: null,
          valueText: 'no denominator is derivable, so a percentage would be invented',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : {
          dimension: 'actual_coverage', state: 'measured',
          valueNumeric: round2((facts.admittedInWindow / input.expectedItems) * 100),
          valueText: null, denominator: input.expectedItems, naReason: null,
          errorClass: null, confidence: 'derived-from-admissions',
        }));

    // freshness — how long since the last admitted item, against the threshold.
    out.push(na('freshness') ?? (facts.lastAdmittedAt === null
      ? {
          dimension: 'freshness', state: 'insufficient_evidence', valueNumeric: null,
          valueText: 'no item has ever been admitted for this source',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : {
          dimension: 'freshness', state: 'measured',
          valueNumeric: secondsBetween(facts.lastAdmittedAt, input.evaluatedAt),
          valueText: null, denominator: input.freshnessThresholdSeconds,
          naReason: null, errorClass: null, confidence: 'derived-from-admissions',
        }));

    // completeness — buckets covered against buckets expected. A GAP IS NOT
    // ROUNDED AWAY: any missing bucket makes this insufficient_evidence, and the
    // percentage is still reported beside it so the operator sees both.
    out.push(na('completeness') ?? (facts.bucketsExpected === null
      ? {
          dimension: 'completeness', state: 'unknown', valueNumeric: null,
          // The honest reason, not a shrug: either the contract declares no
          // interval, or the source's payload is opaque to this phase and its
          // items carry no publisher time to place them on a timeline. Reading
          // inside an opaque payload to find out is semantic extraction, which
          // arrives in Phase 2.
          valueText:
            'completeness cannot be measured: this source’s evidence is not addressable one item per declared interval, so which intervals it covers is not knowable without interpreting the payload',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : facts.bucketsCovered < facts.bucketsExpected
        ? {
            dimension: 'completeness', state: 'insufficient_evidence',
            valueNumeric: round2((facts.bucketsCovered / facts.bucketsExpected) * 100),
            valueText: `${facts.bucketsExpected - facts.bucketsCovered} of ${facts.bucketsExpected} expected series-intervals carry no admitted evidence`,
            denominator: facts.bucketsExpected, naReason: null, errorClass: null,
            confidence: 'derived-from-admissions',
          }
        : {
            dimension: 'completeness', state: 'measured', valueNumeric: 100,
            valueText: null, denominator: facts.bucketsExpected, naReason: null,
            errorClass: null, confidence: 'derived-from-admissions',
          }));

    // latency — publication to admission.
    out.push(na('latency') ?? (facts.medianLatencySeconds === null
      ? {
          dimension: 'latency', state: 'insufficient_evidence', valueNumeric: null,
          valueText: 'no admitted item carries a publisher time to measure against',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : {
          dimension: 'latency', state: 'measured', valueNumeric: facts.medianLatencySeconds,
          valueText: null, denominator: null, naReason: null, errorClass: null,
          confidence: 'median-over-window',
        }));

    /*
     * authenticity — recorded as the FOUR SEPARATE CONCEPTS, never as one score.
     * Transport, byte integrity and origin are verifiable per item and are
     * measured elsewhere (on each EVD); what this dimension records is CONTENT
     * authenticity, and in cohort 1 no source declares a publisher-signature
     * mechanism, so the honest value is `unknown`. A green padlock here would be
     * the single most misleading thing this product could display.
     */
    out.push(na('authenticity') ?? {
      dimension: 'authenticity', state: 'unknown', valueNumeric: null,
      valueText: 'content authenticity: no publisher signature mechanism exists for this source. TLS and digests establish transport and byte integrity, not that the content genuinely originates from the claimed source.',
      denominator: null, naReason: null, errorClass: null, confidence: 'none',
    });

    // correction_lag — publisher correction to our handling of it.
    out.push(na('correction_lag') ?? (facts.correctionCount === 0
      ? {
          dimension: 'correction_lag', state: 'insufficient_evidence', valueNumeric: null,
          valueText: 'no correction has been observed for this source',
          denominator: null, naReason: null, errorClass: null, confidence: 'none',
        }
      : {
          dimension: 'correction_lag', state: 'measured',
          valueNumeric: facts.medianCorrectionLagSeconds, valueText: null,
          denominator: facts.correctionCount, naReason: null, errorClass: null,
          confidence: 'median-over-window',
        }));

    /*
     * blind_spots and degraded_regions are honestly UNKNOWN in Phase 1. Naming a
     * blind spot needs a model of what the source should cover in the world,
     * which is Phase 3 work. Reporting 0 here would claim we had looked.
     */
    out.push(na('blind_spots') ?? {
      dimension: 'blind_spots', state: 'unknown', valueNumeric: null,
      valueText: 'identifying blind spots requires a model of the source’s intended world coverage, which arrives with the knowledge graph in Phase 3',
      denominator: null, naReason: null, errorClass: null, confidence: 'none',
    });
    out.push(na('degraded_regions') ?? {
      dimension: 'degraded_regions', state: 'unknown', valueNumeric: null,
      valueText: 'regional degradation requires geospatial resolution of the source’s coverage, which Phase 1 does not perform',
      denominator: null, naReason: null, errorClass: null, confidence: 'none',
    });

    return out;
  }

  /**
   * Derive the health state from the computed dimensions.
   *
   * PUBLISHER LAG IS NOT COLLECTION FAILURE. A source whose last run succeeded
   * but whose publisher has not moved is `degraded` with lag_class
   * `publisher_lag`; a source whose runs are failing is `degraded` with
   * `collection_failure`. Conflating them is how an operator learns to ignore the
   * panel, so they are separate fields, not separate wordings of one field.
   */
  deriveHealth(
    dims: DimensionResult[],
    facts: ObservedFacts,
    input: CoverageInput,
  ): { state: HealthState; reason: string; lagClass: 'publisher_lag' | 'collection_failure' | 'none' | 'unknown' } {
    const freshness = dims.find((d) => d.dimension === 'freshness');
    const completeness = dims.find((d) => d.dimension === 'completeness');

    const runsFailing =
      facts.lastFailedRunAt !== null &&
      (facts.lastSuccessfulRunAt === null || facts.lastFailedRunAt > facts.lastSuccessfulRunAt);

    if (runsFailing) {
      return {
        state: 'failed',
        reason: 'the most recent collection run failed; this is a collection failure, not publisher lag',
        lagClass: 'collection_failure',
      };
    }

    if (freshness === undefined || freshness.state === 'insufficient_evidence') {
      return {
        state: 'unknown',
        reason: 'freshness cannot be measured: no item has been admitted for this source',
        lagClass: 'unknown',
      };
    }

    const stale =
      freshness.state === 'measured' &&
      freshness.valueNumeric !== null &&
      freshness.valueNumeric > input.freshnessThresholdSeconds;

    if (stale) {
      // The distinction the whole panel turns on.
      const collectionIsWorking =
        facts.lastSuccessfulRunAt !== null &&
        secondsBetween(facts.lastSuccessfulRunAt, input.evaluatedAt) < input.freshnessThresholdSeconds;
      return {
        state: 'degraded',
        reason: collectionIsWorking
          ? `the newest item is older than the ${input.freshnessThresholdSeconds}s threshold, but the last collection run succeeded and returned the same latest item — this is publisher lag, not a collection failure`
          : `the newest item is older than the ${input.freshnessThresholdSeconds}s threshold and no recent run has succeeded`,
        lagClass: collectionIsWorking ? 'publisher_lag' : 'collection_failure',
      };
    }

    // A gap in the series never presents as healthy, even when the newest item is
    // fresh. "Recent" and "complete" are different claims.
    if (completeness?.state === 'insufficient_evidence') {
      return {
        state: 'degraded',
        reason: completeness.valueText ?? 'the window contains intervals with no admitted evidence',
        lagClass: 'publisher_lag',
      };
    }

    /*
     * WHICH UNKNOWNS KEEP A SOURCE OUT OF `healthy`.
     *
     * §6 is emphatic that `unknown`, `indeterminate` and `insufficient_evidence`
     * never map to a healthy display state. Applied to EVERY dimension that would
     * make no source ever healthy, because three of them are STRUCTURALLY unknown
     * in this phase and will stay unknown until later phases arrive:
     * content authenticity (no publisher offers a signature mechanism),
     * blind spots and degraded regions (both need a model of the source's
     * intended world coverage, which is Phase 3).
     *
     * So the roll-up is over the dimensions this phase can actually measure, and
     * the structural unknowns are NOT swept up into a green light: they are
     * always displayed as unknown in their own right, and they are returned here
     * as a standing DECISION-USE CONSTRAINT recorded on the source. A reader sees
     * "healthy" beside "content authenticity: unknown", which is the honest
     * picture — not "healthy" instead of it.
     */
    const measurable = dims.filter((d) => COLLECTION_HEALTH_DIMENSIONS.includes(d.dimension));
    const unresolved = measurable.filter(
      (d) => d.state === 'indeterminate' || d.state === 'insufficient_evidence' || d.state === 'unknown',
    );
    if (unresolved.some((d) => d.state === 'indeterminate')) {
      return {
        state: 'unknown',
        reason: `${unresolved.filter((d) => d.state === 'indeterminate').map((d) => d.dimension).join(', ')} could not be evaluated`,
        lagClass: 'unknown',
      };
    }
    if (unresolved.length > 0) {
      return {
        state: 'unknown',
        reason: `${unresolved.map((d) => d.dimension).join(', ')} could not be measured for this source, so its coverage is not established`,
        lagClass: 'unknown',
      };
    }

    return {
      state: 'healthy',
      reason: 'freshness and completeness are within the contract’s expectations',
      lagClass: 'none',
    };
  }

  /** Persist a full evaluation: every dimension, then the transition if any. */
  async record(
    cap: AcquisitionWrites,
    ctx: ScopeContext,
    correlationId: string,
    input: CoverageInput,
    dims: DimensionResult[],
    health: { state: HealthState; reason: string; lagClass: string },
    priorState: string | null,
    evidenceRefs: string[],
  ): Promise<void> {
    const constraint = decisionUseConstraint(dims);
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    for (const d of dims) {
      const args: MeasurementArgs = {
        measurementId: newId(), tenantId, domainId, sourceId: input.sourceId,
        dimension: d.dimension, state: d.state,
        valueNumeric: d.valueNumeric, valueText: d.valueText,
        evaluatedAt: input.evaluatedAt,
        windowStart: input.windowStart, windowEnd: input.windowEnd,
        denominator: d.denominator, denominatorDerivation: input.denominatorDerivation,
        universeVersion: input.universeVersion,
        calcMethod: `dimension:${d.dimension}`, calcVersion: CALC_VERSION,
        evidenceRefs, applicability: d.state === 'not_applicable' ? 'not_applicable' : 'applicable',
        naReason: d.naReason, confidence: d.confidence, errorClass: d.errorClass,
        correlationId,
      };
      await cap.recordMeasurement(args);
    }
    // A transition is recorded only when the state actually changes: an unchanged
    // state appended every evaluation would turn the timeline into noise.
    if (priorState !== health.state) {
      await cap.appendHealthEvent({
        eventId: newId(), tenantId, domainId, sourceId: input.sourceId,
        prior: priorState, next: health.state, evaluatedAt: input.evaluatedAt,
        calcVersion: CALC_VERSION, universeVersion: input.universeVersion,
        evidenceRefs,
        // The transition's reason carries the standing constraint alongside it, so
        // the two are never separated in the record.
        reason: constraint === null ? health.reason : `${health.reason}. ${constraint}`,
        lagClass: health.lagClass,
        correlationId,
      });
    }
  }

  async currentHealth(cap: ObservationReads, sourceId: string): Promise<string | null> {
    const row = (await cap
      .readHealthEvents()
      .select(['new_state'])
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('evaluated_at' as never, 'desc')
      .orderBy('event_id' as never, 'desc')
      .limit(1)
      .executeTakeFirst()) as { new_state: string } | undefined;
    return row?.new_state ?? null;
  }

  async latestMeasurements(cap: ObservationReads, sourceId: string): Promise<Array<Record<string, unknown>>> {
    // The latest row PER DIMENSION, so the panel shows one current answer each.
    const rows = (await cap
      .readMeasurements()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('evaluated_at' as never, 'desc')
      .limit(200)
      .execute()) as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const d = String(r['dimension']);
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(r);
    }
    return out;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function secondsBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
}
