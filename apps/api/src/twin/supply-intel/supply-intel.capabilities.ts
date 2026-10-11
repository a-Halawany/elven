/**
 * CP-6 B33 §SC (0111) — THE SUPPLY-INTELLIGENCE CAPABILITIES (the twin capability's shape: one implementation, narrow interfaces, every write a
 * SECURITY DEFINER port that asserts the caller's own bound action). Reads go through the tables' row security (the domain's twins, versions,
 * elements, links, record sources and reads, inferences, disruptions, maps, alternatives, the routed items).
 *
 *   twin.supply.records.declare        → twin.tsc_declare_record_source     (the twin's owner)
 *   twin.supply.inference.draft        → twin.tsc_draft_inferences          (the domain's active Supply Chain Agent, in its running supply scan)
 *   twin.supply.inference.validate     → twin.tsc_decide_inference          (a named domain analyst; human-gated)
 *   twin.supply.inference.apply        → twin.tsc_apply_inference           (the twin's owner; human-gated)
 *   twin.supply.disruption.open        → twin.tsc_open_disruption           (a person — open; the agent — proposed)
 *   twin.supply.disruption.confirm     → twin.tsc_settle_disruption 'open'  (a person; human-gated)
 *   twin.supply.disruption.close       → twin.tsc_settle_disruption         (a person; human-gated)
 *   twin.supply.disruption.map         → twin.tsc_record_map                (a person, or the agent in its running scan)
 *   twin.supply.alternative.evaluate   → twin.tsc_record_alternative        (a person)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SupplyIntelReads {
  readonly action: string;
  readKinds(): any; readTwins(): any; readVersions(): any; readElements(): any; readLinks(): any; readScans(): any;
  readRecordSources(): any; readRecordReads(): any; readInferences(): any; readDisruptions(): any; readMaps(): any; readAlternatives(): any; readEvents(): any;
  readAgents(): any; readItems(): any; readEntities(): any;
  /** the database's instant */
  now(): Promise<string>;
  /** twin.version_freshness(twin, version) ->> 'state' (fresh | stale | unknown) — INVOKER, row security applies */
  freshness(twinId: string, version: number): Promise<string | null>;
  /** the admitted TWN version as a `twin` citation (its canonical digest), or null */
  twinCitation(tenantId: string, twinId: string, version: number): Promise<Row | null>;
  /** the digest the map port takes: sha256 over jsonb {pinned, result} as the database renders it (the replay compares it) */
  mapDigest(pinned: unknown[], result: Row): Promise<string | null>;
  /** the EVD versions of a source not yet read for a network (oldest first, at most `limit`) */
  unreadEvidence(twinId: string, sourceKey: string, limit: number): Promise<Array<{ id: string; version: number; digest: string; source_key: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordSourceWrites extends SupplyIntelReads {
  declareRecordSource(a: { recordSourceId: string; tenantId: string; domainId: string; twinId: string; sourceKey: string; note: string | null; retire: boolean; reason: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface InferenceDraftWrites extends SupplyIntelReads {
  draftInferences(a: { tenantId: string; domainId: string; twinId: string; version: number; reads: unknown[]; inferences: unknown[]; withdraw: unknown[]; agentId: string; runId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface InferenceDecideWrites extends SupplyIntelReads {
  decideInference(a: { inferenceId: string; tenantId: string; domainId: string; decision: 'validated' | 'rejected'; reason: string | null; digest: string | null; validUntil: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface InferenceApplyWrites extends SupplyIntelReads {
  applyInference(a: { inferenceId: string; tenantId: string; domainId: string; mode: 'apply' | 'revert'; version: number; actor: string; correlationId: string }): Promise<Row>;
}
export interface DisruptionWrites extends SupplyIntelReads {
  openDisruption(a: { disruptionId: string; tenantId: string; domainId: string; title: string; signal: Row; chokepoints: string[]; places: Row[]; derating: number; durationDays: number | null;
                      telemetryTwinId: string | null; agentId: string | null; runId: string | null; actor: string; correlationId: string }): Promise<Row>;
  settleDisruption(a: { disruptionId: string; tenantId: string; domainId: string; to: 'open' | 'closed' | 'withdrawn'; reason: string | null; actor: string; correlationId: string }): Promise<Row>;
  recordMap(a: { mapId: string; tenantId: string; domainId: string; disruptionId: string; pinned: unknown[]; result: Row; agentId: string | null; runId: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface AlternativeWrites extends SupplyIntelReads {
  recordAlternative(a: { alternativeId: string; tenantId: string; domainId: string; disruptionId: string; mapId: string; key: string; kind: string; title: string; params: Row; twinId: string;
                         branchVersion: number; evaluation: Row; verdict: string; reasons: string[]; limits: string[]; constraint: Row | null; cost: Row | null; actor: string; correlationId: string }): Promise<Row>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class SupplyIntelCapabilityImpl implements RecordSourceWrites, InferenceDraftWrites, InferenceDecideWrites, InferenceApplyWrites, DisruptionWrites, AlternativeWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }

  readKinds(): any { return this.from('twin.twin_kind_schemas'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readLinks(): any { return this.from('twin.twin_links'); }
  readScans(): any { return this.from('twin.agent_scans'); }
  readRecordSources(): any { return this.from('twin.supply_record_sources'); }
  readRecordReads(): any { return this.from('twin.supply_record_reads'); }
  readInferences(): any { return this.from('twin.supply_inferences'); }
  readDisruptions(): any { return this.from('twin.supply_disruptions'); }
  readMaps(): any { return this.from('twin.supply_disruption_maps'); }
  readAlternatives(): any { return this.from('twin.supply_alternatives'); }
  readEvents(): any { return this.from('twin.supply_events'); }
  readAgents(): any { return this.from('executive.agents'); }
  readItems(): any { return this.from('executive.attention_items'); }
  readEntities(): any { return this.from('graph.entities_current'); }

  async now(): Promise<string> {
    const r = await sql<{ now: string }>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`.execute(this.#tx);
    return r.rows[0]!.now;
  }
  async freshness(twinId: string, version: number): Promise<string | null> {
    const r = await sql<{ s: string | null }>`select twin.version_freshness(${twinId}::uuid, ${version}::int) ->> 'state' as s`.execute(this.#tx);
    return r.rows[0]?.s ?? null;
  }
  async twinCitation(tenantId: string, twinId: string, version: number): Promise<Row | null> {
    const r = await sql<{ c: Row | null }>`select jsonb_build_object('kind', 'twin', 'id', ${twinId}::text, 'version', ${version}::int, 'digest', o.content_digest) as c
      from twin.twin_versions v join objects.canonical_objects o on o.object_type = 'TWN' and o.object_id = v.twin_id and o.object_version = v.version and o.tenant_id = ${tenantId}::uuid
     where v.twin_id = ${twinId}::uuid and v.version = ${version}::int and v.state = 'admitted'`.execute(this.#tx);
    return r.rows[0]?.c ?? null;
  }
  async mapDigest(pinned: unknown[], result: Row): Promise<string | null> {
    const r = await sql<{ d: string }>`select encode(sha256(convert_to(jsonb_build_object('pinned', ${JSON.stringify(pinned)}::jsonb, 'result', ${JSON.stringify(result)}::jsonb)::text, 'UTF8')), 'hex') as d`.execute(this.#tx);
    return r.rows[0]?.d ?? null;
  }
  async unreadEvidence(twinId: string, sourceKey: string, limit: number) {
    const r = await sql<{ id: string; version: number; digest: string; source_key: string }>`
      select e.object_id::text as id, e.object_version::int as version, e.content_digest as digest, o.payload ->> 'source_key' as source_key
        from objects.canonical_objects o
        join objects.canonical_objects e on e.object_type = 'EVD' and e.tenant_id = o.tenant_id and e.domain_id = o.domain_id
                                        and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
       where o.object_type = 'OBS' and o.payload ->> 'source_key' = ${sourceKey}
         and e.lifecycle_state not in ('withdrawn', 'retired')
         and not exists (select 1 from twin.supply_record_reads r where r.twin_id = ${twinId}::uuid and r.evidence_id = e.object_id and r.evidence_version = e.object_version)
       order by e.recorded_at, e.object_id, e.object_version
       limit ${limit}`.execute(this.#tx);
    return r.rows;
  }

  async declareRecordSource(a: Parameters<RecordSourceWrites['declareRecordSource']>[0]) {
    return this.one(sql`select twin.tsc_declare_record_source(${a.recordSourceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.sourceKey}, ${a.note}, ${a.retire},
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async draftInferences(a: Parameters<InferenceDraftWrites['draftInferences']>[0]) {
    return this.one(sql`select twin.tsc_draft_inferences(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int, ${JSON.stringify(a.reads)}::jsonb,
      ${JSON.stringify(a.inferences)}::jsonb, ${JSON.stringify(a.withdraw)}::jsonb, ${a.agentId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decideInference(a: Parameters<InferenceDecideWrites['decideInference']>[0]) {
    return this.one(sql`select twin.tsc_decide_inference(${a.inferenceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.reason}, ${a.digest},
      ${a.validUntil}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async applyInference(a: Parameters<InferenceApplyWrites['applyInference']>[0]) {
    return this.one(sql`select twin.tsc_apply_inference(${a.inferenceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.mode}, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async openDisruption(a: Parameters<DisruptionWrites['openDisruption']>[0]) {
    return this.one(sql`select twin.tsc_open_disruption(${a.disruptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${JSON.stringify(a.signal)}::jsonb,
      ${a.chokepoints}::text[], ${JSON.stringify(a.places)}::jsonb, ${a.derating}::numeric, ${a.durationDays}::numeric, ${a.telemetryTwinId}::uuid, ${a.agentId}::uuid, ${a.runId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async settleDisruption(a: Parameters<DisruptionWrites['settleDisruption']>[0]) {
    return this.one(sql`select twin.tsc_settle_disruption(${a.disruptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.to}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordMap(a: Parameters<DisruptionWrites['recordMap']>[0]) {
    return this.one(sql`select twin.tsc_record_map(${a.mapId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.disruptionId}::uuid, ${JSON.stringify(a.pinned)}::jsonb,
      ${JSON.stringify(a.result)}::jsonb, ${a.agentId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordAlternative(a: Parameters<AlternativeWrites['recordAlternative']>[0]) {
    return this.one(sql`select twin.tsc_record_alternative(${a.alternativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.disruptionId}::uuid, ${a.mapId}::uuid, ${a.key}, ${a.kind},
      ${a.title}, ${JSON.stringify(a.params)}::jsonb, ${a.twinId}::uuid, ${a.branchVersion}::int, ${JSON.stringify(a.evaluation)}::jsonb, ${a.verdict}, ${JSON.stringify(a.reasons)}::jsonb,
      ${JSON.stringify(a.limits)}::jsonb, ${a.constraint === null ? null : JSON.stringify(a.constraint)}::jsonb, ${a.cost === null ? null : JSON.stringify(a.cost)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SupplyIntelCapability = {
  read(tx: Tx, action: string): SupplyIntelReads { return new SupplyIntelCapabilityImpl(tx, action); },
  records(tx: Tx, action: string): RecordSourceWrites { return new SupplyIntelCapabilityImpl(tx, action); },
  draft(tx: Tx, action: string): InferenceDraftWrites { return new SupplyIntelCapabilityImpl(tx, action); },
  decide(tx: Tx, action: string): InferenceDecideWrites { return new SupplyIntelCapabilityImpl(tx, action); },
  apply(tx: Tx, action: string): InferenceApplyWrites { return new SupplyIntelCapabilityImpl(tx, action); },
  disruption(tx: Tx, action: string): DisruptionWrites { return new SupplyIntelCapabilityImpl(tx, action); },
  alternative(tx: Tx, action: string): AlternativeWrites { return new SupplyIntelCapabilityImpl(tx, action); },
};
