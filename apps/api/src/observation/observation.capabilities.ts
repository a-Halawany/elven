/**
 * Observation capabilities — Gate-2.2 C8 applied to Phase 1.
 *
 * One capability per ACTION CLASS, exactly as the Phase 0 capabilities are built:
 * the relation is never a parameter, the transaction is unreachable, and a
 * handler receives a narrow interface with no escape hatch to widen. A registry
 * route cannot reach the vault manifests; an evidence route cannot transition a
 * contract; nothing here can enqueue an outbox event (that stays pipeline-private).
 *
 * These are defence in depth on top of migration 0022's ports, which bind every
 * write to the context's own bound action. Both layers must agree.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

abstract class ObservationCore {
  readonly #tx: Tx;
  readonly #action: string;

  protected constructor(tx: Tx, action: string) {
    this.#tx = tx;
    this.#action = action;
  }

  get action(): string {
    return this.#action;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async call<T>(fragment: { execute: (tx: Tx) => Promise<{ rows: T[] }> }): Promise<T[]> {
    return (await fragment.execute(this.#tx)).rows;
  }
}

// ───────────────────────── reads shared by every observation route ─────────────────────────

export interface ObservationReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContracts(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContractEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRuns(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRunEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readManifests(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readTombstones(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCustody(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readQuarantine(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readQuarantineEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMeasurements(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readHealthEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrectionEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAgents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCheckpoints(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSchedulerEntries(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any;
  /**
   * The LATEST evidence held for each deterministic item key of a source — what
   * a backfill re-run compares its bytes against (Phase 4 §4a). One query per
   * run, not one per item.
   */
  latestEvidenceByItemKeys(a: { sourceId: string; itemKeys: string[] }): Promise<Array<HeldEvidenceRow>>;
  /**
   * The latest evidence held per POLL KEY — the stable identity of what was polled
   * (a REST endpoint, a feed, a feed entry). A forward poll's item key carries the
   * retrieval instant, so it never repeats; the poll key is what an unchanged
   * response is compared against.
   */
  latestEvidenceByPollKeys(a: { sourceId: string; pollKeys: string[] }): Promise<Array<HeldEvidenceRow & { poll_key: string }>>;
  /**
   * The held evidence for a poll key WHOSE RETAINED TRANSPORT HEADERS carry the given
   * validator — the ETag sent as If-None-Match, or the Last-Modified sent as
   * If-Modified-Since when no ETag was sent. A 304 confirms exactly the representation
   * the validator names, which is not necessarily the newest held.
   */
  evidenceByValidator(a: { sourceId: string; pollKey: string; etag: string | null; lastModified: string | null }): Promise<HeldEvidenceRow | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readScheduledAttempts(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceRunLeases(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAdmittedItems(): any;
  /**
   * The three separate evidence figures for a source (migration 0051 §5). Counting
   * canonical EVD ROWS answered all three with one number, so 2,133 duplicate copies
   * and every superseded version counted as evidence held.
   */
  evidenceCounts(a: { sourceId: string; tenantId: string; domainId: string }): Promise<EvidenceCounts>;
  rebuildProjections(tenantId: string, domainId: string): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched_rows: string;
  }>>;
  replayHealth(tenantId: string, domainId: string, sourceId: string): Promise<Array<{
    evaluated_at: Date; state: string; calc_version: string; universe_version: string; reason: string;
  }>>;
}

/**
 * What a source holds, with the three questions kept apart:
 *  - `objects_held` — distinct EVD objects at any version; nothing is deleted, so it never falls.
 *  - `distinct_observations` — distinct item keys observed; one window observed twice is one observation.
 *  - `superseded_objects` — objects whose LATEST version is corrected or withdrawn: held and retrievable,
 *    not standing as current evidence.
 */
export interface EvidenceCounts {
  objects_held: number;
  /** Canonical EVD ROWS the same predicate selects — every version of every object. */
  rows_matched: number;
  distinct_observations: number;
  superseded_objects: number;
}

/**
 * What is HELD for an item or poll key, with what the lifecycle must know before it
 * may reuse it: the latest version's lifecycle state (a withdrawn object's bytes are
 * not served), the manifest the bytes resolve through, whether that manifest has been
 * governed-deleted, and where the bytes are — so availability and integrity can be
 * established, not assumed, before a poll is "confirmed unchanged".
 */
export interface HeldEvidenceRow {
  item_key: string; obs_object_id: string; evd_object_id: string; object_version: number;
  content_digest: string; recorded_at: string;
  lifecycle_state: string; manifest_id: string | null; locator: string | null; vault: string | null;
  manifest_present: boolean; tombstoned: boolean;
}

// ───────────────────────── registry writes ─────────────────────────

