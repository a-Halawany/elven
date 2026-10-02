/**
 * THE EARLY-WARNING LIFECYCLE'S CAPABILITIES — CP-6 B28 (migration 0088 §W; F-P4-12).
 *
 * The prediction module's shape (prediction.capabilities.ts): one implementation, narrow interfaces, every write a SECURITY DEFINER
 * port that asserts the caller's own bound action. Kept in its own file so the lifecycle's ports are read in one place:
 *
 *   CandidateProcessWrites   prediction.process_warning_candidates — the attention tick (executive.attention.tick) and a person's route
 *                            (prediction.warning.candidates.process): cluster, storm, refuse; the raise-due answered, never raised here
 *   CandidateRaiseWrites     prediction.warning_candidate_preflight + prediction.raise_candidate_warning under prediction.warning.raise
 *                            (the WRN object admitted first, raise_warning called by the port, the cluster and its lead member)
 *   ContextWrites            prediction.set_warning_context (prediction.warning.context.set)
 *   CloseWrites              prediction.close_warning (prediction.warning.close)
 *   FeedbackWrites           prediction.record_warning_feedback (prediction.warning.feedback)
 *   EvaluateWrites           prediction.evaluate_warnings (prediction.warning.evaluate)
 *   ExpiryWrites             prediction.expire_warnings (the tick's `warning-expiry` step, executive.attention.tick)
 *   WarningSubscriberWrites  prediction.submit_warning_candidate (0088 §0; the warnings consumer, prediction.warning.subscription.apply)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WarningLifecycleReads {
  readonly action: string;
  readWarnings(): any;
  readWarningEvents(): any;
  readCandidates(): any;
  readClusters(): any;
  readMembers(): any;
  readFeedback(): any;
  readEvaluations(): any;
  readForecasts(): any;
  readStrategy(): any;
  readTwins(): any;
  /** The latest canonical version of each object — the controls a raised warning inherits from its candidate's evidence. */
  canonicalLatest(ids: string[]): Promise<Row[]>;
  /** 0088 §W7: the active source-impact markers on the warning, its forecast and its members' sources. */
  coverageGaps(warningId: string): Promise<Row[]>;
  dedupKey(causeKey: string, affected: Row): Promise<string>;
  stormRule(): Promise<Row>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CandidateProcessWrites extends WarningLifecycleReads {
  processCandidates(a: { tenantId: string; domainId: string; limit: number; actor: string; correlationId: string }): Promise<Row>;
}

