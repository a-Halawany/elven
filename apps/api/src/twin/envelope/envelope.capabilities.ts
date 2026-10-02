/**
 * THE ENVELOPE CAPABILITIES — CP-6 B30 part `envelope` (migration 0103 §EN; F-P5-04).
 *
 * The constraint/validity idiom: one class, narrow views. Each write is a thin binding to a SECURITY DEFINER port that asserts the route's own
 * action, the scope and the acting principal; each read is an invoker read under the caller's RLS, or the guarded definer twin.ai_context
 * (N-01: the caller's bound tenant and domain only). Nothing here decides a rule a port decides.
 *
 *   twin.envelope.admit    → simulation.admit_exploratory    (a twin owner — never the domain administrator)
 *   twin.envelope.concur   → simulation.concur_exploratory   (a method steward other than the admitter and the operator)
 *   twin.calibration.run   → twin.calibrate                  (a named human, or the attention tick)
 *   twin.model.lifecycle   → twin.set_model_state, twin.declare_compatibility (a method steward)
 *   twin.ai_context.read   → twin.ai_context                 (the readers of twin state, the agents among them)
 *   twin.read              → simulation.run_decision_use, twin.calibration_read, the tables (RLS)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface EnvelopeReads {
  readonly action: string;
  now(): Promise<string>;
  /** The runs of the domain whose own contract lies OUTSIDE the envelope (optionally one twin), each with its decision use and admission. */
  outsideRuns(a: { twinId: string | null; limit: number }): Promise<Row[]>;
  /** One run's envelope view: its contract's check, the decision use, the admission (null: not visible). */
  run(runId: string): Promise<Row | null>;
  /** twin.calibration_read: the latest calibration per model × key, the model-fitness roll-up, the history. */
  calibrations(twinId: string, modelRef: string | null): Promise<Row>;
  /** The behaviour models with this domain's lifecycle row (none = approved), the latest calibrations per model, the recent ledger. */
  models(): Promise<Row[]>;
  events(a: { modelRef: string | null; twinId: string | null; limit: number }): Promise<Row[]>;
}
export interface ContextReads extends EnvelopeReads {
  /** twin.ai_context (AI-28-004): null when the twin or the version is not this domain's. */
  aiContext(a: { tenantId: string; domainId: string; twinId: string; version: number | null }): Promise<Row | null>;
}
interface Ids { tenantId: string; domainId: string; actor: string; correlationId: string }
export interface AdmissionWrites extends EnvelopeReads {
  admit(a: Ids & { admissionId: string; runId: string; reason: string }): Promise<Row>;
  concur(a: Ids & { runId: string; note: string }): Promise<Row>;
}
export interface CalibrationWrites extends EnvelopeReads {
  calibrate(a: Ids & { calibrationId: string; twinId: string; modelRef: string; key: string; tolerance: Row }): Promise<Row>;
}
export interface LifecycleWrites extends EnvelopeReads {
  setState(a: Ids & { lifecycleId: string; modelRef: string; state: string; reason: string }): Promise<Row>;
  declareCompatibility(a: Ids & { lifecycleId: string; modelRef: string; kind: string; compatible: boolean; note: string }): Promise<Row>;
}