export interface RegisterSourceArgs {
  sourceId: string; contractVersion: number; tenantId: string; domainId: string;
  srcObjectId: string; srcObjectVersion: number; sourceKey: string; name: string; publisher: string;
  authorityClass: string; connectorKind: string; acquisitionMode: string; dataOrigin: string;
  rightsState: string; registrar: string; cadenceSeconds: number | null;
  freshnessThresholdSeconds: number | null; coverageUniverseVersion: string;
  schemaDriftTolerance: number; classificationCeiling: string; residency: string;
  purposes: string[]; endpoints: string[]; contract: Record<string, unknown>;
  eventId: string; correlationId: string;
}

export interface RegistryWrites extends ObservationReads {
  /** Registration admits the SRC canonical object through the existing path. */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  registerSource(a: RegisterSourceArgs): Promise<void>;
  approveSource(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    decision: 'approve' | 'reject'; reason: string; eventId: string; correlationId: string;
  }): Promise<void>;
  transitionContract(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    target: string; reason: string; eventId: string; correlationId: string;
  }): Promise<void>;
  setRightsState(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    rightsState: string; evidence: string; eventId: string; correlationId: string;
  }): Promise<void>;
  upsertSchedulerEntry(a: {
    sourceId: string; tenantId: string; domainId: string; contractVersion: number;
    schedulerId: string; queueName: string; cadenceSeconds: number; jitterSeconds: number;
    status: 'scheduled' | 'removed';
  }): Promise<void>;
  registerAgent(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string;
    agentKind: string; connector: string; agentVersion: string; codeDigest: string;
    owner: string; sourceId: string | null; budgets: Record<string, unknown>;
    eventId: string; correlationId: string;
  }): Promise<void>;
  revokeAgent(a: {
    agentId: string; tenantId: string; domainId: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── acquisition writes ─────────────────────────

export interface AcquisitionWrites extends ObservationReads {
  authorizeAgentRun(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string;
    agentVersion: string; codeDigest: string; sourceId: string;
  }): Promise<{ agent_id: string; budgets: Record<string, unknown>; owner_principal_id: string }>;
  lockActiveContract(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string; purpose: string | null;
  }): Promise<Record<string, unknown>>;
  appendRunEvent(a: {
    eventId: string; tenantId: string; domainId: string; runId: string; sourceId: string;
    contractVersion: number; agentPrincipalId: string; agentVersion: string; codeDigest: string;
    connector: string; connectorVersion: string; acquisitionMode: string; event: string;
    details: Record<string, unknown>; correlationId: string;
  }): Promise<void>;
  /**
   * Claim the source for this run (migration 0051 §1). One lease row per source; a
   * second attempt — operator or scheduler — is refused with the holder named while
   * the lease is live, and takes an EXPIRED lease over. `run.started` is refused by
   * the database unless this run holds it, so the condition holds for every caller.
   */
  acquireSourceRunLease(a: {
    tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string; trigger: 'operator' | 'scheduler' | 'sweeper'; leaseSeconds: number; correlationId: string;
  }): Promise<SourceRunLeaseAnswer>;
  releaseSourceRunLease(a: {
    tenantId: string; domainId: string; sourceId: string; runId: string;
  }): Promise<boolean>;
  /**
   * Claim the admission of one DETERMINISTIC item, inside the admitting transaction
   * (migration 0051 §3). The attempt key stops one run admitting an item twice; this
   * stops a DIFFERENT run — a crash-retry, a concurrent walk — admitting a second copy
   * of content already held under the same item key.
   */
  claimItemAdmission(a: {
    tenantId: string; domainId: string; sourceId: string; itemKey: string;
    contentDigest: string; evdObjectId: string; obsObjectId: string;
    objectVersion: number; contractVersion: number; runId: string;
    /**
     * The caller ESTABLISHED, by reading, that what is held for this key cannot be
     * reused — withdrawn, governed-deleted, no manifest, or bytes that no longer
     * verify. The register then follows that governed decision and records the fresh
     * admission instead of confirming against evidence that is not there (0052).
     */
    readmitUnavailable: boolean;
  }): Promise<ItemAdmissionClaim>;
  claimAttempt(a: {
    attemptId: string; tenantId: string; domainId: string; sourceId: string;
    contractVersion: number; runId: string; itemKey: string; correlationId: string;
  }): Promise<'claimed' | 'replay'>;
  markAttemptOutcome(a: {
    tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string; itemKey: string; outcome: string; evdObjectId: string | null;
  }): Promise<void>;
  recordManifest(a: {
    manifestId: string; tenantId: string; domainId: string; vault: string; locator: string;
    digest: string; byteLength: number; declaredType: string | null; sniffedType: string | null;
    activeContentRisk: boolean; classification: string; residency: string; retention: string;
    legalHold: boolean; sourceId: string; contractVersion: number; runId: string | null;
    acquisitionMode: string; correlationId: string;
  }): Promise<void>;
  tombstoneBlob(a: {
    tombstoneId: string; tenantId: string; domainId: string; manifestId: string;
    reason: string; correlationId: string;
  }): Promise<boolean>;
  appendCustody(a: {
    eventId: string; tenantId: string; domainId: string; manifestId: string | null;
    obsObjectId: string | null; evdObjectId: string | null; sourceId: string;
    contractVersion: number; runId: string | null; event: string; actor: string;
    agentPrincipalId: string | null; agentVersion: string | null; codeDigest: string | null;
    connector: string | null; connectorVersion: string | null; methodRef: string | null;
    contentDigest: string | null; digestVerified: boolean | null;
    details: Record<string, unknown>; correlationId: string;
  }): Promise<void>;
  openQuarantineCase(a: {
    caseId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string | null; manifestId: string | null; itemKey: string; reasonClass: string;
    reason: string; declaredType: string | null; sniffedType: string | null;
    byteLength: number; digest: string; ttlSeconds: number; eventId: string; correlationId: string;
  }): Promise<void>;
  closeQuarantineCase(a: {
    caseId: string; tenantId: string; domainId: string; outcome: 'admitted' | 'rejected' | 'expired';
    reason: string | null; eventId: string; correlationId: string;
  }): Promise<void>;
  appendCheckpoint(a: {
    eventId: string; tenantId: string; domainId: string; sourceId: string;
    contractVersion: number; runId: string; checkpoint: Record<string, unknown>; correlationId: string;
  }): Promise<void>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  recordMeasurement(a: MeasurementArgs): Promise<void>;
  appendHealthEvent(a: HealthEventArgs): Promise<void>;
  /**
   * A correction has taken an evidence object out of the standing record. Re-point the
   * admission register (0051 §3) at the newest surviving admission under the same item
   * key — or stop indexing the key when nothing survives — so a later re-walk never
   * records "already held" against evidence a correction set aside (0053).
   */
  reindexAdmittedItem(a: {
    tenantId: string; domainId: string; sourceId: string; evdObjectId: string;
  }): Promise<{ reindexed: boolean; itemKey?: string; toEvdObjectId?: string | null }>;
  openCorrectionCase(a: {
    caseId: string; tenantId: string; domainId: string; sourceId: string; kind: string;
    channel: string; publisherRef: string | null; reason: string; eventId: string; correlationId: string;
  }): Promise<void>;
  closeCorrectionCase(a: {
    caseId: string; tenantId: string; domainId: string; outcome: string;
    affectedResolved: unknown[]; failureReason: string | null; eventId: string; correlationId: string;
  }): Promise<void>;
}