export interface CandidateRaiseWrites extends WarningLifecycleReads {
  preflight(a: { candidateId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  deriveWarningLevel(consequenceClass: string): Promise<{ version: number; level: string; urgency: string; response: string; impact: string }>;
  raiseCandidate(a: { candidateId: string; tenantId: string; domainId: string; raise: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

export interface ContextWrites extends WarningLifecycleReads {
  setContext(a: { warningId: string; tenantId: string; domainId: string; expectedVersion: number; contradicting: unknown[]; affected: Row; falsification: unknown[]; playbook: Row | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface CloseWrites extends WarningLifecycleReads {
  close(a: { warningId: string; tenantId: string; domainId: string; criterion: string; ref: Row; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface FeedbackWrites extends WarningLifecycleReads {
  feedback(a: { feedbackId: string; warningId: string; tenantId: string; domainId: string; kind: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface EvaluateWrites extends WarningLifecycleReads {
  evaluate(a: { evaluationId: string; tenantId: string; domainId: string; from: string | null; to: string | null; minSample: number; actor: string; correlationId: string }): Promise<Row>;
}
export interface ExpiryWrites extends WarningLifecycleReads {
  expire(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<number>;
}
export interface WarningSubscriberWrites extends WarningLifecycleReads {
  submitCandidate(a: {
    tenantId: string; domainId: string; originKind: string; originKey: string; originRef: Row; title: string; consequenceClass: string; confidence: number | null;
    causeKey: string; affected: Row; evidence: Row[]; windowHours: number | null; actor: string; correlationId: string;
  }): Promise<Row>;
}

const one = (rows: Array<{ r: Row }>, what: string): Row => {
  const r = rows[0]?.r;
  if (r === undefined || r === null) throw new Error(`${what} returned no row`);
  return r;
};

class WarningLifecycleImpl implements CandidateProcessWrites, CandidateRaiseWrites, ContextWrites, CloseWrites, FeedbackWrites, EvaluateWrites, ExpiryWrites, WarningSubscriberWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  readWarningEvents(): any { return this.from('prediction.warning_events'); }
  readCandidates(): any { return this.from('prediction.warning_candidates'); }
  readClusters(): any { return this.from('prediction.warning_clusters'); }
  readMembers(): any { return this.from('prediction.warning_cluster_members'); }
  readFeedback(): any { return this.from('prediction.warning_feedback'); }
  readEvaluations(): any { return this.from('prediction.warning_evaluations'); }
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async canonicalLatest(ids: string[]): Promise<Row[]> {
    if (ids.length === 0) return [];
    return this.call<Row>(sql`select distinct on (o.object_id) o.object_id::text, o.object_type, o.object_version::int, o.synthetic_state, o.classification, o.rights_profile,
                                     o.residency_profile, o.retention_profile, o.access_policy_ref
                                from objects.canonical_objects o where o.object_id = any(${ids}::uuid[]) order by o.object_id, o.object_version desc`);
  }
  async coverageGaps(warningId: string): Promise<Row[]> {
    const rows = await this.call<{ g: Row[] }>(sql`select prediction.warning_coverage_gaps(${warningId}::uuid) as g`);
    return rows[0]?.g ?? [];
  }
  async dedupKey(causeKey: string, affected: Row): Promise<string> {
    const rows = await this.call<{ k: string }>(sql`select prediction.warning_dedup_key(${causeKey}, ${JSON.stringify(affected)}::jsonb) as k`);
    return String(rows[0]?.k ?? '');
  }
  async stormRule(): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.warning_storm_rule() as r`), 'warning_storm_rule');
  }

  async processCandidates(a: Parameters<CandidateProcessWrites['processCandidates']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.process_warning_candidates(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'process_warning_candidates');
  }
  async preflight(a: Parameters<CandidateRaiseWrites['preflight']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.warning_candidate_preflight(${a.candidateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'warning_candidate_preflight');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }
  async deriveWarningLevel(consequenceClass: string): Promise<{ version: number; level: string; urgency: string; response: string; impact: string }> {
    const rows = await this.call<{ out_version: number; out_level: string; out_urgency: string; out_response: string; out_impact: string }>(
      sql`select out_version, out_level, out_urgency, out_response, out_impact from prediction.derive_warning_level(${consequenceClass}, null)`);
    const r = rows[0];
    if (r === undefined) throw new Error(`no warning level derivation for class ${consequenceClass}`);
    return { version: r.out_version, level: r.out_level, urgency: r.out_urgency, response: r.out_response, impact: r.out_impact };
  }
  async raiseCandidate(a: Parameters<CandidateRaiseWrites['raiseCandidate']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.raise_candidate_warning(${a.candidateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.raise)}::jsonb,
                                                                                         ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`), 'raise_candidate_warning');
  }
  async setContext(a: Parameters<ContextWrites['setContext']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.set_warning_context(${a.warningId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int,
      ${JSON.stringify(a.contradicting)}::jsonb, ${JSON.stringify(a.affected)}::jsonb, ${JSON.stringify(a.falsification)}::jsonb, ${a.playbook === null ? null : JSON.stringify(a.playbook)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'set_warning_context');
  }
  async close(a: Parameters<CloseWrites['close']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.close_warning(${a.warningId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.criterion}, ${JSON.stringify(a.ref)}::jsonb, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`), 'close_warning');
  }
  async feedback(a: Parameters<FeedbackWrites['feedback']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.record_warning_feedback(${a.feedbackId}::uuid, ${a.warningId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.note},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'record_warning_feedback');
  }
  async evaluate(a: Parameters<EvaluateWrites['evaluate']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.evaluate_warnings(${a.evaluationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::timestamptz, ${a.to}::timestamptz,
      ${a.minSample}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'evaluate_warnings');
  }
  async expire(a: Parameters<ExpiryWrites['expire']>[0]): Promise<number> {
    const rows = await this.call<{ n: number }>(sql`select prediction.expire_warnings(${a.tenantId}::uuid, ${a.domainId}::uuid, null::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as n`);
    return Number(rows[0]?.n ?? 0);
  }
  async submitCandidate(a: Parameters<WarningSubscriberWrites['submitCandidate']>[0]): Promise<Row> {
    return one(await this.call<{ r: Row }>(sql`select prediction.submit_warning_candidate(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.originKind}, ${a.originKey}, ${JSON.stringify(a.originRef)}::jsonb,
      ${a.title}, ${a.consequenceClass}, ${a.confidence}::numeric, ${a.causeKey}, ${JSON.stringify(a.affected)}::jsonb, ${JSON.stringify(a.evidence)}::jsonb, ${a.windowHours}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`), 'submit_warning_candidate');
  }
}

export const WarningLifecycleCapability = {
  read(tx: Tx, action: string): WarningLifecycleReads { return new WarningLifecycleImpl(tx, action); },
  process(tx: Tx, action: string): CandidateProcessWrites { return new WarningLifecycleImpl(tx, action); },
  raise(tx: Tx, action: string): CandidateRaiseWrites { return new WarningLifecycleImpl(tx, action); },
  context(tx: Tx, action: string): ContextWrites { return new WarningLifecycleImpl(tx, action); },
  close(tx: Tx, action: string): CloseWrites { return new WarningLifecycleImpl(tx, action); },
  feedback(tx: Tx, action: string): FeedbackWrites { return new WarningLifecycleImpl(tx, action); },
  evaluate(tx: Tx, action: string): EvaluateWrites { return new WarningLifecycleImpl(tx, action); },
  expiry(tx: Tx, action: string): ExpiryWrites { return new WarningLifecycleImpl(tx, action); },
  subscriber(tx: Tx, action: string): WarningSubscriberWrites { return new WarningLifecycleImpl(tx, action); },
};
