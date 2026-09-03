/**
 * Correction and withdrawal intake — PHASE1_PLAN §10.2, acceptance A8.
 *
 * THE HONEST PART IS THE PROPAGATION SCOPE. A correction case lists the objects
 * it DIRECTLY resolved and states, in words, what it did not resolve:
 *
 *   "downstream consumers not yet present (KG/dependency graph arrives Phase 3)"
 *
 * Phase 1 has no dependency graph, so it cannot know what consumed an object. It
 * says so instead of implying a propagation it cannot perform. That sentence is
 * stored on every case, not rendered by the UI, so it survives into the record.
 *
 * NOTHING IS OVERWRITTEN. A correction admits a NEW canonical version linked by
 * correction_of; the prior version stays retrievable and known-at queries continue
 * to reproduce the pre-correction state. A withdrawal marks the object withdrawn
 * with a reason and likewise leaves the history intact.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AcquisitionWrites, ObservationReads } from '../observation.capabilities.js';

export const UNRESOLVED_PROPAGATION =
  'downstream consumers not yet present (KG/dependency graph arrives Phase 3)';

export type CorrectionKind = 'correction' | 'withdrawal' | 'supersession';

export interface CorrectionIntake {
  sourceId: string;
  kind: CorrectionKind;
  channel: string;
  publisherRef: string | null;
  reason: string;
  /** EVD object ids the submitter claims are affected. Verified, never trusted. */
  affectedEvdIds: string[];
}

export interface AffectedObject {
  object_id: string;
  object_version: number;
  object_type: string;
  source_id: string | null;
}

@Injectable()
export class CorrectionsService {
  /**
   * Open a case. The submitter's claim about which objects are affected is
   * VERIFIED against what this domain actually holds for this source — a
   * correction naming objects from another source, another domain, or objects
   * that do not exist is rejected. That is the spoofed-correction defence: a case
   * cannot reach into evidence it has no relationship to.
   */
  async open(
    cap: AcquisitionWrites,
    ctx: ScopeContext,
    correlationId: string,
    intake: CorrectionIntake,
  ): Promise<{ caseId: string; state: 'received' }> {
    const caseId = newId();
    await cap.openCorrectionCase({
      caseId,
      tenantId: ctx.tenantId as string,
      domainId: ctx.domainId as string,
      sourceId: intake.sourceId,
      kind: intake.kind,
      channel: intake.channel,
      publisherRef: intake.publisherRef,
      reason: intake.reason,
      eventId: newId(),
      correlationId,
    });
    return { caseId, state: 'received' };
  }

  /**
   * Resolve the claimed objects against what this domain holds. Returns only
   * objects that exist, belong to this source, and are the current version — and
   * reports the rest as rejected claims rather than silently dropping them.
   */
  async resolveAffected(
    cap: ObservationReads,
    sourceId: string,
    claimedEvdIds: string[],
  ): Promise<{ resolved: AffectedObject[]; rejected: Array<{ object_id: string; reason: string }> }> {
    const resolved: AffectedObject[] = [];
    const rejected: Array<{ object_id: string; reason: string }> = [];
    // A claim naming the same object twice is ONE claim. Left undeduplicated it
    // would try to supersede the same version twice in one operation, which the
    // canonical store correctly refuses — after the operation had already begun.
    const seen = new Set<string>();
    for (const id of claimedEvdIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const rows = (await cap
        .readCanonicalObjects()
        .selectAll()
        .where('object_id' as never, '=', id as never)
        .orderBy('object_version' as never, 'desc')
        .limit(1)
        .execute()) as Array<Record<string, unknown>>;
      const row = rows[0];
      if (row === undefined) {
        // The same message whether the object is absent or belongs to another
        // scope: a rejection must not become an existence oracle.
        rejected.push({ object_id: id, reason: 'no authorized object matches this identifier' });
        continue;
      }
      const provenance = String(row['provenance_ref'] ?? '');
      if (!provenance.startsWith(`SRC:${sourceId}@`)) {
        rejected.push({
          object_id: id,
          reason: 'the object is not evidence of the source this correction claims to come from',
        });
        continue;
      }
      resolved.push({
        object_id: String(row['object_id']),
        object_version: Number(row['object_version']),
        object_type: String(row['object_type']),
        source_id: sourceId,
      });
    }
    return { resolved, rejected };
  }