/** The lease answer, as the port returns it. A refusal names the holder; it is never a bare "no". */
export type SourceRunLeaseAnswer =
  | { granted: true; runId: string; tookOverFrom: string | null; reentrant?: boolean }
  | {
      granted: false; refusalClass: 'source_run_in_flight';
      holderRunId: string; holderTrigger: string; holderContractVersion: number;
      acquiredAt: string; heartbeatAt: string; expiresAt: string;
    };

/** What the admission register answered for one deterministic item. */
export type ItemAdmissionClaim =
  | { outcome: 'admitted' | 'revised'; evdObjectId: string; objectVersion: number; priorDigest?: string;
      /** What the admission displaced in the register, when the held evidence could not be reused. */
      replacedEvdObjectId?: string; replacedObjectVersion?: number }
  | { outcome: 'noop'; evdObjectId: string; objectVersion: number; contentDigest: string; firstAdmittedAt: string; runId: string | null }
  | {
      outcome: 'conflict'; heldEvdObjectId: string; heldObjectVersion: number; heldDigest: string;
      heldRunId: string | null; claimedEvdObjectId: string; claimedObjectVersion: number;
    };

export interface MeasurementArgs {
  measurementId: string; tenantId: string; domainId: string; sourceId: string;
  dimension: string; state: string; valueNumeric: number | null; valueText: string | null;
  evaluatedAt: string; windowStart: string; windowEnd: string; denominator: number | null;
  denominatorDerivation: string | null; universeVersion: string; calcMethod: string;
  calcVersion: string; evidenceRefs: unknown[]; applicability: string;
  naReason: string | null; confidence: string; errorClass: string | null; correlationId: string;
}

export interface HealthEventArgs {
  eventId: string; tenantId: string; domainId: string; sourceId: string;
  prior: string | null; next: string; evaluatedAt: string; calcVersion: string;
  universeVersion: string; evidenceRefs: unknown[]; reason: string; lagClass: string;
  correlationId: string;
}

// ───────────────────────── the implementation ─────────────────────────

