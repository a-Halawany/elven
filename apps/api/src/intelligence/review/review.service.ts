/**
 * THE REVIEW QUEUE (B2, B3).
 *
 * Low-confidence output and abstentions arrive here and CANNOT bypass it: the
 * extraction path queues them at admission time, in the same transaction that
 * admits the claim, so there is no window in which a claim exists un-queued.
 *
 * A correction admits a NEW VERSION of the claim. The prior version stays
 * retrievable and a known-at query reproduces the pre-correction state — the same
 * rule Phase 1 applies to corrected observations, for the same reason: a reviewer's
 * judgement is a record of what someone decided, not an edit that erases what the
 * machine said.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader,
  type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ReviewWrites, IntelligenceReads } from '../intelligence.capabilities.js';

export interface ReviewDecision {
  caseId: string;
  decision: 'approve' | 'correct' | 'reject';
  reason: string;
  /** Only for `correct`: the fields the reviewer is changing. */
  correctedValue?: { subject?: string; predicate?: string; object_value?: string; confidence?: number };
}

@Injectable()
export class ReviewService {
  /** The queue, worst-informed first: abstentions, then the least confident. */
  async queue(cap: IntelligenceReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readReviewCases().selectAll()
      .where('state' as never, '=', 'queued' as never)
      .orderBy('confidence' as never, 'asc')
      .orderBy('opened_at' as never, 'asc')
      .limit(Math.min(limit, 500))
      .execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: IntelligenceReads, caseId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap
      .readReviewCases().selectAll()
      .where('case_id' as never, '=', caseId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: IntelligenceReads, caseId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readReviewEvents().selectAll()
      .where('case_id' as never, '=', caseId as never)
      .orderBy('occurred_at' as never)
      .execute()) as Array<Record<string, unknown>>;
  }

  /**
   * Apply a decision.
   *
   * `approve` and `reject` record the judgement against the case. `correct`
   * additionally admits a NEW VERSION of the claim carrying the reviewer's values,
   * linked by `correction_of` — the prior version is untouched.
   */
  async decide(
    cap: ReviewWrites,
    ctx: ScopeContext,
    a: {
      caseId: string; decision: ReviewDecision; decider: string; correlationId: string;
      purposeId: string;
      /** The current claim row, resolved in a prior governed read. */
      claim: Record<string, unknown> | null;
      lineage: Record<string, unknown> | null;
    },
  ): Promise<{ caseId: string; state: string; newVersion: number | null }> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const state = a.decision.decision === 'approve' ? 'approved'
      : a.decision.decision === 'correct' ? 'corrected' : 'rejected';

    let newVersion: number | null = null;

    if (a.decision.decision === 'correct') {
      if (a.claim === null || a.lineage === null) {
        throw new HttpException(
          errorBody('EYE_STA_001', a.correlationId,
            'a correction needs the claim it corrects; none was resolved for this case'), 404);
      }
      const prior = a.claim;
      const priorVersion = Number(prior['object_version']);
      newVersion = priorVersion + 1;
      const objectId = String(prior['object_id']);
      const objectType = String(prior['object_type']);
      const priorPayload = prior['payload'] as Record<string, unknown>;
      const cv = a.decision.correctedValue ?? {};
      const now = new Date().toISOString();

      const payload = {
        ...priorPayload,
        ...(cv.subject === undefined ? {} : { subject: cv.subject }),
        ...(cv.predicate === undefined ? {} : { predicate: cv.predicate }),
        ...(cv.object_value === undefined ? {} : { object_value: cv.object_value }),
        ...(cv.confidence === undefined ? {} : { confidence: cv.confidence }),
        review: {
          state: 'corrected',
          reason: a.decision.reason,
          decider: a.decider,
        },
      };

      const header: CanonicalHeader = {
        object_id: objectId,
        object_type: objectType,
        tenant_id: ctx.tenantId,
        domain_id: ctx.domainId,
        scope: 'DOMAIN',
        object_version: String(newVersion),
        lifecycle_state: 'corrected',
        owning_component: 'CP-INT-01',
        accountable_owner: a.decider,
        source_object_ids: asArray(prior['source_object_ids']),
        event_time: isoOrNull(prior['event_time']),
        observation_time: isoOrNull(prior['observation_time']),
        valid_from: null,
        valid_to: null,
        recorded_at: now,
        time_precision: String(prior['time_precision'] ?? 'exact'),
        source_clock_quality:
          (prior['source_clock_quality'] as CanonicalHeader['source_clock_quality']) ?? 'unknown',
        // A human-reviewed claim is asserted, not derived: a person now stands
        // behind it. The truth state moves, and it says who moved it.
        truth_state: 'asserted',
        synthetic_state: Boolean(prior['synthetic_state']),
        confidence: cv.confidence === undefined
          ? ((prior['confidence'] as Record<string, unknown> | null) ?? null)
          : { method: 'human-review', scale: 'unit_interval',
              value: cv.confidence, calibration_ref: null },
        uncertainty: null,
        evidence_refs: [...asArray(prior['evidence_refs']), `review-case:${a.caseId}`],
        provenance_ref: (prior['provenance_ref'] as string | null) ?? null,
        method_ref: 'human-review@1.0.0',
        contradiction_refs: [],
        corroboration_refs: [],
        human_refs: [a.decider],
        classification: String(prior['classification']),
        purpose_scope: a.purposeId,
        rights_profile: null,
        residency_profile: null,
        retention_profile: null,
        access_policy_ref: null,
        quality_profile: null,
        quality_state: null,
        freshness_state: null,
        schema_ref: String(prior['schema_ref']),
        ontology_ref: null,
        correction_of: `${objectId}@${priorVersion}`,
        supersedes: `${objectId}@${priorVersion}`,
        withdrawal_reason: null,
        audit_correlation_id: a.correlationId,
        content_ref: null,
      };
      const v = validateHeader(header);
      if (!v.ok) {
        throw new HttpException(
          errorBody('EYE_REQ_001', a.correlationId,
            `corrected claim header invalid: ${(v.errors ?? []).join('; ')}`), 422);
      }
      await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
      // The corrected version keeps a lineage row of its own, so a reader can see
      // that this version came from a person and which evidence it still rests on.
      await cap.recordLineage({
        claimId: objectId, version: newVersion, tenantId, domainId, claimType: objectType,
        runId: String(a.lineage['run_id']), methodId: String(a.lineage['method_id']),
        callId: null, mode: String(a.lineage['mode']),
        evidenceObjectId: String(a.lineage['evidence_object_id']),
        evidenceDigest: String(a.lineage['evidence_digest']),
        byteStart: Number(a.lineage['byte_start']), byteEnd: Number(a.lineage['byte_end']),
        confidence: cv.confidence ?? Number(a.lineage['confidence']),
        // A correction re-reads nothing: it inherits the retrieval decision that
        // authorised reading the evidence this claim already rests on, rather than
        // inventing one. The correction's OWN decision is the admitting operation's,
        // which the port takes from the context.
        retrievalDecisionId: String(a.lineage['retrieval_decision_id']),
        retrievalAuditSeq: Number(a.lineage['retrieval_audit_seq']),
        correlationId: a.correlationId,
      });
    }

    await cap.decideReview({
      caseId: a.caseId, tenantId, domainId, state, decider: a.decider,
      reason: a.decision.reason, supersededTo: newVersion,
      eventId: newId(), correlationId: a.correlationId,
    });

    return { caseId: a.caseId, state, newVersion };
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
