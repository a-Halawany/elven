/**
 * ENSEMBLE CAPABILITIES — CP-6 B25 part `ensembles` (migration 0108 §EN; F-P4-02).
 *
 * The constraint.capabilities idiom: one class, a view per port group. Each write is a thin binding to a SECURITY DEFINER port that
 * asserts the route's own action, the scope and the acting principal — the manager's (prediction.ensemble.issue: admit, complete, fail,
 * resume) and the overlay's (prediction.overlay.add: add, revise; prediction.overlay.withdraw). The reads are plain selects under the
 * caller's RLS (prediction_isolation). The members and the ensemble themselves are issued through the prediction capability's
 * issueForecast (the prelude's port), never here. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class EnsembleCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock: every "as of now" (the default cut-off) is the database's instant, never the process's. */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
  /** The transaction the B25 seams (METHOD_ROUTER.plan, CONTEXT_FREEZER.freeze) run in — the admission's own. */
  seamTx(): unknown { return this.#tx; }
}

export interface EnsembleReads {
  readonly action: string;
  now(): Promise<string>;
  /** prediction.ensemble_rules() — the declared, versioned rules. */
  rules(): Promise<Row>;
  runs(limit: number): Promise<Row[]>;
  run(runId: string): Promise<Row | null>;
  /** The run's members in order, each with its issued forecast's distribution, validation and statement (null when excluded). */
  members(runId: string): Promise<Row[]>;
  events(runId: string): Promise<Row[]>;
  attempts(runId: string): Promise<Row[]>;
  forecast(forecastId: string): Promise<Row | null>;
  /** The FCT canonical payload of a forecast (its latest version) — the ensemble's `ensemble`, `disagreement` and `excluded_models`. */
  forecastPayload(forecastId: string): Promise<Row | null>;
  /** B25 completion (G1): the FROZEN features of an information set (its manifest's), which the members compute with (null: no such set). */
  informationSetFeatures(setId: string): Promise<Array<{ key: string; source: string; digest: string; value?: unknown }> | null>;
  /** Every version of every judgement overlay on a forecast, newest first. */
  overlays(forecastId: string): Promise<Row[]>;
  /** The Strategy Graph titles of assumptions (ASU ids → title). */
  assumptionTitles(ids: string[]): Promise<Record<string, string>>;
  /** The subject entity a registered series is about (null: none, or no such series — the admission port refuses the latter). */
  seriesSubject(seriesKey: string): Promise<string | null>;
  /** B25-F1: the run's ROUTE(S) — since 0109 the one recorded against its ensemble forecast; before it, the one its admission recorded (the
   *  port's deterministic match, read here for display: the correlation id, the requester, the question, an unissued forecast id). */
  routes(runId: string): Promise<Row[]>;
}

