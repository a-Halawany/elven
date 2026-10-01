/**
 * RECOMMENDATION CAPABILITIES — CP-6 B35 part `recommendation` (migration 0101 §R; F-P6-02 completed; F-P4-09's quality failure consulted;
 * F-P5-06's indicators read; the decision coverage of ES-37-008).
 *
 * The events idiom (products/events/events.capabilities.ts): one class, narrow views. Each write is a thin binding to a SECURITY DEFINER
 * port that asserts the route's own action, the scope and the acting principal (record_recommendation, review_recommendation,
 * withdraw_recommendation, attest_incomplete_package); each read is an invoker read under the caller's RLS (package_recommendations,
 * recommendation_completeness, recommendation_packages). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class RecommendationCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  protected async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    return (r.rows as Array<{ r: Row | null }>)[0]?.r ?? null;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface RecommendationReads {
  readonly action: string;
  now(): Promise<string>;
  /** decision.package_recommendations: the side-by-side view (null: the package is not visible). */
  packageRecommendations(packageId: string): Promise<Row | null>;
  /** decision.recommendation_completeness: the version's gaps, the attestation, the mode (null: not visible). */
  completeness(a: { packageId: string; version: number }): Promise<Row | null>;
  /** decision.recommendation_packages: the domain's packages with their recommendation counts, newest activity first. */
  packages(limit: number): Promise<Row[]>;
}

export interface RecordWrites extends RecommendationReads {
  record(a: { recommendationId: string; tenantId: string; domainId: string; packageId: string; version: number; optionKey: string; what: string; forWhom: string; byWhen: string;
    assumptions: Row[]; whatCouldMakeItWrong: Row[]; missingEvidence: Row[]; valueJudgments: Row[]; policyConstraints: Row[]; analyticalAssumptions: Row[]; modelOutputs: Row[];
    actor: string; correlationId: string }): Promise<Row>;
}
export interface ReviewWrites extends RecommendationReads {
  review(a: { reviewId: string; tenantId: string; domainId: string; recommendationId: string; verdict: string; rationale: string; override: string | null; expectedDigest: string | null;
    actor: string; correlationId: string }): Promise<Row>;
}
export interface WithdrawRecommendationWrites extends RecommendationReads {
  withdraw(a: { tenantId: string; domainId: string; recommendationId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface AttestWrites extends RecommendationReads {
  attest(a: { attestationId: string; tenantId: string; domainId: string; packageId: string | null; version: number | null; act: 'attest' | 'acknowledge'; missing: Row[];
    reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class RecommendationCapabilityImpl extends RecommendationCore implements RecordWrites, ReviewWrites, WithdrawRecommendationWrites, AttestWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async packageRecommendations(packageId: string): Promise<Row | null> {
    return this.maybe(sql`select decision.package_recommendations(${packageId}::uuid) as r`);
  }
  async completeness(a: Parameters<RecommendationReads['completeness']>[0]): Promise<Row | null> {
    return this.maybe(sql`select decision.recommendation_completeness(${a.packageId}::uuid, ${a.version}::int) as r`);
  }
  async packages(limit: number): Promise<Row[]> {
    const r = await this.maybe(sql`select decision.recommendation_packages(${limit}::int) as r`);
    return (r ?? []) as unknown as Row[];
  }
  async record(a: Parameters<RecordWrites['record']>[0]): Promise<Row> {
    return this.one(sql`select decision.record_recommendation(${a.recommendationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.optionKey},
      ${a.what}, ${a.forWhom}, ${a.byWhen}::date, ${JSON.stringify(a.assumptions)}::jsonb, ${JSON.stringify(a.whatCouldMakeItWrong)}::jsonb, ${JSON.stringify(a.missingEvidence)}::jsonb,
      ${JSON.stringify(a.valueJudgments)}::jsonb, ${JSON.stringify(a.policyConstraints)}::jsonb, ${JSON.stringify(a.analyticalAssumptions)}::jsonb, ${JSON.stringify(a.modelOutputs)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_recommendation');
  }
  async review(a: Parameters<ReviewWrites['review']>[0]): Promise<Row> {
    return this.one(sql`select decision.review_recommendation(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.recommendationId}::uuid, ${a.verdict}, ${a.rationale},
      ${a.override}, ${a.expectedDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_recommendation');
  }
  async withdraw(a: Parameters<WithdrawRecommendationWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select decision.withdraw_recommendation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.recommendationId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'withdraw_recommendation');
  }
  async attest(a: Parameters<AttestWrites['attest']>[0]): Promise<Row> {
    return this.one(sql`select decision.attest_incomplete_package(${a.attestationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.act},
      ${JSON.stringify(a.missing)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'attest_incomplete_package');
  }
}

export const RecommendationCapability = {
  read(tx: Tx, action: string): RecommendationReads { return new RecommendationCapabilityImpl(tx, action); },
  record(tx: Tx, action: string): RecordWrites { return new RecommendationCapabilityImpl(tx, action); },
  review(tx: Tx, action: string): ReviewWrites { return new RecommendationCapabilityImpl(tx, action); },
  withdraw(tx: Tx, action: string): WithdrawRecommendationWrites { return new RecommendationCapabilityImpl(tx, action); },
  attest(tx: Tx, action: string): AttestWrites { return new RecommendationCapabilityImpl(tx, action); },
};