  /**
   * Apply a correction or withdrawal by admitting a NEW canonical version of each
   * affected object. The prior version is untouched and stays retrievable; a
   * known-at query for an instant before this commit still reproduces exactly what
   * an operator saw then.
   */
  async apply(
    cap: AcquisitionWrites,
    ctx: ScopeContext,
    actor: string,
    correlationId: string,
    caseId: string,
    kind: CorrectionKind,
    reason: string,
    affected: AffectedObject[],
    priorRows: Array<Record<string, unknown>>,
    purposeId: string,
    /**
     * Whether this call completes the case. A correction affecting more objects
     * than one capability may declare is applied as several governed operations;
     * the case is closed on the last of them, so it never claims an application
     * that has not finished.
     */
    closesCase = true,
    /** Supersessions already produced by earlier batches of the same apply. */
    alreadySuperseded: Array<{ object_id: string; from: number; to: number }> = [],
  ): Promise<{ caseId: string; state: 'applied'; superseded: Array<{ object_id: string; from: number; to: number }> }> {
    const superseded: Array<{ object_id: string; from: number; to: number }> = [];

    for (const a of affected) {
      const prior = priorRows.find((r) => String(r['object_id']) === a.object_id);
      if (prior === undefined) continue;
      const nextVersion = a.object_version + 1;
      const now = new Date().toISOString();

      const header: CanonicalHeader = {
        object_id: a.object_id,
        object_type: a.object_type,
        tenant_id: ctx.tenantId,
        domain_id: ctx.domainId,
        scope: 'DOMAIN',
        object_version: String(nextVersion),
        lifecycle_state: kind === 'withdrawal' ? 'withdrawn' : 'corrected',
        owning_component: 'CP-OBS-01',
        accountable_owner: actor,
        source_object_ids: asArray(prior['source_object_ids']),
        event_time: isoOrNull(prior['event_time']),
        observation_time: isoOrNull(prior['observation_time']),
        valid_from: isoOrNull(prior['valid_from']),
        valid_to: isoOrNull(prior['valid_to']),
        recorded_at: now,
        time_precision: String(prior['time_precision'] ?? 'exact'),
        source_clock_quality: (prior['source_clock_quality'] as CanonicalHeader['source_clock_quality']) ?? 'unknown',
        // A withdrawn object's truth state SAYS SO. Leaving it `observed` while
        // marking the lifecycle withdrawn would let a reader take it at face value.
        truth_state: kind === 'withdrawal' ? 'withdrawn' : 'observed',
        synthetic_state: Boolean(prior['synthetic_state']),
        confidence: null,
        uncertainty: null,
        evidence_refs: [...asArray(prior['evidence_refs']), `correction-case:${caseId}`],
        provenance_ref: (prior['provenance_ref'] as string | null) ?? null,
        method_ref: `correction-intake@1.0.0`,
        contradiction_refs: [],
        corroboration_refs: [],
        human_refs: [actor],
        classification: String(prior['classification']),
        purpose_scope: purposeId,
        rights_profile: (prior['rights_profile'] as string | null) ?? null,
        residency_profile: (prior['residency_profile'] as string | null) ?? null,
        retention_profile: (prior['retention_profile'] as string | null) ?? null,
        access_policy_ref: null,
        quality_profile: null,
        quality_state: null,
        freshness_state: null,
        schema_ref: String(prior['schema_ref']),
        ontology_ref: null,
        correction_of: `${a.object_id}@${a.object_version}`,
        supersedes: `${a.object_id}@${a.object_version}`,
        withdrawal_reason: kind === 'withdrawal' ? reason : null,
        audit_correlation_id: correlationId,
        content_ref: (prior['content_ref'] as string | null) ?? null,
      };
      const v = validateHeader(header);
      if (!v.ok) {
        throw new HttpException(
          errorBody('EYE_REQ_001', correlationId, `correction header invalid: ${(v.errors ?? []).join('; ')}`),
          422,
        );
      }
      const payload = prior['payload'] as Record<string, unknown>;
      await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));

      await cap.appendCustody({
        eventId: newId(),
        tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
        manifestId: null, obsObjectId: null, evdObjectId: a.object_id,
        sourceId: a.source_id as string, contractVersion: 1, runId: null,
        event: kind === 'withdrawal' ? 'custody.tombstoned' : 'custody.admitted',
        actor, agentPrincipalId: null, agentVersion: null, codeDigest: null,
        connector: null, connectorVersion: null, methodRef: 'correction-intake@1.0.0',
        contentDigest: null, digestVerified: null,
        details: { case_id: caseId, kind, from_version: a.object_version, to_version: nextVersion, reason },
        correlationId,
      });

      superseded.push({ object_id: a.object_id, from: a.object_version, to: nextVersion });
    }

    if (closesCase) {
      await cap.closeCorrectionCase({
        caseId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
        outcome: 'applied',
        affectedResolved: [...alreadySuperseded, ...superseded],
        failureReason: null,
        eventId: newId(), correlationId,
      });
    }

    return { caseId, state: 'applied', superseded };
  }

  async reject(
    cap: AcquisitionWrites, ctx: ScopeContext, correlationId: string,
    caseId: string, reason: string,
  ): Promise<{ caseId: string; state: 'rejected' }> {
    await cap.closeCorrectionCase({
      caseId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      outcome: 'rejected', affectedResolved: [], failureReason: reason,
      eventId: newId(), correlationId,
    });
    return { caseId, state: 'rejected' };
  }

  /**
   * A propagation attempt that FAILS is recorded as failed, not swallowed. Phase 1
   * has nothing downstream to propagate to, so this exists for the case where
   * applying the correction itself breaks partway.
   */
  async fail(
    cap: AcquisitionWrites, ctx: ScopeContext, correlationId: string,
    caseId: string, failureReason: string, partial: Array<Record<string, unknown>>,
  ): Promise<void> {
    await cap.closeCorrectionCase({
      caseId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      outcome: 'failed', affectedResolved: partial, failureReason,
      eventId: newId(), correlationId,
    });
  }

  async list(cap: ObservationReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readCorrections()
      .selectAll()
      .orderBy('received_at' as never, 'desc')
      .limit(Math.min(limit, 500))
      .execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: ObservationReads, caseId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap
      .readCorrections()
      .selectAll()
      .where('case_id' as never, '=', caseId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: ObservationReads, caseId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readCorrectionEvents()
      .selectAll()
      .where('case_id' as never, '=', caseId as never)
      .orderBy('occurred_at' as never)
      .execute()) as Array<Record<string, unknown>>;
  }
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { return JSON.parse(v) as string[]; } catch { return []; } }
  return [];
}

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  const d = new Date(v as string | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
