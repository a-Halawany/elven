/**
 * Canonical object service — CP-OBJ-01 (ADR-P0-05/06/07).
 * Create / version / correct / as-of retrieval. Header validated against the
 * contracts schema; payload validated against the registered object-type
 * schema; writes without minimum provenance rejected (EYE-PRV-001); versions
 * are immutable and content-addressed; corrections are non-destructive new
 * versions linked via correction_of.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  contentDigest,
  errorBody,
  hasMinimumProvenance,
  isTruthState,
  type TruthState,
} from '@eye/contracts';
import type { Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { ScopeContext } from '../shared/scope.js';

export interface CreateObjectInput {
  objectType: string;
  truthState: string;
  syntheticState?: boolean;
  eventTime?: string | null;
  observationTime?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  timePrecision?: string;
  sourceClockQuality?: 'trusted' | 'degraded' | 'unknown';
  evidenceRefs?: string[];
  methodRef?: string | null;
  humanRefs?: string[];
  sourceObjectIds?: string[];
  classification: string;
  purposeScope: string;
  schemaVersion?: string;
  payload: Record<string, unknown>;
}

export interface ObjectRow {
  object_id: string;
  object_type: string;
  object_version: string | number;
  truth_state: string;
  lifecycle_state: string;
  recorded_at: Date;
  content_digest: string;
  [k: string]: unknown;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
(addFormats as unknown as { default?: (a: Ajv2020) => void }).default?.(ajv) ??
  (addFormats as unknown as (a: Ajv2020) => void)(ajv);

function bad(code: 'EYE_REQ_001' | 'EYE_PRV_001' | 'EYE_TMP_001' | 'EYE_STA_001' | 'EYE_STA_002' | 'EYE_STA_003', corr: string, msg: string, status = 422): HttpException {
  return new HttpException(errorBody(code, corr, msg), status);
}

@Injectable()
export class ObjectsService {
  /** Validate + admit version 1 of a canonical object (step 5 + 6 of the commit path). */
  async createObject(
    tx: Tx,
    ctx: ScopeContext,
    actor: string,
    correlationId: string,
    input: CreateObjectInput,
  ): Promise<ObjectRow> {
    return this.insertVersion(tx, ctx, actor, correlationId, input, {
      objectId: newId(),
      version: 1,
      correctionOf: null,
      lifecycle: 'admitted',
    });
  }

  /** Non-destructive correction: new version linked via correction_of (ADR-0005, DADR-007). */
  async correctObject(
    tx: Tx,
    ctx: ScopeContext,
    actor: string,
    correlationId: string,
    objectId: string,
    expectedVersion: number,
    input: CreateObjectInput,
  ): Promise<ObjectRow> {
    const latest = (await tx
      .selectFrom('objects.canonical_objects')
      .select(['object_id', 'object_version', 'object_type'])
      .where('object_id', '=', objectId)
      .orderBy('object_version', 'desc')
      .limit(1)
      .executeTakeFirst()) as { object_id: string; object_version: string | number; object_type: string } | undefined;
    if (latest === undefined) throw bad('EYE_STA_001', correlationId, 'no authorized object version matches', 404);
    const latestVersion = Number(latest.object_version);
    if (latestVersion !== expectedVersion) {
      throw bad('EYE_STA_002', correlationId, `expected version ${expectedVersion}, authoritative is ${latestVersion}`, 409);
    }
    if (latest.object_type !== input.objectType) {
      throw bad('EYE_REQ_001', correlationId, 'object type cannot change across versions', 400);
    }
    return this.insertVersion(tx, ctx, actor, correlationId, input, {
      objectId,
      version: latestVersion + 1,
      correctionOf: `${objectId}@${latestVersion}`,
      lifecycle: 'corrected',
    });
  }

  /** Current view (latest version per object). */
  async getCurrent(tx: Tx, objectId: string, correlationId: string): Promise<ObjectRow> {
    const row = (await tx
      .selectFrom('objects.canonical_objects')
      .selectAll()
      .where('object_id', '=', objectId)
      .orderBy('object_version', 'desc')
      .limit(1)
      .executeTakeFirst()) as ObjectRow | undefined;
    if (row === undefined) throw bad('EYE_STA_001', correlationId, 'no authorized object version matches', 404);
    return row;
  }

  /**
   * As-of (known-at) retrieval — the state of knowledge at record time T,
   * without hindsight contamination (C-011): the latest version whose
   * recorded_at <= T; later corrections are invisible.
   */
  async getKnownAt(tx: Tx, objectId: string, knownAt: string, correlationId: string): Promise<ObjectRow> {
    const t = new Date(knownAt);
    if (Number.isNaN(t.getTime())) throw bad('EYE_TMP_001', correlationId, 'invalid known-at instant', 400);
    const row = (await tx
      .selectFrom('objects.canonical_objects')
      .selectAll()
      .where('object_id', '=', objectId)
      .where('recorded_at', '<=', t)
      .orderBy('object_version', 'desc')
      .limit(1)
      .executeTakeFirst()) as ObjectRow | undefined;
    if (row === undefined) {
      throw bad('EYE_STA_001', correlationId, 'object was not known at the requested instant', 404);
    }
    return row;
  }

  async listObjects(tx: Tx, objectType: string | null, limit: number): Promise<ObjectRow[]> {
    let q = tx
      .selectFrom('objects.canonical_objects')
      .selectAll()
      .orderBy('recorded_at', 'desc')
      .limit(Math.min(limit, 200));
    if (objectType !== null) q = q.where('object_type', '=', objectType);
    return (await q.execute()) as ObjectRow[];
  }

  async versionHistory(tx: Tx, objectId: string): Promise<ObjectRow[]> {
    return (await tx
      .selectFrom('objects.canonical_objects')
      .selectAll()
      .where('object_id', '=', objectId)
      .orderBy('object_version')
      .execute()) as ObjectRow[];
  }

  // ===== internals =====

  private async insertVersion(
    tx: Tx,
    ctx: ScopeContext,
    actor: string,
    correlationId: string,
    input: CreateObjectInput,
    v: { objectId: string; version: number; correctionOf: string | null; lifecycle: string },
  ): Promise<ObjectRow> {
    // Truth-state enum (ADR-P0-06) — canonical nine values only.
    if (!isTruthState(input.truthState)) {
      throw bad('EYE_STA_003', correlationId, `"${input.truthState}" is not a canonical truth state`, 422);
    }
    const truthState = input.truthState as TruthState;
    const syntheticState = input.syntheticState ?? (truthState === 'synthetic');
    if (truthState === 'synthetic' && !syntheticState) {
      throw bad('EYE_STA_003', correlationId, 'synthetic truth state requires synthetic_state marker', 422);
    }

    // Minimum provenance (acceptance criterion 7).
    const prov = {
      evidence_refs: input.evidenceRefs ?? [],
      source_object_ids: input.sourceObjectIds ?? [],
      method_ref: input.methodRef ?? null,
      human_refs: input.humanRefs ?? [],
    };
    if (!hasMinimumProvenance(prov)) {
      throw bad('EYE_PRV_001', correlationId, 'write rejected: no evidence/source/method/human provenance supplied');
    }

    // Temporal sanity (four-axis model).
    if (input.validTo != null && input.validFrom == null) {
      throw bad('EYE_TMP_001', correlationId, 'valid_to requires valid_from', 400);
    }

    // Payload schema from the registry.
    const schemaVersion = input.schemaVersion ?? 'v1';
    const reg = (await tx
      .selectFrom('objects.schema_registry')
      .select(['json_schema'])
      .where('object_type', '=', input.objectType)
      .where('schema_version', '=', schemaVersion)
      .executeTakeFirst()) as { json_schema: Record<string, unknown> } | undefined;
    if (reg === undefined) {
      throw bad('EYE_REQ_001', correlationId, `no registered schema ${input.objectType}@${schemaVersion}`, 400);
    }
    const validate = ajv.compile(reg.json_schema);
    if (!validate(input.payload)) {
      const detail = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');
      throw bad('EYE_REQ_001', correlationId, `payload schema violation: ${detail}`, 400);
    }

    const recordedAt = new Date();
    const header = {
      object_id: v.objectId,
      object_type: input.objectType,
      tenant_id: ctx.tenantId,
      domain_id: ctx.domainId,
      scope: ctx.scope,
      object_version: String(v.version),
      lifecycle_state: v.lifecycle,
      owning_component: 'CP-OBJ-01',
      accountable_owner: actor,
      truth_state: truthState,
      synthetic_state: syntheticState,
      recorded_at: recordedAt.toISOString(),
      correction_of: v.correctionOf,
    };
    const digest = contentDigest({ header, payload: input.payload });

    await tx
      .insertInto('objects.canonical_objects')
      .values({
        object_id: v.objectId,
        object_type: input.objectType,
        tenant_id: ctx.tenantId,
        domain_id: ctx.domainId,
        scope: ctx.scope,
        object_version: v.version,
        lifecycle_state: v.lifecycle,
        owning_component: 'CP-OBJ-01',
        accountable_owner: actor,
        source_object_ids: JSON.stringify(prov.source_object_ids),
        event_time: input.eventTime ?? null,
        observation_time: input.observationTime ?? null,
        valid_from: input.validFrom ?? null,
        valid_to: input.validTo ?? null,
        recorded_at: recordedAt,
        time_precision: input.timePrecision ?? 'exact',
        source_clock_quality: input.sourceClockQuality ?? 'trusted',
        truth_state: truthState,
        synthetic_state: syntheticState,
        confidence: null,
        uncertainty: null,
        evidence_refs: JSON.stringify(prov.evidence_refs),
        provenance_ref: null,
        method_ref: prov.method_ref,
        contradiction_refs: '[]',
        corroboration_refs: '[]',
        human_refs: JSON.stringify(prov.human_refs),
        classification: input.classification,
        purpose_scope: input.purposeScope,
        rights_profile: null,
        residency_profile: null,
        retention_profile: null,
        access_policy_ref: null,
        quality_profile: null,
        quality_state: null,
        freshness_state: null,
        schema_ref: `${input.objectType}@${schemaVersion}`,
        ontology_ref: null,
        correction_of: v.correctionOf,
        supersedes: v.correctionOf, // corrected version is superseded for current use
        withdrawal_reason: null,
        audit_correlation_id: correlationId,
        content_ref: null,
        payload: JSON.stringify(input.payload),
        content_digest: digest,
      })
      .execute();

    return (await tx
      .selectFrom('objects.canonical_objects')
      .selectAll()
      .where('object_id', '=', v.objectId)
      .where('object_version', '=', v.version)
      .executeTakeFirstOrThrow()) as ObjectRow;
  }
}
