/**
 * THE WEAK-SIGNAL CAPABILITIES — CP-6 B28 (0088 §S; F-P4-10 weak-signal detection and the indicator workbench).
 *
 * The prediction capabilities' shape: one implementation, narrow interfaces, every write a SECURITY DEFINER port that asserts the
 * caller's own bound action. The Weak Signal Agent holds exactly two: `nominate` (the scan — the detectors read, the fired readings
 * nominated) and `rank`; the dispositions, the evidence, the independence test, the conditions and the escalation are a named human's
 * and their interfaces are not offered to it. The indicator registry's governance (govern, retire, renew) is a steward's.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class SignalsCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows[0] as { r?: Row } | undefined)?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SignalReads {
  readonly action: string;
  readSignals(): any;
  readSignalEvents(): any;
  readSignalEvidence(): any;
  readDetections(): any;
  readDetectors(): any;
  readRankings(): any;
  readIndicators(): any;
  readIndicatorEvents(): any;
  readCandidates(): any;
  /** The digest of a detector's functions as they stand now (prediction.signal_code_digest): equal to the registered one, or the code drifted. */
  currentDigest(functions: string[]): Promise<string | null>;
  /** A detector run on a stated series (the synthetic fixtures' false-positive controls): the pure measure function, nothing recorded. */
  measureSeries(a: { detectorKey: 'novelty' | 'acceleration' | 'change_point'; points: unknown[]; asOf: string; params: Row }): Promise<Row>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `prediction.signal.nominate`: the scan (a person's or the agent's) and an analyst's nomination. */
