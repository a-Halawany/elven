/**
 * THE GOVERNED REGISTRY'S CAPABILITIES — CP-6 B25 part `registry` (0108 §MR; F-P4-01). The constraint.capabilities.ts idiom: one class, a view
 * per port group. Each write is a thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting
 * principal (propose / decide / retire / quarantine / reinstate a method; declare / decide a target; publish / concur a horizon policy;
 * record a validation; record and bind a route); the reads are invoker reads under the caller's RLS (the tables, the effective registry, the
 * plan). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class RegistryCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  get tx(): Tx { return this.#tx; }
  protected async rows(q: ReturnType<typeof sql>): Promise<Row[]> { return (await q.execute(this.#tx)).rows as Row[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface PlanArgs { tenantId: string; domainId: string; targetKey: string | null; seriesKey: string | null; horizonCode: string; knownAt: string; cutoff: string | null }

export interface RegistryReads {
  readonly action: string;
  now(): Promise<string>;
  /** the effective registry of the domain (its entries and the builtins it has not adopted) */
  effective(tenantId: string, domainId: string): Promise<Row[]>;
  methods(): Promise<Row[]>;
  method(methodId: string): Promise<Row | null>;
  targets(): Promise<Row[]>;
  policies(): Promise<Row[]>;
  validations(limit: number): Promise<Row[]>;
  routes(limit: number): Promise<Row[]>;
  events(subjectKind: string | null, limit: number): Promise<Row[]>;
  /** the plan as the policy and the registry resolve it now (an invoker read; nothing recorded) */
  plan(a: PlanArgs): Promise<Row>;
  /** the series' declared seasonality and unit */
  series(seriesKey: string): Promise<Row | null>;
  /** B25 completion (G4): which of these ids are assumptions (ASU) of the Strategy Graph this caller reads (RLS-scoped) */
  knownAssumptions(ids: string[]): Promise<string[]>;
}