class ObservationCapabilityImpl extends ObservationCore implements RegistryWrites, AcquisitionWrites {
  constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  // reads — each names ONE fixed relation; the relation is never a parameter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContractEvents(): any { return this.from('observation.source_contract_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRuns(): any { return this.from('observation.collection_runs_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRunEvents(): any { return this.from('observation.collection_run_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readManifests(): any { return this.from('observation.blob_manifests'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readTombstones(): any { return this.from('observation.blob_tombstones'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCustody(): any { return this.from('observation.custody_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readQuarantine(): any { return this.from('observation.quarantine_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readQuarantineEvents(): any { return this.from('observation.quarantine_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMeasurements(): any { return this.from('observation.coverage_measurements'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readHealthEvents(): any { return this.from('observation.source_health_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any { return this.from('observation.correction_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrectionEvents(): any { return this.from('observation.correction_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAgents(): any { return this.from('observation.agents'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCheckpoints(): any { return this.from('observation.connector_checkpoints'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSchedulerEntries(): any { return this.from('observation.scheduler_entries'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }

  async latestEvidenceByItemKeys(a: { sourceId: string; itemKeys: string[] }): Promise<Array<HeldEvidenceRow>> {
    if (a.itemKeys.length === 0) return [];
    // The newest OBS per item key, then the newest EVD VERSION that cites it. A
    // revision admits a new EVD version citing a new OBS with the same item key,
    // so "latest OBS, then its latest EVD" is the current state of that window.
    return this.call(sql`
      with obs as (
        select distinct on (o.payload ->> 'item_key') o.object_id, o.payload ->> 'item_key' as item_key
          from objects.canonical_objects o
         where o.object_type = 'OBS' and o.payload ->> 'source_id' = ${a.sourceId}
           and o.payload ->> 'item_key' = any(${a.itemKeys}::text[])
         order by o.payload ->> 'item_key', o.recorded_at desc, o.object_version desc)
      select obs.item_key, obs.object_id::text as obs_object_id, e.object_id::text as evd_object_id,
             e.object_version::int as object_version, e.payload ->> 'content_digest' as content_digest,
             e.recorded_at::text as recorded_at, e.lifecycle_state,
             e.payload ->> 'manifest_id' as manifest_id, e.payload ->> 'locator' as locator, e.payload ->> 'vault' as vault,
             exists (select 1 from observation.blob_manifests m where m.manifest_id = (e.payload ->> 'manifest_id')::uuid) as manifest_present,
             exists (select 1 from observation.blob_tombstones t where t.manifest_id = (e.payload ->> 'manifest_id')::uuid) as tombstoned
        from obs
        join lateral (select * from objects.canonical_objects e
                       where e.object_type = 'EVD' and e.payload ->> 'obs_object_id' = obs.object_id::text
                       order by e.object_version desc limit 1) e on true`);
  }

  async latestEvidenceByPollKeys(a: { sourceId: string; pollKeys: string[] }): Promise<Array<HeldEvidenceRow & { poll_key: string }>> {
    if (a.pollKeys.length === 0) return [];
    // An item key is `<poll key>` (a feed entry), or `<poll key>@<retrieval instant>`
    // (a forward poll), or `<parent poll key>@<instant>#<path>:<key>` (a framed child).
    // Stripping the `@<instant>` segment therefore recovers the poll key EXACTLY — a
    // prefix match would let a framed child stand in for its parent, or a backfill
    // window (`@backfill:…`) stand in for the forward poll; neither is the same thing.
    return this.call(sql`
      with keys as (select unnest(${a.pollKeys}::text[]) as poll_key),
      obs as (
        select distinct on (k.poll_key) k.poll_key, o.object_id, o.payload ->> 'item_key' as item_key
          from keys k
          join objects.canonical_objects o
            on o.object_type = 'OBS' and o.payload ->> 'source_id' = ${a.sourceId}
           and o.payload ->> 'item_key' not like '%@backfill:%'
           and (o.payload ->> 'item_key' = k.poll_key
                or regexp_replace(o.payload ->> 'item_key', '@[^#]*', '') = k.poll_key)
         order by k.poll_key, o.recorded_at desc, o.object_version desc)
      select obs.poll_key, obs.item_key, obs.object_id::text as obs_object_id, e.object_id::text as evd_object_id,
             e.object_version::int as object_version, e.payload ->> 'content_digest' as content_digest,
             e.recorded_at::text as recorded_at, e.lifecycle_state,
             e.payload ->> 'manifest_id' as manifest_id, e.payload ->> 'locator' as locator, e.payload ->> 'vault' as vault,
             exists (select 1 from observation.blob_manifests m where m.manifest_id = (e.payload ->> 'manifest_id')::uuid) as manifest_present,
             exists (select 1 from observation.blob_tombstones t where t.manifest_id = (e.payload ->> 'manifest_id')::uuid) as tombstoned
        from obs
        join lateral (select * from objects.canonical_objects e
                       where e.object_type = 'EVD' and e.payload ->> 'obs_object_id' = obs.object_id::text
                       order by e.object_version desc limit 1) e on true`);
  }