class EnvelopeCapabilityImpl implements ContextReads, AdmissionWrites, CalibrationWrites, LifecycleWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async rows(q: ReturnType<typeof sql>): Promise<Row[]> { return (await q.execute(this.#tx)).rows as Row[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  private async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    return ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r ?? null;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }

  async outsideRuns(a: Parameters<EnvelopeReads['outsideRuns']>[0]): Promise<Row[]> {
    return this.rows(sql`select r.run_id::text, r.twin_id::text, t.title as twin_title, r.twin_version, r.run_kind, r.state, r.validity, r.model_ref, r.envelope_state, r.envelope_check, r.envelope_ack,
        r.operator_principal_id::text, r.opened_at, r.completed_at, r.promotion_id::text, r.promoted_for, r.retired_at,
        (select to_jsonb(x) - 'scope' - 'correlation_id' from simulation.exploratory_admissions x where x.run_id = r.run_id) as admission,
        simulation.run_decision_use(r.run_id) as decision_use
      from simulation.runs_current r join twin.twins_current t on t.twin_id = r.twin_id
     where r.envelope_state = 'outside' and (${a.twinId}::uuid is null or r.twin_id = ${a.twinId}::uuid)
     order by r.opened_at desc, r.run_id limit ${a.limit}`);
  }
  async run(runId: string): Promise<Row | null> {
    return this.maybe(sql`select jsonb_build_object('run_id', r.run_id, 'twin_id', r.twin_id, 'twin_title', t.title, 'twin_owner', t.owner_principal_id, 'twin_version', r.twin_version, 'run_kind', r.run_kind,
        'state', r.state, 'validity', r.validity, 'model_ref', r.model_ref, 'model_state', twin.ten_model_state(r.tenant_id, r.domain_id, r.model_ref), 'envelope_state', r.envelope_state,
        'envelope_check', r.envelope_check, 'envelope_ack', r.envelope_ack, 'operator_principal_id', r.operator_principal_id, 'promotion_id', r.promotion_id, 'promoted_for', r.promoted_for,
        'retired_at', r.retired_at, 'admission', (select to_jsonb(x) - 'scope' - 'correlation_id' from simulation.exploratory_admissions x where x.run_id = r.run_id),
        'decision_use', simulation.run_decision_use(r.run_id)) as r
      from simulation.runs_current r join twin.twins_current t on t.twin_id = r.twin_id where r.run_id = ${runId}::uuid`);
  }
  async calibrations(twinId: string, modelRef: string | null): Promise<Row> {
    return this.one(sql`select twin.calibration_read(${twinId}::uuid, ${modelRef}::text) as r`, 'calibration_read');
  }
  async models(): Promise<Row[]> {
    return this.rows(sql`select b.method_ref, b.name, b.version, b.family, b.operating_envelope, b.validation_notes, b.implementation_digest is not null as pinned,
        coalesce(m.state, 'approved') as state, m.lifecycle_id is null as implicit, m.steward_principal_id::text as steward, m.proposed_by::text, m.approved_by::text, m.reason,
        coalesce(m.compatibility, '{}'::jsonb) as compatibility, m.version as lifecycle_version, m.updated_at,
        (select coalesce(jsonb_agg(jsonb_build_object('twin_id', c.twin_id, 'twin_title', t.title, 'key', c.key, 'seq', c.seq, 'n', c.n, 'mae', c.mae, 'mape', c.mape, 'bias', c.bias,
                                                      'tolerance', c.tolerance, 'drift_state', c.drift_state, 'calibrated_at', c.calibrated_at) order by t.title, c.key), '[]'::jsonb)
           from (select distinct on (k.twin_id, k.key) k.* from twin.calibrations k where k.method_ref = b.method_ref order by k.twin_id, k.key, k.seq desc) c
           join twin.twins_current t on t.twin_id = c.twin_id) as calibrations,
        (select count(*)::int from simulation.runs_current r where r.model_ref = b.method_ref) as runs
      from twin.behaviour_models b left join twin.model_lifecycle m on m.method_ref = b.method_ref
     order by b.method_ref`);
  }
  async events(a: Parameters<EnvelopeReads['events']>[0]): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.event, e.twin_id::text, e.run_id::text, e.method_ref, e.actor_principal_id::text, e.details, e.occurred_at
      from twin.envelope_events e where (${a.modelRef}::text is null or e.method_ref = ${a.modelRef}::text) and (${a.twinId}::uuid is null or e.twin_id = ${a.twinId}::uuid)
     order by e.occurred_at desc, e.event_id limit ${a.limit}`);
  }
  async aiContext(a: Parameters<ContextReads['aiContext']>[0]): Promise<Row | null> {
    return this.maybe(sql`select twin.ai_context(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int) as r`);
  }

  async admit(a: Parameters<AdmissionWrites['admit']>[0]): Promise<Row> {
    return this.one(sql`select simulation.admit_exploratory(${a.admissionId}::uuid, ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'admit_exploratory');
  }
  async concur(a: Parameters<AdmissionWrites['concur']>[0]): Promise<Row> {
    return this.one(sql`select simulation.concur_exploratory(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'concur_exploratory');
  }
  async calibrate(a: Parameters<CalibrationWrites['calibrate']>[0]): Promise<Row> {
    return this.one(sql`select twin.calibrate(${a.calibrationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.modelRef}, ${a.key}, ${JSON.stringify(a.tolerance)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'calibrate');
  }
  async setState(a: Parameters<LifecycleWrites['setState']>[0]): Promise<Row> {
    return this.one(sql`select twin.set_model_state(${a.lifecycleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.modelRef}, ${a.state}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'set_model_state');
  }
  async declareCompatibility(a: Parameters<LifecycleWrites['declareCompatibility']>[0]): Promise<Row> {
    return this.one(sql`select twin.declare_compatibility(${a.lifecycleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.modelRef}, ${a.kind}, ${a.compatible}, ${a.note}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'declare_compatibility');
  }
}

export const EnvelopeCapability = {
  read(tx: Tx, action: string): EnvelopeReads { return new EnvelopeCapabilityImpl(tx, action); },
  context(tx: Tx, action: string): ContextReads { return new EnvelopeCapabilityImpl(tx, action); },
  admission(tx: Tx, action: string): AdmissionWrites { return new EnvelopeCapabilityImpl(tx, action); },
  calibration(tx: Tx, action: string): CalibrationWrites { return new EnvelopeCapabilityImpl(tx, action); },
  lifecycle(tx: Tx, action: string): LifecycleWrites { return new EnvelopeCapabilityImpl(tx, action); },
};