export interface MethodWrites extends RegistryReads {
  propose(a: { methodId: string; tenantId: string; domainId: string; key: string; version: number; family: string; kinds: string[]; horizons: string[]; implementationRef: string;
    implementationDigest: string; parameters: Row; declarations: Row; validation: Row; description: string; steward: string; actor: string; correlationId: string }): Promise<Row>;
  decide(a: { methodId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  retire(a: { tenantId: string; domainId: string; methodRef: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  quarantine(a: { tenantId: string; domainId: string; methodRef: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  reinstate(a: { tenantId: string; domainId: string; methodRef: string; note: string; actor: string; correlationId: string }): Promise<Row>;
}

export interface TargetWrites extends RegistryReads {
  declare(a: { targetId: string; tenantId: string; domainId: string; key: string; kind: string; unit: string; title: string; definition: Row; sources: Row; subject: string | null; riskClass: string;
    actor: string; correlationId: string }): Promise<Row>;
  decideTarget(a: { targetId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
}

export interface PolicyWrites extends RegistryReads {
  publish(a: { policyId: string; tenantId: string; domainId: string; riskClass: string; rules: Row; statement: string; steward: string; actor: string; correlationId: string }): Promise<Row>;
  concur(a: { policyId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
}

export interface ValidationWrites extends RegistryReads {
  record(a: { validationId: string; backtestId: string; tenantId: string; domainId: string; methodRef: string; targetKey: string | null; seriesKey: string; horizonCode: string; horizonDays: number;
    kind: string; mode: string; origins: number; minOrigins: number; metrics: Row; passed: boolean; verdict: string; windowFrom: string; windowTo: string; knownAt: string; observations: number;
    synthetic: boolean; discipline: string; details: Row; actor: string; correlationId: string }): Promise<Row>;
}

/** The routed issue's (and §EN's, through the seam) — the route recorded and bound, the automatic quarantine of a failing method. */
export interface RouteWrites extends RegistryReads {
  recordRoute(a: { routeId: string; tenantId: string; domainId: string; targetKey: string | null; seriesKey: string | null; horizonCode: string; knownAt: string; cutoff: string | null;
    forecastId: string; actor: string; correlationId: string }): Promise<Row>;
  bindRoute(a: { routeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  refuseRoute(a: { routeId: string; tenantId: string; domainId: string; refusal: string; refusalClass: string; actor: string; correlationId: string }): Promise<Row>;
  quarantine(a: { tenantId: string; domainId: string; methodRef: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

const SELECT_METHODS = sql`select method_id::text, method_key, version, method_ref, family, forecast_kinds, horizons, implementation_ref, implementation_digest, parameters, declarations,
  validation_requirement, description, state, steward_principal_id::text, adopted_builtin, proposed_by::text, proposed_by_kind, proposed_at, decided_by::text, decided_at, decision_note,
  retired_by::text, retired_at, retirement_reason, quarantined_at, quarantine_reason from prediction.forecast_methods`;

class RegistryCapabilityImpl extends RegistryCore implements MethodWrites, TargetWrites, PolicyWrites, ValidationWrites, RouteWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  async effective(tenantId: string, domainId: string): Promise<Row[]> {
    return this.rows(sql`select method_id::text, method_ref, method_key, version, family, forecast_kinds, horizons, implementation_ref, implementation_digest, parameters, declarations,
      validation_requirement, description, state, state_reason, steward_principal_id::text, builtin, proposed_by::text, decided_by::text
      from prediction.effective_forecast_methods(${tenantId}::uuid, ${domainId}::uuid) order by builtin desc, method_key, version`);
  }
  async methods(): Promise<Row[]> { return this.rows(sql`${SELECT_METHODS} order by method_key, version`); }
  async method(methodId: string): Promise<Row | null> { return (await this.rows(sql`${SELECT_METHODS} where method_id = ${methodId}::uuid`))[0] ?? null; }
  async targets(): Promise<Row[]> {
    return this.rows(sql`select target_id::text, target_key, version, kind, unit, title, definition, sources, subject_entity_id::text, risk_class, state, declared_by::text, declared_by_kind,
      declared_at, decided_by::text, decided_at, decision_note from prediction.forecast_targets order by target_key, version`);
  }
  async policies(): Promise<Row[]> {
    return this.rows(sql`select policy_id::text, risk_class, version, rules, statement, state, steward_principal_id::text, published_by::text, published_at, concurred_by::text, concurred_at,
      concurrence_note, superseded_at, superseded_by::text from prediction.horizon_policies order by risk_class, version`);
  }
  async validations(limit: number): Promise<Row[]> {
    return this.rows(sql`select validation_id::text, method_ref, target_key, series_key, horizon_code, horizon_days, kind, mode, origins, min_origins, metrics, passed, verdict, window_from::text,
      window_to::text, known_at, observations, backtest_id::text, synthetic, computed_by::text, computed_at from prediction.method_validations order by computed_at desc limit ${limit}`);
  }
  async routes(limit: number): Promise<Row[]> {
    return this.rows(sql`select route_id::text, target_key, series_key, horizon_code, forecast_kind, policy_id::text, policy_version, outcome, refusal, refusal_class, plan, forecast_id::text, method_ref,
      requested_by::text, requested_action, requested_at, issued_at from prediction.forecast_routes order by requested_at desc limit ${limit}`);
  }
  async events(subjectKind: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select event_id::text, subject_kind, subject_id::text, subject_ref, event, actor_principal_id::text, details, occurred_at from prediction.forecast_registry_events
      where (${subjectKind}::text is null or subject_kind = ${subjectKind}) order by occurred_at desc, event_id desc limit ${limit}`);
  }
  async plan(a: PlanArgs): Promise<Row> {
    return this.one(sql`select prediction.forecast_route_plan(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.seriesKey}, ${a.horizonCode}, ${a.knownAt}::timestamptz, ${a.cutoff}::date) as r`, 'forecast_route_plan');
  }
  async series(seriesKey: string): Promise<Row | null> {
    return (await this.rows(sql`select series_key, unit, seasonality_days, subject_entity_id::text from prediction.series_registry where series_key = ${seriesKey}`))[0] ?? null;
  }

  async knownAssumptions(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.rows(sql`select strategy_object_id::text as id from graph.strategy_current where object_type = 'ASU' and strategy_object_id = any(${`{${ids.join(',')}}`}::uuid[])`);
    return rows.map((r) => String(r['id']));
  }
  async propose(a: Parameters<MethodWrites['propose']>[0]): Promise<Row> {
    return this.one(sql`select prediction.propose_forecast_method(${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.version}::int, ${a.family}, ${a.kinds}::text[],
      ${a.horizons}::text[], ${a.implementationRef}, ${a.implementationDigest}, ${JSON.stringify(a.parameters)}::jsonb, ${JSON.stringify(a.declarations)}::jsonb, ${JSON.stringify(a.validation)}::jsonb,
      ${a.description}, ${a.steward}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_forecast_method');
  }
  async decide(a: Parameters<MethodWrites['decide']>[0]): Promise<Row> {
    return this.one(sql`select prediction.decide_forecast_method(${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_forecast_method');
  }
  async retire(a: Parameters<MethodWrites['retire']>[0]): Promise<Row> {
    return this.one(sql`select prediction.retire_forecast_method(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodRef}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_forecast_method');
  }
  async quarantine(a: Parameters<MethodWrites['quarantine']>[0]): Promise<Row> {
    return this.one(sql`select prediction.quarantine_forecast_method(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodRef}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'quarantine_forecast_method');
  }
  async reinstate(a: Parameters<MethodWrites['reinstate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.reinstate_forecast_method(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodRef}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reinstate_forecast_method');
  }
  async declare(a: Parameters<TargetWrites['declare']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_forecast_target(${a.targetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.unit}, ${a.title},
      ${JSON.stringify(a.definition)}::jsonb, ${JSON.stringify(a.sources)}::jsonb, ${a.subject}::uuid, ${a.riskClass}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_forecast_target');
  }
  async decideTarget(a: Parameters<TargetWrites['decideTarget']>[0]): Promise<Row> {
    return this.one(sql`select prediction.decide_forecast_target(${a.targetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_forecast_target');
  }
  async publish(a: Parameters<PolicyWrites['publish']>[0]): Promise<Row> {
    return this.one(sql`select prediction.publish_horizon_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.riskClass}, ${JSON.stringify(a.rules)}::jsonb, ${a.statement},
      ${a.steward}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_horizon_policy');
  }
  async concur(a: Parameters<PolicyWrites['concur']>[0]): Promise<Row> {
    return this.one(sql`select prediction.concur_horizon_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'concur_horizon_policy');
  }
  async record(a: Parameters<ValidationWrites['record']>[0]): Promise<Row> {
    return this.one(sql`select prediction.record_method_validation(${a.validationId}::uuid, ${a.backtestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodRef}, ${a.targetKey},
      ${a.seriesKey}, ${a.horizonCode}, ${a.horizonDays}::int, ${a.kind}, ${a.mode}, ${a.origins}::int, ${a.minOrigins}::int, ${JSON.stringify(a.metrics)}::jsonb, ${a.passed}, ${a.verdict},
      ${a.windowFrom}::date, ${a.windowTo}::date, ${a.knownAt}::timestamptz, ${a.observations}::int, ${a.synthetic}, ${a.discipline}, ${JSON.stringify(a.details)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_method_validation');
  }
  async recordRoute(a: Parameters<RouteWrites['recordRoute']>[0]): Promise<Row> {
    return this.one(sql`select prediction.record_forecast_route(${a.routeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.seriesKey}, ${a.horizonCode},
      ${a.knownAt}::timestamptz, ${a.cutoff}::date, ${a.forecastId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_forecast_route');
  }
  async refuseRoute(a: Parameters<RouteWrites['refuseRoute']>[0]): Promise<Row> {
    return this.one(sql`select prediction.refuse_forecast_route(${a.routeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.refusal}, ${a.refusalClass}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'refuse_forecast_route');
  }
  async bindRoute(a: Parameters<RouteWrites['bindRoute']>[0]): Promise<Row> {
    return this.one(sql`select prediction.bind_forecast_route(${a.routeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'bind_forecast_route');
  }
}

export const RegistryCapability = {
  read(tx: Tx, action: string): RegistryReads { return new RegistryCapabilityImpl(tx, action); },
  method(tx: Tx, action: string): MethodWrites { return new RegistryCapabilityImpl(tx, action); },
  target(tx: Tx, action: string): TargetWrites { return new RegistryCapabilityImpl(tx, action); },
  policy(tx: Tx, action: string): PolicyWrites { return new RegistryCapabilityImpl(tx, action); },
  validation(tx: Tx, action: string): ValidationWrites { return new RegistryCapabilityImpl(tx, action); },
  route(tx: Tx, action: string): RouteWrites { return new RegistryCapabilityImpl(tx, action); },
};
