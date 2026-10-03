/**
 * DECISION REVIEW CAPABILITIES — CP-6 B35 part `reopen` (migration 0101 §P; F-P6-06 and the B35 pieces of F-P4-08 / F-P4-09).
 *
 * The events idiom (products/events/events.capabilities.ts): one class, a view per port group. Each write is a thin binding to a SECURITY
 * DEFINER port that asserts the route's own action, the scope and the acting principal (record_condition_change, reopen_package,
 * resolve_reversion_request, assess_outcome, set_review_terms, record_replay_request, link_lesson, set_review_cadence, sweep_review_cadences,
 * score_cited_scenario_relevance); each read is an invoker read under the caller's RLS (review_read, decision_metrics, set_review_status,
 * cited_scenarios_outside_sets). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { DecisionCapability, type ReplayWrites } from '../decision.capabilities.js';

type Row = Record<string, unknown>;

abstract class ReviewCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected get tx(): Tx { return this.#tx; }
  protected async rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
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

export interface ReviewReads {
  readonly action: string;
  now(): Promise<string>;
  /** decision.review_read: the changes, reversion requests, assessments, terms, replays with their reasons, lessons, the ledger (null: not visible). */
  review(packageId: string): Promise<Row | null>;
  /** decision.decision_metrics (ES-39-008) (null: not visible). */
  metrics(packageId: string): Promise<Row | null>;
  /** The domain's packages (newest first) — the page's picker. */
  packages(limit: number): Promise<Row[]>;
  /** The reversion requests of the domain (open first). */
  reversions(a: { state: string | null; limit: number }): Promise<Row[]>;
  /** decision.set_review_status (null: not visible). */
  setStatus(setId: string): Promise<Row | null>;
  /** The domain's scenario sets with their review due instant. */
  sets(limit: number): Promise<Row[]>;
  /** The scenarios live packages cite outside every active set, each with its newest relevance row. */
  citedRelevance(a: { tenantId: string; domainId: string }): Promise<Row[]>;
  /** The package's decision object (for DecisionReopened) and its owner (null: not visible). */
  packageHead(packageId: string): Promise<{ decision_object_id: string; owner_principal_id: string; state: string } | null>;
}

