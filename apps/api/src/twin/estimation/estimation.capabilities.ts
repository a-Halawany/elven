/**
 * CP-6 B30 §ES (0103) — THE ESTIMATION CAPABILITIES: the twin capability's shape (one implementation, narrow interfaces, every write a
 * SECURITY DEFINER port that asserts the caller's own bound action). Reads go through the tables' row security (this domain's estimators,
 * estimates, qualifications, requests and ledger) and the invoker reads (twin.tes_qualify, twin.estimation_pending).
 *
 *   twin.estimator.declare    → twin.declare_estimator / twin.retire_estimator   (the twin's owner)
 *   twin.estimate.propose     → twin.propose_estimate                            (a person, or the Reconciliation Agent in its running scan)
 *   twin.estimate.decide      → twin.decide_estimate, AFTER the existing version/ground/admit ports in the same transaction (the twin's owner)
 *   twin.observation.request  → twin.request_observations / twin.cancel_observation_request
 *   twin.estimation.trigger   → twin.queue_estimation_triggers                   (the attention agent, after its tick)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { TwinCapability, type AdmitWrites, type GroundWrites, type VersionWrites } from '../twin.capabilities.js';

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EstimationReads {
  readonly action: string;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  readEstimators(): any;
  readEstimates(): any;
  readQualifications(): any;
  readRequests(): any;
  readEvents(): any;
  readAttention(): any;
  /** The database's instant (every "as of now" is the database's). */
  now(): Promise<string>;
  /** The qualification verdicts of one estimator version's inputs, for the facts read (the port records the same rule). */
  qualify(a: { tenantId: string; domainId: string; estimatorId: string; version: number; facts: unknown[] }): Promise<Row[]>;
  /** The pending proposal checks of the domain (triggers not yet answered by a proposal). */
  pending(): Promise<Row[]>;
  /** B30 act: the day each exact evidence version observes (its event time, else its valid-from) — an UNREADABLE version is judged against
   *  the estimator's window by it (estimation.service.ts compute). Answers [{ id, version, day | null }]. */
  evidenceDays(refs: Array<{ id: string; version: number }>): Promise<Row[]>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Who { tenantId: string; domainId: string; actor: string; correlationId: string }