export interface SignalNominateWrites extends SignalReads {
  scan(a: { tenantId: string; domainId: string; asOf: string | null; runId: string | null; maxItems: number | null; actor: string; correlationId: string }): Promise<Row>;
  nominate(a: { signalId: string; tenantId: string; domainId: string; title: string; statement: string; subjectKind: string; subjectId: string | null; evidence: unknown[];
                observation: Row; baseline: Row; noveltyBasis: Row; confidence: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.rank`. */
export interface SignalRankWrites extends SignalReads {
  rank(a: { tenantId: string; domainId: string; runId: string | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.evidence.add` — corroboration. */
export interface SignalEvidenceWrites extends SignalReads {
  addEvidence(a: { signalId: string; tenantId: string; domainId: string; objectId: string; objectVersion: number | null; stance: string; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.independence.test`. */
export interface SignalIndependenceWrites extends SignalReads {
  testIndependence(a: { signalId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.dispose`. */
export interface SignalDispositionWrites extends SignalReads {
  dispose(a: { signalId: string; tenantId: string; domainId: string; disposition: string; note: string; falsify: unknown[] | null; reviewBy: string | null; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.conditions.set`. */
export interface SignalConditionWrites extends SignalReads {
  setConditions(a: { signalId: string; tenantId: string; domainId: string; strengthen: unknown[] | null; falsify: unknown[] | null; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.signal.escalate` — the intake's admitted action (0088 §0). */
export interface SignalEscalateWrites extends SignalReads {
  escalate(a: { signalId: string; tenantId: string; domainId: string; note: string; consequence: string; confidence: number | null; windowHours: number | null; affected: Row | null;
                expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** `prediction.indicator.govern` | `.retire` | `.renew`. */
export interface IndicatorGovernanceWrites extends SignalReads {
  govern(a: { indicatorId: string; tenantId: string; domainId: string; classification: string | null; expiresAt: string | null; reviewEveryDays: number | null; lineageNote: string | null; actor: string; correlationId: string }): Promise<Row>;
  retire(a: { indicatorId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  renew(a: { indicatorId: string; tenantId: string; domainId: string; expiresAt: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

const json = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
class SignalsCapabilityImpl extends SignalsCore
  implements SignalNominateWrites, SignalRankWrites, SignalEvidenceWrites, SignalIndependenceWrites, SignalDispositionWrites, SignalConditionWrites, SignalEscalateWrites, IndicatorGovernanceWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readSignals(): any { return this.from('prediction.signals_current'); }
  readSignalEvents(): any { return this.from('prediction.signal_events'); }
  readSignalEvidence(): any { return this.from('prediction.signal_evidence'); }
  readDetections(): any { return this.from('prediction.signal_detections'); }
  readDetectors(): any { return this.from('prediction.signal_detectors'); }
  readRankings(): any { return this.from('prediction.signal_rankings'); }
  readIndicators(): any { return this.from('prediction.indicators_current'); }
  readIndicatorEvents(): any { return this.from('prediction.indicator_events'); }
  readCandidates(): any { return this.from('prediction.warning_candidates'); }
  async currentDigest(functions: string[]): Promise<string | null> {
    const r = await this.one(sql`select jsonb_build_object('d', prediction.signal_code_digest(${functions}::text[])) as r`, 'signal_code_digest');
    return typeof r['d'] === 'string' ? r['d'] : null;
  }
  async measureSeries(a: { detectorKey: 'novelty' | 'acceleration' | 'change_point'; points: unknown[]; asOf: string; params: Row }): Promise<Row> {
    const fn = a.detectorKey === 'novelty' ? sql`prediction.signal_measure_novelty` : a.detectorKey === 'acceleration' ? sql`prediction.signal_measure_acceleration` : sql`prediction.signal_measure_change_point`;
    return this.one(sql`select ${fn}(${JSON.stringify(a.points)}::jsonb, ${a.asOf}::date, ${JSON.stringify(a.params)}::jsonb) as r`, a.detectorKey);
  }
  scan(a: Parameters<SignalNominateWrites['scan']>[0]): Promise<Row> {
    return this.one(sql`select prediction.scan_signals(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.asOf}::date, ${a.runId}::uuid, ${a.maxItems}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'scan_signals');
  }
  nominate(a: Parameters<SignalNominateWrites['nominate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.nominate_signal(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.statement}, ${a.subjectKind}, ${a.subjectId}::uuid,
      ${JSON.stringify(a.evidence)}::jsonb, ${JSON.stringify(a.observation)}::jsonb, ${JSON.stringify(a.baseline)}::jsonb, ${JSON.stringify(a.noveltyBasis)}::jsonb, ${a.confidence}::numeric,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'nominate_signal');
  }
  rank(a: Parameters<SignalRankWrites['rank']>[0]): Promise<Row> {
    return this.one(sql`select prediction.rank_signals(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rank_signals');
  }
  addEvidence(a: Parameters<SignalEvidenceWrites['addEvidence']>[0]): Promise<Row> {
    return this.one(sql`select prediction.add_signal_evidence(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectId}::uuid, ${a.objectVersion}::int, ${a.stance},
      ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'add_signal_evidence');
  }
  testIndependence(a: Parameters<SignalIndependenceWrites['testIndependence']>[0]): Promise<Row> {
    return this.one(sql`select prediction.test_signal_independence(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'test_signal_independence');
  }
  dispose(a: Parameters<SignalDispositionWrites['dispose']>[0]): Promise<Row> {
    return this.one(sql`select prediction.record_signal_disposition(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.disposition}, ${a.note}, ${json(a.falsify)}::jsonb,
      ${a.reviewBy}::timestamptz, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_signal_disposition');
  }
  setConditions(a: Parameters<SignalConditionWrites['setConditions']>[0]): Promise<Row> {
    return this.one(sql`select prediction.set_signal_conditions(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${json(a.strengthen)}::jsonb, ${json(a.falsify)}::jsonb,
      ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_signal_conditions');
  }
  escalate(a: Parameters<SignalEscalateWrites['escalate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.escalate_signal(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.consequence}, ${a.confidence}::numeric, ${a.windowHours}::int,
      ${json(a.affected)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'escalate_signal');
  }
  govern(a: Parameters<IndicatorGovernanceWrites['govern']>[0]): Promise<Row> {
    return this.one(sql`select prediction.govern_indicator(${a.indicatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.classification}, ${a.expiresAt}::timestamptz, ${a.reviewEveryDays}::int,
      ${a.lineageNote}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'govern_indicator');
  }
  retire(a: Parameters<IndicatorGovernanceWrites['retire']>[0]): Promise<Row> {
    return this.one(sql`select prediction.retire_indicator(${a.indicatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_indicator');
  }
  renew(a: Parameters<IndicatorGovernanceWrites['renew']>[0]): Promise<Row> {
    return this.one(sql`select prediction.renew_indicator(${a.indicatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expiresAt}::timestamptz, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'renew_indicator');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SignalsCapability = {
  read(tx: Tx, action: string): SignalReads { return new SignalsCapabilityImpl(tx, action); },
  nominate(tx: Tx, action: string): SignalNominateWrites { return new SignalsCapabilityImpl(tx, action); },
  rank(tx: Tx, action: string): SignalRankWrites { return new SignalsCapabilityImpl(tx, action); },
  evidence(tx: Tx, action: string): SignalEvidenceWrites { return new SignalsCapabilityImpl(tx, action); },
  independence(tx: Tx, action: string): SignalIndependenceWrites { return new SignalsCapabilityImpl(tx, action); },
  disposition(tx: Tx, action: string): SignalDispositionWrites { return new SignalsCapabilityImpl(tx, action); },
  conditions(tx: Tx, action: string): SignalConditionWrites { return new SignalsCapabilityImpl(tx, action); },
  escalate(tx: Tx, action: string): SignalEscalateWrites { return new SignalsCapabilityImpl(tx, action); },
  indicatorGovernance(tx: Tx, action: string): IndicatorGovernanceWrites { return new SignalsCapabilityImpl(tx, action); },
};