export interface EnsembleWrites extends EnsembleReads {
  seamTx(): unknown;
  admit(a: { runId: string; tenantId: string; domainId: string; ensembleForecastId: string; request: Row; plan: Row; members: Row[]; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  complete(a: { runId: string; tenantId: string; domainId: string; outcome: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  fail(a: { runId: string; tenantId: string; domainId: string; reason: string; outcome: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  resume(a: { runId: string; tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

/** B25-F1 (0109): prediction.ensemble.route.reconcile — close a finished run's route left planned before 0109. */
export interface RouteReconciliation extends EnsembleReads {
  reconcileRoute(a: { runId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

export interface OverlayWrites extends EnsembleReads {
  add(a: { overlayId: string; tenantId: string; domainId: string; forecastId: string; adjustment: Row; rationale: string; evidence: Row[]; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  revise(a: { overlayId: string; tenantId: string; domainId: string; forecastId: string; expectedVersion: number; adjustment: Row; rationale: string; evidence: Row[]; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  withdraw(a: { overlayId: string; tenantId: string; domainId: string; forecastId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

class EnsembleCapabilityImpl extends EnsembleCore implements EnsembleWrites, OverlayWrites, RouteReconciliation {
  constructor(tx: Tx, action: string) { super(tx, action); }

  async rules(): Promise<Row> { return this.one(sql`select prediction.ensemble_rules() as r`, 'ensemble_rules'); }
  async runs(limit: number): Promise<Row[]> {
    return this.rows(sql`select run_id::text, ensemble_forecast_id::text, series_key, target_key, horizon_code, state, state_reason, combination_rule, weighting,
                                disagreement ->> 'level' as disagreement_level, owner_principal_id::text, admitted_at, finished_at, label,
                                (select count(*)::int from prediction.ensemble_members m where m.run_id = r.run_id) as planned,
                                (select count(*)::int from prediction.ensemble_members m where m.run_id = r.run_id and m.state = 'issued') as included,
                                (select count(*)::int from prediction.ensemble_members m where m.run_id = r.run_id and m.state = 'excluded') as excluded
                           from prediction.ensemble_runs r order by admitted_at desc, run_id desc limit ${Math.min(Math.max(limit, 1), 200)}`);
  }
  async run(runId: string): Promise<Row | null> {
    const r = await this.rows(sql`select to_jsonb(r) as r from prediction.ensemble_runs r where r.run_id = ${runId}::uuid`);
    return (r[0]?.['r'] as Row | undefined) ?? null;
  }
  async members(runId: string): Promise<Row[]> {
    return this.rows(sql`select m.ordinal, m.method_ref, m.family, m.forecast_kind, m.confidence_language, m.available, m.unavailable_reason,
                                m.assumptions::text[] as assumptions, m.tied_assumptions::text[] as tied_assumptions, m.state, m.forecast_id::text,
                                m.exclusion_class, m.exclusion_reason, m.attempts, m.weight::float8 as weight,
                                f.quantiles, f.path, f.method, f.method_version, f.validation_state, f.validation_note, f.statement, f.state as forecast_state,
                                f.outcome_spec, f.horizon_policy, f.superseded_by::text as superseded_by   -- B25-F1/F2: the member's pins and output semantics
                           from prediction.ensemble_members m left join prediction.forecasts_current f on f.forecast_id = m.forecast_id
                          where m.run_id = ${runId}::uuid order by m.ordinal`);
  }
  async events(runId: string): Promise<Row[]> {
    return this.rows(sql`select event_id::text, event, actor_principal_id::text, details, occurred_at from prediction.ensemble_events where run_id = ${runId}::uuid order by occurred_at, event_id`);
  }
  async attempts(runId: string): Promise<Row[]> {
    return this.rows(sql`select ordinal, method_ref, attempt, outcome, error, duration_ms, recorded_at from prediction.ensemble_attempts where run_id = ${runId}::uuid order by ordinal, attempt`);
  }
  async forecast(forecastId: string): Promise<Row | null> {
    const r = await this.rows(sql`select to_jsonb(f) as r from prediction.forecasts_current f where f.forecast_id = ${forecastId}::uuid`);
    return (r[0]?.['r'] as Row | undefined) ?? null;
  }
  async informationSetFeatures(setId: string): Promise<Array<{ key: string; source: string; digest: string; value?: unknown }> | null> {
    const r = await this.rows(sql`select manifest -> 'features' as r from prediction.information_sets where information_set_id = ${setId}::uuid`);
    return (r[0]?.['r'] as Array<{ key: string; source: string; digest: string; value?: unknown }> | undefined) ?? null;
  }
  async forecastPayload(forecastId: string): Promise<Row | null> {
    const r = await this.rows(sql`select payload as r from objects.canonical_objects where object_type = 'FCT' and object_id = ${forecastId}::uuid order by object_version desc limit 1`);
    return (r[0]?.['r'] as Row | undefined) ?? null;
  }
  async overlays(forecastId: string): Promise<Row[]> {
    return this.rows(sql`select o.overlay_id::text, o.version, o.forecast_id::text, o.forecast_kind, o.author_principal_id::text,
                                (select p.display_name from identity.principals p where p.id = o.author_principal_id) as author_name,
                                o.adjustment, o.model_distribution, o.rationale, o.evidence, o.label, o.state, o.revises_version, o.created_at, o.superseded_at,
                                o.withdrawn_by::text, o.withdrawn_at, o.withdrawal_reason
                           from prediction.judgement_overlays o where o.forecast_id = ${forecastId}::uuid order by o.created_at desc, o.version desc`);
  }
  async assumptionTitles(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.rows<{ id: string; title: string }>(sql`select strategy_object_id::text as id, title from graph.strategy_current where strategy_object_id = any(${ids}::uuid[])`);
    return Object.fromEntries(rows.map((r) => [r.id, r.title]));
  }

  async seriesSubject(seriesKey: string): Promise<string | null> {
    const r = await this.rows<{ s: string | null }>(sql`select subject_entity_id::text as s from prediction.series_registry where series_key = ${seriesKey} limit 1`);
    return r[0]?.s ?? null;
  }

  async routes(runId: string): Promise<Row[]> {
    return this.rows(sql`select r.route_id::text, r.outcome, r.refusal, r.refusal_class, r.method_ref, r.forecast_id::text, r.requested_at, r.issued_at,
                                (r.forecast_id = e.ensemble_forecast_id) as recorded_against_ensemble
                           from prediction.ensemble_runs e join prediction.forecast_routes r on r.tenant_id = e.tenant_id and r.domain_id = e.domain_id
                                and r.requested_action = 'prediction.ensemble.issue'
                                and (r.forecast_id = e.ensemble_forecast_id
                                     or (r.correlation_id = e.correlation_id and r.requested_by = e.admitted_by and r.series_key = e.series_key and r.horizon_code = e.horizon_code
                                         and r.target_key is not distinct from e.target_key and r.requested_at <= e.admitted_at
                                         and not exists (select 1 from prediction.forecasts_current f where f.forecast_id = r.forecast_id)))
                          where e.run_id = ${runId}::uuid order by r.requested_at`);
  }
  async reconcileRoute(a: Parameters<RouteReconciliation['reconcileRoute']>[0]): Promise<Row> {
    return this.one(sql`select prediction.reconcile_ensemble_route(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reconcile_ensemble_route');
  }

  async admit(a: Parameters<EnsembleWrites['admit']>[0]): Promise<Row> {
    return this.one(sql`select prediction.admit_ensemble_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ensembleForecastId}::uuid,
      ${JSON.stringify(a.request)}::jsonb, ${JSON.stringify(a.plan)}::jsonb, ${JSON.stringify(a.members)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'admit_ensemble_run');
  }
  async complete(a: Parameters<EnsembleWrites['complete']>[0]): Promise<Row> {
    return this.one(sql`select prediction.complete_ensemble_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.outcome)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'complete_ensemble_run');
  }
  async fail(a: Parameters<EnsembleWrites['fail']>[0]): Promise<Row> {
    return this.one(sql`select prediction.fail_ensemble_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${JSON.stringify(a.outcome)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'fail_ensemble_run');
  }
  async resume(a: Parameters<EnsembleWrites['resume']>[0]): Promise<Row> {
    return this.one(sql`select prediction.resume_ensemble_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'resume_ensemble_run');
  }

  async add(a: Parameters<OverlayWrites['add']>[0]): Promise<Row> {
    return this.one(sql`select prediction.add_judgement_overlay(${a.overlayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.forecastId}::uuid, ${JSON.stringify(a.adjustment)}::jsonb,
      ${a.rationale}, ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'add_judgement_overlay');
  }
  async revise(a: Parameters<OverlayWrites['revise']>[0]): Promise<Row> {
    return this.one(sql`select prediction.revise_judgement_overlay(${a.overlayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.forecastId}::uuid, ${a.expectedVersion}::int,
      ${JSON.stringify(a.adjustment)}::jsonb, ${a.rationale}, ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'revise_judgement_overlay');
  }
  async withdraw(a: Parameters<OverlayWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select prediction.withdraw_judgement_overlay(${a.overlayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.forecastId}::uuid, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_judgement_overlay');
  }
}

export const EnsembleCapability = {
  /** prediction.ensemble.read / prediction.read: the reads. */
  read(tx: Tx, action: string): EnsembleReads { return new EnsembleCapabilityImpl(tx, action); },
  /** prediction.ensemble.issue: the manager's admission, completion, failure and resumption (and the seams' transaction). */
  manage(tx: Tx, action: string): EnsembleWrites { return new EnsembleCapabilityImpl(tx, action); },
  /** B25-F1 (0109) prediction.ensemble.route.reconcile: close a finished run's route left planned before 0109. */
  reconcile(tx: Tx, action: string): RouteReconciliation { return new EnsembleCapabilityImpl(tx, action); },
  /** prediction.overlay.add / prediction.overlay.withdraw: the judgement overlay's ports. */
  overlay(tx: Tx, action: string): OverlayWrites { return new EnsembleCapabilityImpl(tx, action); },
};