  async evidenceByValidator(a: { sourceId: string; pollKey: string; etag: string | null; lastModified: string | null }): Promise<HeldEvidenceRow | null> {
    if (a.etag === null && a.lastModified === null) return null;
    const rows = await this.call<HeldEvidenceRow>(sql`
      with obs as (
        select o.object_id, o.payload ->> 'item_key' as item_key
          from objects.canonical_objects o
         where o.object_type = 'OBS' and o.payload ->> 'source_id' = ${a.sourceId}
           and o.payload ->> 'item_key' not like '%@backfill:%'
           and (o.payload ->> 'item_key' = ${a.pollKey} or regexp_replace(o.payload ->> 'item_key', '@[^#]*', '') = ${a.pollKey})
           and (case when ${a.etag}::text is not null
                     then o.payload #>> '{transport,retained_headers,etag}' = ${a.etag}::text
                     else o.payload #>> '{transport,retained_headers,last-modified}' = ${a.lastModified}::text end)
         order by o.recorded_at desc, o.object_version desc limit 1)
      select obs.item_key, obs.object_id::text as obs_object_id, e.object_id::text as evd_object_id,
             e.object_version::int as object_version, e.payload ->> 'content_digest' as content_digest,
             e.recorded_at::text as recorded_at, e.lifecycle_state,
             e.payload ->> 'manifest_id' as manifest_id, e.payload ->> 'locator' as locator, e.payload ->> 'vault' as vault,
             exists (select 1 from observation.blob_manifests m where m.manifest_id = (e.payload ->> 'manifest_id')::uuid) as manifest_present,
             exists (select 1 from observation.blob_tombstones t where t.manifest_id = (e.payload ->> 'manifest_id')::uuid) as tombstoned
        from obs
        join lateral (select * from objects.canonical_objects e
                       where e.object_type = 'EVD' and e.payload ->> 'obs_object_id' = obs.object_id::text
                       order by e.object_version desc limit 1) e on true`);
    return rows[0] ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readScheduledAttempts(): any { return this.from('observation.scheduled_attempts'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceRunLeases(): any { return this.from('observation.source_run_leases'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAdmittedItems(): any { return this.from('observation.admitted_items'); }

  async evidenceCounts(a: { sourceId: string; tenantId: string; domainId: string }): Promise<EvidenceCounts> {
    /*
     * THROUGH THE PORT (migration 0054). Asked as a plain statement, this scan crossed
     * its own row-level-security context's wall-clock expiry part of the way through and
     * answered a SMALLER number instead of an error — 336, then 314, then 320 for a
     * source holding 4,984 objects, with nobody writing. The port establishes scope once
     * and counts; a figure a register prints has to be a figure, not a race.
     */
    const rows = await this.call<{ objects_held: string; distinct_observations: string; superseded_objects: string; rows_matched: string }>(
      sql`select * from observation.evidence_counts(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid)`);
    const r = rows[0];
    return {
      objects_held: Number(r?.objects_held ?? 0),
      distinct_observations: Number(r?.distinct_observations ?? 0),
      superseded_objects: Number(r?.superseded_objects ?? 0),
      rows_matched: Number(r?.rows_matched ?? 0),
    };
  }


  async rebuildProjections(tenantId: string, domainId: string): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched_rows: string;
  }>> {
    return this.call(sql`select * from observation.rebuild_projections(${tenantId}::uuid, ${domainId}::uuid)`);
  }

  async replayHealth(tenantId: string, domainId: string, sourceId: string): Promise<Array<{
    evaluated_at: Date; state: string; calc_version: string; universe_version: string; reason: string;
  }>> {
    return this.call(sql`select * from observation.replay_health(
      ${tenantId}::uuid, ${domainId}::uuid, ${sourceId}::uuid)`);
  }

  // registry writes
  async registerSource(a: RegisterSourceArgs): Promise<void> {
    await this.call(sql`select observation.register_source(
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.srcObjectId}::uuid, ${a.srcObjectVersion}::bigint,
      ${a.sourceKey}, ${a.name}, ${a.publisher},
      ${a.authorityClass}, ${a.connectorKind}, ${a.acquisitionMode}, ${a.dataOrigin},
      ${a.rightsState}, ${a.registrar}::uuid, ${a.cadenceSeconds},
      ${a.freshnessThresholdSeconds}, ${a.coverageUniverseVersion},
      ${a.schemaDriftTolerance}, ${a.classificationCeiling}, ${a.residency},
      ${JSON.stringify(a.purposes)}::jsonb, ${JSON.stringify(a.endpoints)}::jsonb,
      ${JSON.stringify(a.contract)}::jsonb, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async approveSource(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    decision: 'approve' | 'reject'; reason: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.approve_source(
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.decision}, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async transitionContract(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    target: string; reason: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.transition_contract(
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.target}, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async setRightsState(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string;
    rightsState: string; evidence: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.set_rights_state(
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.rightsState}, ${a.evidence}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async upsertSchedulerEntry(a: {
    sourceId: string; tenantId: string; domainId: string; contractVersion: number;
    schedulerId: string; queueName: string; cadenceSeconds: number; jitterSeconds: number;
    status: 'scheduled' | 'removed';
  }): Promise<void> {
    await this.call(sql`select observation.upsert_scheduler_entry(
      ${a.sourceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.contractVersion},
      ${a.schedulerId}, ${a.queueName}, ${a.cadenceSeconds}, ${a.jitterSeconds}, ${a.status})`);
  }

  async registerAgent(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string;
    agentKind: string; connector: string; agentVersion: string; codeDigest: string;
    owner: string; sourceId: string | null; budgets: Record<string, unknown>;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.register_agent(
      ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid,
      ${a.agentKind}, ${a.connector}, ${a.agentVersion}, ${a.codeDigest},
      ${a.owner}::uuid, ${a.sourceId}::uuid, ${JSON.stringify(a.budgets)}::jsonb,
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async revokeAgent(a: {
    agentId: string; tenantId: string; domainId: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.revoke_agent(
      ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason},
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  // acquisition writes
  async authorizeAgentRun(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string;
    agentVersion: string; codeDigest: string; sourceId: string;
  }): Promise<{ agent_id: string; budgets: Record<string, unknown>; owner_principal_id: string }> {
    const rows = await this.call<{ agent_id: string; budgets: Record<string, unknown>; owner_principal_id: string }>(
      sql`select (observation.authorize_agent_run(
        ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid,
        ${a.agentVersion}, ${a.codeDigest}, ${a.sourceId}::uuid)).*`);
    const row = rows[0];
    if (row === undefined) throw new Error('agent authorization returned no row');
    return row;
  }

  async lockActiveContract(a: {
    sourceId: string; contractVersion: number; tenantId: string; domainId: string; purpose: string | null;
  }): Promise<Record<string, unknown>> {
    const rows = await this.call<Record<string, unknown>>(
      sql`select (observation.lock_active_contract(
        ${a.sourceId}::uuid, ${a.contractVersion}, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.purpose})).*`);
    const row = rows[0];
    if (row === undefined) throw new Error('contract revalidation returned no row');
    return row;
  }

  async appendRunEvent(a: {
    eventId: string; tenantId: string; domainId: string; runId: string; sourceId: string;
    contractVersion: number; agentPrincipalId: string; agentVersion: string; codeDigest: string;
    connector: string; connectorVersion: string; acquisitionMode: string; event: string;
    details: Record<string, unknown>; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.append_run_event(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid,
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.agentPrincipalId}::uuid, ${a.agentVersion},
      ${a.codeDigest}, ${a.connector}, ${a.connectorVersion}, ${a.acquisitionMode},
      ${a.event}, ${JSON.stringify(a.details)}::jsonb, ${a.correlationId}::uuid)`);
  }

  async acquireSourceRunLease(a: {
    tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string; trigger: 'operator' | 'scheduler' | 'sweeper'; leaseSeconds: number; correlationId: string;
  }): Promise<SourceRunLeaseAnswer> {
    const rows = await this.call<{ answer: Record<string, unknown> }>(sql`select observation.acquire_source_run_lease(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion},
      ${a.runId}::uuid, ${a.trigger}, ${a.leaseSeconds}, ${a.correlationId}::uuid) as answer`);
    const r = (rows[0]?.answer ?? {}) as Record<string, unknown>;
    if (r['granted'] === true) {
      return {
        granted: true, runId: String(r['run_id']),
        tookOverFrom: (r['took_over_from'] as string | null) ?? null,
        ...(r['reentrant'] === true ? { reentrant: true } : {}),
      };
    }
    return {
      granted: false, refusalClass: 'source_run_in_flight',
      holderRunId: String(r['holder_run_id']), holderTrigger: String(r['holder_trigger']),
      holderContractVersion: Number(r['holder_contract_version']),
      acquiredAt: String(r['acquired_at']), heartbeatAt: String(r['heartbeat_at']),
      expiresAt: String(r['expires_at']),
    };
  }

  async releaseSourceRunLease(a: {
    tenantId: string; domainId: string; sourceId: string; runId: string;
  }): Promise<boolean> {
    const rows = await this.call<{ released: boolean }>(sql`select observation.release_source_run_lease(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.runId}::uuid) as released`);
    return rows[0]?.released === true;
  }

  async claimItemAdmission(a: {
    tenantId: string; domainId: string; sourceId: string; itemKey: string;
    contentDigest: string; evdObjectId: string; obsObjectId: string;
    objectVersion: number; contractVersion: number; runId: string; readmitUnavailable: boolean;
  }): Promise<ItemAdmissionClaim> {
    const rows = await this.call<{ answer: Record<string, unknown> }>(sql`select observation.claim_item_admission(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.itemKey},
      ${a.contentDigest}, ${a.evdObjectId}::uuid, ${a.obsObjectId}::uuid,
      ${a.objectVersion}, ${a.contractVersion}, ${a.runId}::uuid, ${a.readmitUnavailable}) as answer`);
    const r = (rows[0]?.answer ?? {}) as Record<string, unknown>;
    const outcome = String(r['outcome']);
    if (outcome === 'noop') {
      return {
        outcome: 'noop', evdObjectId: String(r['evd_object_id']), objectVersion: Number(r['object_version']),
        contentDigest: String(r['content_digest']), firstAdmittedAt: String(r['first_admitted_at']),
        runId: (r['run_id'] as string | null) ?? null,
      };
    }
    if (outcome === 'conflict') {
      return {
        outcome: 'conflict', heldEvdObjectId: String(r['held_evd_object_id']),
        heldObjectVersion: Number(r['held_object_version']), heldDigest: String(r['held_digest']),
        heldRunId: (r['held_run_id'] as string | null) ?? null,
        claimedEvdObjectId: String(r['claimed_evd_object_id']),
        claimedObjectVersion: Number(r['claimed_object_version']),
      };
    }
    return {
      outcome: outcome === 'revised' ? 'revised' : 'admitted',
      evdObjectId: String(r['evd_object_id']), objectVersion: Number(r['object_version']),
      ...(r['prior_digest'] === undefined || r['prior_digest'] === null ? {} : { priorDigest: String(r['prior_digest']) }),
      ...(r['replaced_evd_object_id'] === undefined || r['replaced_evd_object_id'] === null ? {} : {
        replacedEvdObjectId: String(r['replaced_evd_object_id']),
        replacedObjectVersion: Number(r['replaced_object_version']),
      }),
    };
  }

  async claimAttempt(a: {
    attemptId: string; tenantId: string; domainId: string; sourceId: string;
    contractVersion: number; runId: string; itemKey: string; correlationId: string;
  }): Promise<'claimed' | 'replay'> {
    const rows = await this.call<{ claim_attempt: string }>(sql`select observation.claim_attempt(
      ${a.attemptId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}, ${a.runId}::uuid, ${a.itemKey}, ${a.correlationId}::uuid) as claim_attempt`);
    return (rows[0]?.claim_attempt === 'replay') ? 'replay' : 'claimed';
  }

  async markAttemptOutcome(a: {
    tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string; itemKey: string; outcome: string; evdObjectId: string | null;
  }): Promise<void> {
    await this.call(sql`select observation.mark_attempt_outcome(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion},
      ${a.runId}::uuid, ${a.itemKey}, ${a.outcome}, ${a.evdObjectId}::uuid)`);
  }

  async recordManifest(a: {
    manifestId: string; tenantId: string; domainId: string; vault: string; locator: string;
    digest: string; byteLength: number; declaredType: string | null; sniffedType: string | null;
    activeContentRisk: boolean; classification: string; residency: string; retention: string;
    legalHold: boolean; sourceId: string; contractVersion: number; runId: string | null;
    acquisitionMode: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.record_manifest(
      ${a.manifestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.vault}, ${a.locator},
      ${a.digest}, ${a.byteLength}::bigint, ${a.declaredType}, ${a.sniffedType}, ${a.activeContentRisk},
      ${a.classification}, ${a.residency}, ${a.retention}, ${a.legalHold},
      ${a.sourceId}::uuid, ${a.contractVersion}, ${a.runId}::uuid, ${a.acquisitionMode},
      ${a.correlationId}::uuid)`);
  }

  async tombstoneBlob(a: {
    tombstoneId: string; tenantId: string; domainId: string; manifestId: string;
    reason: string; correlationId: string;
  }): Promise<boolean> {
    const rows = await this.call<{ tombstone_blob: boolean }>(sql`select observation.tombstone_blob(
      ${a.tombstoneId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid,
      ${a.reason}, ${a.correlationId}::uuid) as tombstone_blob`);
    return rows[0]?.tombstone_blob === true;
  }

  async appendCustody(a: {
    eventId: string; tenantId: string; domainId: string; manifestId: string | null;
    obsObjectId: string | null; evdObjectId: string | null; sourceId: string;
    contractVersion: number; runId: string | null; event: string; actor: string;
    agentPrincipalId: string | null; agentVersion: string | null; codeDigest: string | null;
    connector: string | null; connectorVersion: string | null; methodRef: string | null;
    contentDigest: string | null; digestVerified: boolean | null;
    details: Record<string, unknown>; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.append_custody(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid,
      ${a.obsObjectId}::uuid, ${a.evdObjectId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion},
      ${a.runId}::uuid, ${a.event}, ${a.actor}, ${a.agentPrincipalId}::uuid, ${a.agentVersion},
      ${a.codeDigest}, ${a.connector}, ${a.connectorVersion}, ${a.methodRef},
      ${a.contentDigest}, ${a.digestVerified}, ${JSON.stringify(a.details)}::jsonb,
      ${a.correlationId}::uuid)`);
  }

  async openQuarantineCase(a: {
    caseId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    runId: string | null; manifestId: string | null; itemKey: string; reasonClass: string;
    reason: string; declaredType: string | null; sniffedType: string | null;
    byteLength: number; digest: string; ttlSeconds: number; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.open_quarantine_case(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}, ${a.runId}::uuid, ${a.manifestId}::uuid, ${a.itemKey},
      ${a.reasonClass}, ${a.reason}, ${a.declaredType}, ${a.sniffedType},
      ${a.byteLength}::bigint, ${a.digest}, ${a.ttlSeconds}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async closeQuarantineCase(a: {
    caseId: string; tenantId: string; domainId: string; outcome: 'admitted' | 'rejected' | 'expired';
    reason: string | null; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.close_quarantine_case(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason},
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async appendCheckpoint(a: {
    eventId: string; tenantId: string; domainId: string; sourceId: string;
    contractVersion: number; runId: string; checkpoint: Record<string, unknown>; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.append_checkpoint(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}, ${a.runId}::uuid, ${JSON.stringify(a.checkpoint)}::jsonb,
      ${a.correlationId}::uuid)`);
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async recordMeasurement(a: MeasurementArgs): Promise<void> {
    await this.call(sql`select observation.record_measurement(
      ${a.measurementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.dimension}, ${a.state}, ${a.valueNumeric}, ${a.valueText},
      ${a.evaluatedAt}::timestamptz, ${a.windowStart}::timestamptz, ${a.windowEnd}::timestamptz,
      ${a.denominator}, ${a.denominatorDerivation}, ${a.universeVersion},
      ${a.calcMethod}, ${a.calcVersion}, ${JSON.stringify(a.evidenceRefs)}::jsonb,
      ${a.applicability}, ${a.naReason}, ${a.confidence}, ${a.errorClass}, ${a.correlationId}::uuid)`);
  }

  async appendHealthEvent(a: HealthEventArgs): Promise<void> {
    await this.call(sql`select observation.append_health_event(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.prior}, ${a.next}, ${a.evaluatedAt}::timestamptz, ${a.calcVersion},
      ${a.universeVersion}, ${JSON.stringify(a.evidenceRefs)}::jsonb, ${a.reason},
      ${a.lagClass}, ${a.correlationId}::uuid)`);
  }

  async reindexAdmittedItem(a: {
    tenantId: string; domainId: string; sourceId: string; evdObjectId: string;
  }): Promise<{ reindexed: boolean; itemKey?: string; toEvdObjectId?: string | null }> {
    const rows = await this.call<{ answer: Record<string, unknown> }>(sql`select observation.reindex_admitted_item(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.evdObjectId}::uuid) as answer`);
    const r = (rows[0]?.answer ?? {}) as Record<string, unknown>;
    return {
      reindexed: r['reindexed'] === true,
      ...(r['item_key'] === undefined ? {} : { itemKey: String(r['item_key']) }),
      ...(r['to_evd_object_id'] === undefined ? {} : { toEvdObjectId: (r['to_evd_object_id'] as string | null) ?? null }),
    };
  }

  async openCorrectionCase(a: {
    caseId: string; tenantId: string; domainId: string; sourceId: string; kind: string;
    channel: string; publisherRef: string | null; reason: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.open_correction_case(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.kind}, ${a.channel}, ${a.publisherRef}, ${a.reason},
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async closeCorrectionCase(a: {
    caseId: string; tenantId: string; domainId: string; outcome: string;
    affectedResolved: unknown[]; failureReason: string | null; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select observation.close_correction_case(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome},
      ${JSON.stringify(a.affectedResolved)}::jsonb, ${a.failureReason},
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}

/**
 * The three capability classes a route may ask for. They are separate TYPES over
 * one implementation: what a route can express is what its declared interface
 * exposes, and a read route literally has no method to write with.
 */
export const ObservationCapability = {
  read(tx: Tx, action: string): ObservationReads {
    return new ObservationCapabilityImpl(tx, action);
  },
  registry(tx: Tx, action: string): RegistryWrites {
    return new ObservationCapabilityImpl(tx, action);
  },
  acquisition(tx: Tx, action: string): AcquisitionWrites {
    return new ObservationCapabilityImpl(tx, action);
  },
};
