/**
 * EXTRACTION — evidence bytes in, governed claims out.
 *
 * The shape follows Phase 1's acquisition lifecycle deliberately: the method is
 * locked FOR SHARE inside the admitting transaction, the identity of the work is
 * computed before anything irreversible happens, budgets stop the run rather than
 * being advisory, and the objects a governed operation may write are declared
 * before its capability is minted.
 *
 * What is new is the honesty burden. A claim is a statement ABOUT the world rather
 * than a record that bytes arrived, so every claim carries the method, the model,
 * the weights digest, the runtime, the prompt version, the decoding configuration,
 * the MODE it ran in, and the exact byte span it was derived from. A claim that
 * cannot say all of that is refused at the schema boundary before any port sees it.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalHeaderDigest, errorBody, validateHeader, jcsCanonicalize,
  type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ExtractionWrites, MethodPin } from '../intelligence.capabilities.js';
import { ModelGatewayService, extractionIdentityOf, type ExtractedClaim,
  type GatewayRequest } from '../gateway/model-gateway.service.js';

const sha256 = (s: string | Buffer): string =>
  createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : s).digest('hex');

/** The five claim types, and the canonical object type each maps to. */
const KIND_TO_TYPE: Readonly<Record<ExtractedClaim['claim_kind'], string>> = Object.freeze({
  entity: 'ENT', event: 'EVT', claim: 'CLM', relationship: 'REL', assessment: 'ASM',
});

export interface EvidenceUnit {
  evdObjectId: string;
  obsObjectId: string | null;
  contentDigest: string;
  bytes: Buffer;
  sourceId: string;
  sourceKey: string;
  eventTime: string | null;
  itemKey: string;
}

export interface ExtractionOutcome {
  runId: string;
  mode: 'replay' | 'local-live';
  state: 'completed' | 'budget_exceeded' | 'failed';
  evidenceRead: number;
  claimsAdmitted: number;
  abstentions: number;
  idempotentHits: number;
  callsUsed: number;
  queuedForReview: number;
  failure: string | null;
  claims: Array<{ objectId: string; type: string; confidence: number; review: string }>;
}

@Injectable()
export class ExtractionService {
  constructor(private readonly gateway: ModelGatewayService) {}

  /**
   * ONE evidence unit, inside ONE governed operation.
   *
   * The claim ids are generated BEFORE the capability is minted so the operation
   * can declare exactly what it will write — a claim id invented inside the handler
   * could not have been declared, and the database refuses it. That is what makes
   * the write bound rather than merely intended.
   */
  async extractOne(
    cap: ExtractionWrites,
    ctx: ScopeContext,
    a: {
      pin: MethodPin; methodId: string; runId: string; agentPrincipalId: string;
      unit: EvidenceUnit; correlationId: string; purposeId: string;
      newAttempt: boolean; declaredClaimIds: string[];
    },
  ): Promise<{
    admitted: Array<{ objectId: string; type: string; confidence: number; review: string }>;
    abstained: boolean; idempotent: boolean; calls: number; queued: number;
  }> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const identity = extractionIdentityOf({
      evidenceDigest: a.unit.contentDigest,
      methodId: a.methodId,
      modelId: a.pin.model_id,
      weightsDigest: a.pin.model_weights_digest,
      promptDigest: a.pin.prompt_digest,
      decodingDigest: a.pin.decoding_digest,
    });

    // B5: the database decides. A repeat of the same identity returns what was
    // recorded and the model is NOT called again.
    const claimed = await cap.claimExtraction({
      tenantId, domainId, identity, newAttempt: a.newAttempt,
    });
    if (claimed.decision === 'idempotent') {
      return { admitted: [], abstained: claimed.prior_outcome === 'abstained',
               idempotent: true, calls: 0, queued: 0 };
    }