export interface ChangeWrites extends ReviewReads {
  recordChange(a: { changeId: string; tenantId: string; domainId: string; packageId: string; title: string; statement: string; evidence: Row[]; actor: string; correlationId: string }): Promise<Row>;
}
export type ReopenCauseKind = 'input_invalidated' | 'condition_breach' | 'policy_changed' | 'challenge_upheld' | 'appeal_upheld' | 'conditions_changed';
export interface ReopenWrites extends ReviewReads {
  reopen(a: { packageId: string; tenantId: string; domainId: string; cause: { kind: ReopenCauseKind; ref: string }; knownAt: string | null; observedThrough: string | null;
    actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface ReversionWrites extends ReviewReads {
  resolveReversion(a: { requestId: string; tenantId: string; domainId: string; resolution: 'reversioned' | 'declined'; note: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface OutcomeWrites extends ReviewReads {
  assessOutcome(a: { assessmentId: string; tenantId: string; domainId: string; packageId: string; version: number; observed: Row; inferred: Row; counterfactual: Row; changed: Row[];
    supersedes: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface TermsWrites extends ReviewReads {
  setTerms(a: { termsId: string; tenantId: string; domainId: string; packageId: string; version: number; baseline: Row; horizonDays: number; standard: string; note: string;
    expected: number | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface LessonWrites extends ReviewReads {
  linkLesson(a: { lessonId: string; tenantId: string; domainId: string; assessmentId: string; kind: 'hypothesis' | 'lesson'; memoryItemId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface CadenceWrites extends ReviewReads {
  setCadence(a: { cadenceId: string; tenantId: string; domainId: string; setId: string; everyDays: number; anchorAt: string | null; rationale: string; expected: number | null; actor: string; correlationId: string }): Promise<Row>;
  sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RelevanceWrites extends ReviewReads {
  scoreCited(a: { tenantId: string; domainId: string; trigger: 'tick' | 'operator'; actor: string; correlationId: string }): Promise<Row>;
}
/** The replay with its reason: the decision replay's own capability (decision.replay) beside this part's port, in ONE transaction. */
export interface ReplayRequestWrites extends ReviewReads {
  readonly replay: ReplayWrites;
  recordReplayRequest(a: { replayId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class ReviewCapabilityImpl extends ReviewCore implements ChangeWrites, ReopenWrites, ReversionWrites, OutcomeWrites, TermsWrites, LessonWrites, CadenceWrites, RelevanceWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async review(packageId: string): Promise<Row | null> { return this.maybe(sql`select decision.review_read(${packageId}::uuid) as r`); }
  async metrics(packageId: string): Promise<Row | null> { return this.maybe(sql`select decision.decision_metrics(${packageId}::uuid) as r`); }
  async packages(limit: number): Promise<Row[]> {
    return this.rows<Row>(sql`select p.package_id::text, p.title, p.state, p.current_version, p.committed_version, p.owner_principal_id::text as owner, p.reopens, p.declared_at
      from decision.packages_current p order by p.declared_at desc, p.package_id limit ${limit}`);
  }
  async reversions(a: Parameters<ReviewReads['reversions']>[0]): Promise<Row[]> {
    return this.rows<Row>(sql`select x.request_id::text, x.package_id::text, p.title as package_title, x.scenario_id::text, s.title as scenario_title, x.scenario_version_at_request, s.current_version as scenario_version_now,
        x.owner_principal_id::text as owner, x.state, x.cause ->> 'kind' as cause_kind, x.new_version, x.requested_at, x.resolved_at, x.resolution_note, x.item_id::text
      from decision.scenario_reversion_requests x join decision.packages_current p on p.package_id = x.package_id left join prediction.scenarios_current s on s.scenario_id = x.scenario_id
     where (${a.state}::text is null or x.state = ${a.state}::text) order by (x.state = 'open') desc, x.requested_at desc limit ${a.limit}`);
  }
  async setStatus(setId: string): Promise<Row | null> { return this.maybe(sql`select decision.set_review_status(${setId}::uuid) as r`); }
  async sets(limit: number): Promise<Row[]> {
    return this.rows<Row>(sql`select s.set_id::text, s.title, s.state, s.owner_principal_id::text as owner, decision.set_review_due(s.set_id) as due
      from prediction.scenario_sets s order by s.declared_at desc, s.set_id limit ${limit}`);
  }
  async citedRelevance(a: Parameters<ReviewReads['citedRelevance']>[0]): Promise<Row[]> {
    return this.rows<Row>(sql`select c.scenario_id::text, sc.title, c.cited_by, r.score, r.basis, r.scored_at, r.trigger
      from decision.cited_scenarios_outside_sets(${a.tenantId}::uuid, ${a.domainId}::uuid) c join prediction.scenarios_current sc on sc.scenario_id = c.scenario_id
      left join lateral (select x.score, x.basis, x.scored_at, x.trigger from prediction.scenario_relevance x where x.scenario_id = c.scenario_id order by x.scored_at desc, x.relevance_id desc limit 1) r on true
     order by sc.title`);
  }
  async packageHead(packageId: string): Promise<{ decision_object_id: string; owner_principal_id: string; state: string } | null> {
    const r = await this.rows<{ decision_object_id: string; owner_principal_id: string; state: string }>(sql`select decision_object_id::text, owner_principal_id::text, state from decision.packages_current where package_id = ${packageId}::uuid`);
    return r[0] ?? null;
  }
  async recordChange(a: Parameters<ChangeWrites['recordChange']>[0]): Promise<Row> {
    return this.one(sql`select decision.record_condition_change(${a.changeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.title}, ${a.statement},
      ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_condition_change');
  }
  async reopen(a: Parameters<ReopenWrites['reopen']>[0]): Promise<Row> {
    return this.one(sql`select decision.reopen_package(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.cause)}::jsonb, ${a.knownAt}::timestamptz,
      ${a.observedThrough}::date, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'reopen_package');
  }
  async resolveReversion(a: Parameters<ReversionWrites['resolveReversion']>[0]): Promise<Row> {
    return this.one(sql`select decision.resolve_reversion_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.resolution}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'resolve_reversion_request');
  }
  async assessOutcome(a: Parameters<OutcomeWrites['assessOutcome']>[0]): Promise<Row> {
    return this.one(sql`select decision.assess_outcome(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${JSON.stringify(a.observed)}::jsonb,
      ${JSON.stringify(a.inferred)}::jsonb, ${JSON.stringify(a.counterfactual)}::jsonb, ${JSON.stringify(a.changed)}::jsonb, ${a.supersedes}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assess_outcome');
  }
  async setTerms(a: Parameters<TermsWrites['setTerms']>[0]): Promise<Row> {
    return this.one(sql`select decision.set_review_terms(${a.termsId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${JSON.stringify(a.baseline)}::jsonb,
      ${a.horizonDays}::int, ${a.standard}, ${a.note}, ${a.expected}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_review_terms');
  }
  async linkLesson(a: Parameters<LessonWrites['linkLesson']>[0]): Promise<Row> {
    return this.one(sql`select decision.link_lesson(${a.lessonId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.assessmentId}::uuid, ${a.kind}, ${a.memoryItemId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'link_lesson');
  }
  async setCadence(a: Parameters<CadenceWrites['setCadence']>[0]): Promise<Row> {
    return this.one(sql`select decision.set_review_cadence(${a.cadenceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.setId}::uuid, ${a.everyDays}::int, ${a.anchorAt}::timestamptz, ${a.rationale},
      ${a.expected}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_review_cadence');
  }
  async sweep(a: Parameters<CadenceWrites['sweep']>[0]): Promise<Row> {
    return this.one(sql`select decision.sweep_review_cadences(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sweep_review_cadences');
  }
  async scoreCited(a: Parameters<RelevanceWrites['scoreCited']>[0]): Promise<Row> {
    return this.one(sql`select decision.score_cited_scenario_relevance(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.trigger}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'score_cited_scenario_relevance');
  }
  async recordReplayRequest(a: Parameters<ReplayRequestWrites['recordReplayRequest']>[0]): Promise<Row> {
    return this.one(sql`select decision.record_replay_request(${a.replayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_replay_request');
  }
}

class ReplayRequestImpl extends ReviewCapabilityImpl implements ReplayRequestWrites {
  readonly replay: ReplayWrites;
  constructor(tx: Tx, action: string) { super(tx, action); this.replay = DecisionCapability.replay(tx, action); }
}

export const ReviewCapability = {
  read(tx: Tx, action: string): ReviewReads { return new ReviewCapabilityImpl(tx, action); },
  change(tx: Tx, action: string): ChangeWrites { return new ReviewCapabilityImpl(tx, action); },
  reopen(tx: Tx, action: string): ReopenWrites { return new ReviewCapabilityImpl(tx, action); },
  reversion(tx: Tx, action: string): ReversionWrites { return new ReviewCapabilityImpl(tx, action); },
  outcome(tx: Tx, action: string): OutcomeWrites { return new ReviewCapabilityImpl(tx, action); },
  terms(tx: Tx, action: string): TermsWrites { return new ReviewCapabilityImpl(tx, action); },
  lesson(tx: Tx, action: string): LessonWrites { return new ReviewCapabilityImpl(tx, action); },
  cadence(tx: Tx, action: string): CadenceWrites { return new ReviewCapabilityImpl(tx, action); },
  relevance(tx: Tx, action: string): RelevanceWrites { return new ReviewCapabilityImpl(tx, action); },
  replay(tx: Tx, action: string): ReplayRequestWrites { return new ReplayRequestImpl(tx, action); },
};
