/**
 * TWIN CAPABILITIES — Phase 5 (L5 Digital Twins), stage P5-M1.
 *
 * The same shape as the prediction capabilities: one implementation, narrow
 * interfaces, every write a SECURITY DEFINER port that asserts the caller's own
 * bound action. A twin owner holds `declare`, `version`, `ground` and `admit`
 * one at a time — each a separate governed write with its own receipt — and a
 * simulation operator holds none of them.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

export type CitationKind = 'evidence' | 'claim' | 'entity' | 'forecast' | 'assumption' | 'run';
export interface Citation { kind: CitationKind; id: string; version: number; digest: string }

/** One exact canonical object version with the controls it carries. */
export interface CitedObjectRow {
  object_id: string; object_type: string; object_version: number; content_digest: string; lifecycle_state: string;
  truth_state: string; synthetic_state: boolean; classification: string; rights_profile: string | null;
  residency_profile: string | null; retention_profile: string | null; access_policy_ref: string | null; recorded_at: string;
  /** When the object was OBSERVED by this system (an upload's acquisition instant), as an instant. */
  observation_time: string | null;
  /** The object's own EVENT time — an uploaded record's stated document time — as an instant, when it has one. */
  event_time: string | null;
  /** The object's quality state — a forecast carries `{ validation }` here. */
  quality_state: Record<string, unknown> | null;
  /** The payload a claim carries, so an OBSERVED claim can establish a value. */
  payload: Record<string, unknown> | null;
}
export interface EntityRow { entity_id: string; entity_type: string; canonical_name: string; lifecycle_state: string }