    const excerpt = a.unit.bytes.toString('utf8').slice(0, 8_000);
    const req: GatewayRequest = {
      promptRef: a.pin.prompt_ref,
      promptVersion: a.pin.prompt_version,
      promptDigest: a.pin.prompt_digest,
      modelId: a.pin.model_id,
      weightsDigest: a.pin.model_weights_digest,
      runtimeVersion: a.pin.runtime_version,
      decodingDigest: a.pin.decoding_digest,
      input: {
        instruction: a.pin.prompt_ref,
        target_types: a.pin.target_types,
        source_key: a.unit.sourceKey,
        item_key: a.unit.itemKey,
        evidence_digest: a.unit.contentDigest,
        evidence: excerpt,
      },
    };

    const result = await this.gateway.call(cap, { tenantId, domainId, correlationId: a.correlationId },
      { pin: a.pin, runId: a.runId, methodId: a.methodId, req });

    const attemptId = newId();

    // ABSTENTION IS AN OUTCOME. It reaches the review queue as an abstention with
    // no claim attached — never as absence, never as a zero-confidence claim.
    if (result.outcome === 'abstained' || result.outcome === 'refused' || result.outcome === 'failed') {
      await cap.recordAttempt({
        attemptId, tenantId, domainId, identity, ordinal: claimed.attempt_ordinal,
        runId: a.runId, methodId: a.methodId, evidenceObjectId: a.unit.evdObjectId,
        evidenceDigest: a.unit.contentDigest, mode: result.mode, callId: result.callId,
        resultDigest: result.responseDigest, claimIds: [],
        outcome: result.outcome === 'abstained' ? 'abstained' : 'failed',
        correlationId: a.correlationId,
      });
      if (result.outcome === 'abstained') {
        await cap.queueReview({
          caseId: newId(), tenantId, domainId, claimId: null, version: null,
          runId: a.runId, methodId: a.methodId, reason: 'abstained', confidence: null,
          actor: a.agentPrincipalId, eventId: newId(), correlationId: a.correlationId,
        });
        return { admitted: [], abstained: true, idempotent: false, calls: 1, queued: 1 };
      }
      return { admitted: [], abstained: false, idempotent: false, calls: 1, queued: 0 };
    }

    const floor = Number(a.pin.confidence_floor);
    const reviewBelow = Number(a.pin.review_below);
    const admitted: Array<{ objectId: string; type: string; confidence: number; review: string }> = [];
    const admittedIds: string[] = [];
    let queued = 0;