export interface EstimatorWrites extends EstimationReads {
  declare(a: Who & { estimatorId: string; twinId: string; key: string; name: string; role: string; method: string; parameters: unknown; inputs: unknown; unit: string;
                     bounds: unknown; materiality: number; ambiguity: number; constraintSets: string[]; note: string }): Promise<Row>;
  retire(a: Who & { estimatorId: string; reason: string }): Promise<Row>;
}
export interface ProposeWrites extends EstimationReads {
  propose(a: Who & { estimateId: string; twinId: string; key: string; facts: Record<string, unknown[]>; candidates: unknown[]; constraint: unknown; trigger: unknown;
                     agentId: string | null; runId: string | null }): Promise<Row>;
}
export interface DecideWrites extends EstimationReads {
  /** The existing twin ports, under this transaction's bound action (twin.estimate.decide — each serves it, 0103 §ES.4). */
  readonly version: VersionWrites;
  readonly ground: GroundWrites;
  readonly admit: AdmitWrites;
  decide(a: Who & { estimateId: string; decision: 'approved' | 'declined'; note: string | null; newVersion: number | null }): Promise<Row>;
}
export interface RequestWrites extends EstimationReads {
  request(a: Who & { requestId: string; twinId: string; key: string | null; estimatorId: string | null; input: unknown; reasonClass: string; note: string;
                     agentId: string | null; runId: string | null }): Promise<Row>;
  cancel(a: Who & { requestId: string; reason: string }): Promise<Row>;
}
export interface TriggerWrites extends EstimationReads {
  queueTriggers(a: Who): Promise<Row>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class EstimationCapabilityImpl implements EstimatorWrites, ProposeWrites, DecideWrites, RequestWrites, TriggerWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  get version(): VersionWrites { return TwinCapability.version(this.#tx, this.#action); }
  get ground(): GroundWrites { return TwinCapability.ground(this.#tx, this.#action); }
  get admit(): AdmitWrites { return TwinCapability.admit(this.#tx, this.#action); }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }

  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readEstimators(): any { return this.from('twin.estimators'); }
  readEstimates(): any { return this.from('twin.estimates'); }
  readQualifications(): any { return this.from('twin.input_qualifications'); }
  readRequests(): any { return this.from('twin.observation_requests'); }
  readEvents(): any { return this.from('twin.estimation_events'); }
  readAttention(): any { return this.from('executive.attention_items'); }
  async now(): Promise<string> {
    const r = await sql<{ n: string }>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as n`.execute(this.#tx);
    return String(r.rows[0]?.n);
  }
  async qualify(a: Parameters<EstimationReads['qualify']>[0]): Promise<Row[]> {
    const r = await sql<{ r: Row[] | null }>`select twin.tes_qualify(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.estimatorId}::uuid, ${a.version}::int, ${JSON.stringify(a.facts)}::jsonb) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? [];
  }
  async pending(): Promise<Row[]> {
    const r = await sql<Row>`select twin_id::text, key, triggers::int, kinds, oldest from twin.estimation_pending()`.execute(this.#tx);
    return r.rows;
  }
  async evidenceDays(refs: Array<{ id: string; version: number }>): Promise<Row[]> {
    if (refs.length === 0) return [];
    const r = await sql<Row>`select o.object_id::text as id, o.object_version::int as version, to_char(coalesce(o.event_time, o.valid_from) at time zone 'UTC', 'YYYY-MM-DD') as day
      from objects.canonical_objects o join jsonb_to_recordset(${JSON.stringify(refs)}::jsonb) as x(id uuid, version int) on o.object_id = x.id and o.object_version = x.version
     where o.object_type = 'EVD'`.execute(this.#tx);
    return r.rows;
  }

  async declare(a: Parameters<EstimatorWrites['declare']>[0]) {
    return this.one(sql`select twin.declare_estimator(${a.estimatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.key}, ${a.name}, ${a.role}, ${a.method},
      ${JSON.stringify(a.parameters)}::jsonb, ${JSON.stringify(a.inputs)}::jsonb, ${a.unit}, ${JSON.stringify(a.bounds)}::jsonb, ${a.materiality}::numeric, ${a.ambiguity}::numeric,
      ${a.constraintSets}::text[], ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async retire(a: Parameters<EstimatorWrites['retire']>[0]) {
    return this.one(sql`select twin.retire_estimator(${a.estimatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async propose(a: Parameters<ProposeWrites['propose']>[0]) {
    return this.one(sql`select twin.propose_estimate(${a.estimateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.key}, ${JSON.stringify(a.facts)}::jsonb,
      ${JSON.stringify(a.candidates)}::jsonb, ${JSON.stringify(a.constraint)}::jsonb, ${JSON.stringify(a.trigger ?? {})}::jsonb, ${a.agentId}::uuid, ${a.runId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decide(a: Parameters<DecideWrites['decide']>[0]) {
    return this.one(sql`select twin.decide_estimate(${a.estimateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.newVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async request(a: Parameters<RequestWrites['request']>[0]) {
    return this.one(sql`select twin.request_observations(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.key}, ${a.estimatorId}::uuid,
      ${JSON.stringify(a.input)}::jsonb, ${a.reasonClass}, ${a.note}, ${a.agentId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async cancel(a: Parameters<RequestWrites['cancel']>[0]) {
    return this.one(sql`select twin.cancel_observation_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async queueTriggers(a: Parameters<TriggerWrites['queueTriggers']>[0]) {
    return this.one(sql`select twin.queue_estimation_triggers(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const EstimationCapability = {
  read(tx: Tx, action: string): EstimationReads { return new EstimationCapabilityImpl(tx, action); },
  declare(tx: Tx, action: string): EstimatorWrites { return new EstimationCapabilityImpl(tx, action); },
  propose(tx: Tx, action: string): ProposeWrites { return new EstimationCapabilityImpl(tx, action); },
  decide(tx: Tx, action: string): DecideWrites { return new EstimationCapabilityImpl(tx, action); },
  request(tx: Tx, action: string): RequestWrites { return new EstimationCapabilityImpl(tx, action); },
  trigger(tx: Tx, action: string): TriggerWrites { return new EstimationCapabilityImpl(tx, action); },
};