abstract class TwinCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TwinReads {
  readonly action: string;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  readEvents(): any;
  readKindSchemas(): any;
  readBehaviourModels(): any;
  readReconciliations(): any;
  readCorrections(): any;
  readInvalidations(): any;
  /** The dependency table and the evidence-to-claim lineage: what a correction reaches before any walk. */
  readDependencies(): any;
  readClaimLineage(): any;
  /** The exact object version a citation names (latest when version is null), under RLS. */
  citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined>;
  entity(id: string): Promise<EntityRow | undefined>;
  stateSetDigest(a: { twinId: string; version: number }): Promise<string>;
  missingRequiredKeys(a: { twinId: string; version: number }): Promise<string[]>;
  rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface DeclareWrites extends TwinReads {
  declareTwin(a: {
    twinId: string; tenantId: string; domainId: string; kind: string; title: string; statement: string; boundary: string[];
    owner: string; intendedDecisions: string[]; interfaces: Record<string, unknown>; behaviourModelRef: string;
    validation: { status: string; envelope?: Record<string, unknown>; limitations: string[] };
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface VersionWrites extends TwinReads {
  openVersion(a: {
    twinId: string; tenantId: string; domainId: string; branchId: string; forkedFromVersion: number | null;
    knownAt: string; observedThrough: string | null; carryFrom: number | null; except: string[];
    actor: string; eventId: string; correlationId: string;
  }): Promise<number>;
}

export interface GroundWrites extends TwinReads {
  recordReconciliation(a: { reconciliationId: string; tenantId: string; domainId: string; twinId: string; key: string; fromVersion: number; againstVersion: number; note: string;
                            actor: string; eventId: string; correlationId: string }): Promise<unknown>;
  groundElement(a: {
    elementId: string; tenantId: string; domainId: string; twinId: string; version: number; key: string;
    kind: 'observed' | 'estimated' | 'assumed' | 'predicted' | 'simulated'; basisTruthState: string | null;
    value: unknown; unit: string | null; citations: Citation[]; health: 'complete' | 'incomplete' | 'unreadable' | 'stale';
    validFrom: string | null; validTo: string | null; confidence: number | null; syntheticState: boolean; controls: unknown;
    /** The cited forecast version's validation state, carried exactly by a PREDICTED element. */
    inheritedValidation: string | null;
    actor: string; eventId: string; correlationId: string;
  }): Promise<boolean>;
}

export interface AdmitWrites extends TwinReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  admitVersion(a: {
    twinId: string; tenantId: string; domainId: string; version: number; expectedDigest: string; headerDigest: string;
    allowIncomplete: boolean; syntheticState: boolean; controls: unknown;
    dependencies: Array<{ kind: string; id: string; key: string }>;
    actor: string; eventId: string; correlationId: string;
  }): Promise<{ state_set_digest: string; completeness: string; missing_keys: string[] }>;
  /** Verification changes by EVENT (propagation, P5-M5); the version row is otherwise untouched. */
  markUnverified(a: { twinId: string; tenantId: string; domainId: string; version: number; reason: string; invalidationId: string | null;
                      actor: string; eventId: string; correlationId: string }): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class TwinCapabilityImpl extends TwinCore implements DeclareWrites, VersionWrites, GroundWrites, AdmitWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readEvents(): any { return this.from('twin.twin_events'); }
  readKindSchemas(): any { return this.from('twin.twin_kind_schemas'); }
  readBehaviourModels(): any { return this.from('twin.behaviour_models'); }
  readReconciliations(): any { return this.from('twin.reconciliations'); }
  readCorrections(): any { return this.from('observation.correction_current'); }
  readInvalidations(): any { return this.from('graph.invalidations_current'); }
  readDependencies(): any { return this.from('graph.dependencies'); }
  readClaimLineage(): any { return this.from('intelligence.claim_lineage'); }

  async citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined> {
    const rows = await this.call<CitedObjectRow>(sql`
      select o.object_id::text, o.object_type, o.object_version::int, o.content_digest, o.lifecycle_state, o.truth_state,
             o.synthetic_state, o.classification, o.rights_profile, o.residency_profile, o.retention_profile, o.access_policy_ref,
             to_char(o.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at,
             to_char(o.observation_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as observation_time,
             to_char(o.event_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as event_time,
             o.quality_state, o.payload
        from objects.canonical_objects o
       where o.object_type = ${a.objectType} and o.object_id = ${a.id}::uuid
         and (${a.version}::int is null or o.object_version = ${a.version}::int)
       order by o.object_version desc limit 1`);
    return rows[0];
  }

  async entity(id: string): Promise<EntityRow | undefined> {
    const rows = await this.call<EntityRow>(sql`
      select e.entity_id::text, e.entity_type, e.canonical_name, e.lifecycle_state
        from graph.entities_current e where e.entity_id = ${id}::uuid`);
    return rows[0];
  }

  async stateSetDigest(a: { twinId: string; version: number }): Promise<string> {
    const rows = await this.call<{ d: string }>(sql`select twin.state_set_digest(${a.twinId}::uuid, ${a.version}::int) as d`);
    return String(rows[0]?.d ?? '');
  }

  async missingRequiredKeys(a: { twinId: string; version: number }): Promise<string[]> {
    const rows = await this.call<{ m: string[] }>(sql`select twin.missing_required_keys(${a.twinId}::uuid, ${a.version}::int) as m`);
    return (rows[0]?.m ?? []) as string[];
  }

  async rebuildProjections() {
    return this.call<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>(
      sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text from twin.rebuild_projections()`);
  }

  async declareTwin(a: Parameters<DeclareWrites['declareTwin']>[0]): Promise<void> {
    await this.call(sql`select twin.declare_twin(
      ${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.title}, ${a.statement},
      ${JSON.stringify(a.boundary)}::jsonb, ${a.owner}::uuid, ${JSON.stringify(a.intendedDecisions)}::jsonb,
      ${JSON.stringify(a.interfaces)}::jsonb, ${a.behaviourModelRef}, ${JSON.stringify(a.validation)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async openVersion(a: Parameters<VersionWrites['openVersion']>[0]): Promise<number> {
    const rows = await this.call<{ v: number }>(sql`select twin.open_version(
      ${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}, ${a.forkedFromVersion}::int,
      ${a.knownAt}::timestamptz, ${a.observedThrough}::date, ${a.carryFrom}::int, ${sql.raw(a.except.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${a.except.map((k) => `'${k.replace(/'/g, "''")}'`).join(',')}]::text[]`)},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as v`);
    return Number(rows[0]?.v);
  }

  async groundElement(a: Parameters<GroundWrites['groundElement']>[0]): Promise<boolean> {
    const rows = await this.call<{ m: boolean }>(sql`select twin.ground_element(
      ${a.elementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int, ${a.key}, ${a.kind},
      ${a.basisTruthState}, ${JSON.stringify(a.value ?? null)}::jsonb, ${a.unit}, ${JSON.stringify(a.citations)}::jsonb, ${a.health},
      ${a.validFrom}::date, ${a.validTo}::date, ${a.confidence}::numeric, ${a.syntheticState}, ${JSON.stringify(a.controls ?? {})}::jsonb,
      ${a.inheritedValidation}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as m`);
    return rows[0]?.m === true;
  }

  async recordReconciliation(a: Parameters<GroundWrites['recordReconciliation']>[0]): Promise<unknown> {
    const rows = await this.call<{ d: unknown }>(sql`select twin.record_reconciliation(${a.reconciliationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid,
      ${a.key}, ${a.fromVersion}::int, ${a.againstVersion}::int, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as d`);
    return rows[0]?.d;
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async admitVersion(a: Parameters<AdmitWrites['admitVersion']>[0]) {
    const rows = await this.call<{ r: { state_set_digest: string; completeness: string; missing_keys: string[] } }>(sql`select twin.admit_version(
      ${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.expectedDigest}, ${a.headerDigest},
      ${a.allowIncomplete}, ${a.syntheticState}, ${JSON.stringify(a.controls ?? {})}::jsonb, ${JSON.stringify(a.dependencies)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('admission returned no row');
    return r;
  }

  async markUnverified(a: Parameters<AdmitWrites['markUnverified']>[0]): Promise<void> {
    await this.call(sql`select twin.mark_unverified(${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int,
      ${a.reason}, ${a.invalidationId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const TwinCapability = {
  read(tx: Tx, action: string): TwinReads { return new TwinCapabilityImpl(tx, action); },
  declare(tx: Tx, action: string): DeclareWrites { return new TwinCapabilityImpl(tx, action); },
  version(tx: Tx, action: string): VersionWrites { return new TwinCapabilityImpl(tx, action); },
  ground(tx: Tx, action: string): GroundWrites { return new TwinCapabilityImpl(tx, action); },
  admit(tx: Tx, action: string): AdmitWrites { return new TwinCapabilityImpl(tx, action); },
};