    for (let i = 0; i < result.claims.length; i += 1) {
      const c = result.claims[i] as ExtractedClaim;
      const objectId = a.declaredClaimIds[i];
      if (objectId === undefined) break;          // never write beyond the declared set
      // Below the floor the model's own output is not admitted at all: a claim the
      // method itself calls unusable is not made into a governed statement.
      if (c.confidence < floor) { continue; }

      const objectType = KIND_TO_TYPE[c.claim_kind];
      const needsReview = c.confidence < reviewBelow;
      const now = new Date().toISOString();
      const payload = {
        claim_kind: c.claim_kind,
        subject: c.subject,
        predicate: c.predicate,
        object_value: c.object_value,
        ...(c.qualifiers === undefined ? {} : { qualifiers: c.qualifiers }),
        confidence: c.confidence,
        lineage: {
          method_key: a.pin.method_key,
          method_id: a.methodId,
          model_id: a.pin.model_id,
          model_weights_digest: a.pin.model_weights_digest,
          runtime_version: a.pin.runtime_version,
          prompt_version: a.pin.prompt_version,
          decoding_digest: a.pin.decoding_digest,
          mode: result.mode,
          call_id: result.callId,
          run_id: a.runId,
          evidence_object_id: a.unit.evdObjectId,
          evidence_digest: a.unit.contentDigest,
          byte_start: c.byte_start,
          byte_end: c.byte_end,
          extraction_identity: identity,
        },
        review: {
          state: needsReview ? 'queued' : 'not_required',
          reason: needsReview ? 'confidence below the method review threshold' : null,
          decider: null,
        },
      };

      const header: CanonicalHeader = {
        object_id: objectId,
        object_type: objectType,
        tenant_id: ctx.tenantId,
        domain_id: ctx.domainId,
        scope: 'DOMAIN',
        object_version: '1',
        lifecycle_state: 'active',
        owning_component: 'CP-INT-01',
        accountable_owner: `agent:${a.agentPrincipalId}`,
        source_object_ids: [a.unit.evdObjectId, ...(a.unit.obsObjectId === null ? [] : [a.unit.obsObjectId])],
        // A claim inherits the PUBLISHER'S time from the evidence it read. It does
        // not invent one, and it does not claim the extraction instant is when the
        // thing happened.
        event_time: a.unit.eventTime,
        observation_time: now,
        valid_from: null,
        valid_to: null,
        recorded_at: now,
        time_precision: 'exact',
        source_clock_quality: 'unknown',
        // An extracted claim is EXTRACTED, never observed. The truth state says so,
        // using the constitutional value rather than a word of our own.
        truth_state: 'extracted',
        synthetic_state: false,
        // The header's confidence is a STRUCTURED claim about how the number was
        // arrived at, not a bare number: method, scale and value travel together.
        confidence: { method: a.pin.method_key, scale: 'unit_interval',
                      value: c.confidence, calibration_ref: null },
        uncertainty: null,
        evidence_refs: [`EVD:${a.unit.evdObjectId}`, `call:${result.callId}`],
        provenance_ref: `SRC:${a.unit.sourceId}@extraction:${a.pin.method_key}`,
        method_ref: `${a.pin.method_key}@${a.pin.prompt_version}/${a.pin.model_id}#${a.pin.gateway_mode}`,
        contradiction_refs: [],
        corroboration_refs: [],
        human_refs: [],
        classification: 'internal',
        purpose_scope: a.purposeId,
        rights_profile: null,
        residency_profile: null,
        retention_profile: null,
        access_policy_ref: null,
        quality_profile: null,
        quality_state: null,
        freshness_state: null,
        // CLM@v1 is Phase 0's generic claim schema and is not ours; the Phase 2
        // claim schema is CLM@v2. The four types Phase 2 introduces take v1.
        schema_ref: `${objectType}@${objectType === 'CLM' ? 'v2' : 'v1'}`,
        ontology_ref: null,
        correction_of: null,
        supersedes: null,
        withdrawal_reason: null,
        audit_correlation_id: a.correlationId,
        content_ref: null,
      };
      const v = validateHeader(header);
      if (!v.ok) {
        throw new HttpException(
          errorBody('EYE_REQ_001', a.correlationId,
            `claim header invalid: ${(v.errors ?? []).join('; ')}`), 422);
      }
      await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
      await cap.recordLineage({
        claimId: objectId, version: 1, tenantId, domainId, claimType: objectType,
        runId: a.runId, methodId: a.methodId, callId: result.callId, mode: result.mode,
        evidenceObjectId: a.unit.evdObjectId, evidenceDigest: a.unit.contentDigest,
        byteStart: c.byte_start, byteEnd: c.byte_end, confidence: c.confidence,
        correlationId: a.correlationId,
      });
      if (needsReview) {
        await cap.queueReview({
          caseId: newId(), tenantId, domainId, claimId: objectId, version: 1,
          runId: a.runId, methodId: a.methodId, reason: 'below_review_threshold',
          confidence: c.confidence, actor: a.agentPrincipalId, eventId: newId(),
          correlationId: a.correlationId,
        });
        queued += 1;
      }
      admittedIds.push(objectId);
      admitted.push({ objectId, type: objectType, confidence: c.confidence,
                      review: needsReview ? 'queued' : 'not_required' });
    }

    await cap.recordAttempt({
      attemptId, tenantId, domainId, identity, ordinal: claimed.attempt_ordinal,
      runId: a.runId, methodId: a.methodId, evidenceObjectId: a.unit.evdObjectId,
      evidenceDigest: a.unit.contentDigest, mode: result.mode, callId: result.callId,
      resultDigest: result.responseDigest,
      claimIds: admittedIds, outcome: 'admitted', correlationId: a.correlationId,
    });

    return { admitted, abstained: false, idempotent: false, calls: 1, queued };
  }

  /** The canonical digest of a result set, used for the attempt record. */
  static resultDigest(claims: ExtractedClaim[]): string {
    return sha256(jcsCanonicalize(claims));
  }
}
