/**
 * THE EXTRACTION ORCHESTRATOR — governed reads, declared writes, real budgets.
 *
 * The shape mirrors Phase 1's collection orchestrator, and for the same reasons:
 * everything the operation will write is resolved in a PRIOR governed read and
 * declared before the capability is minted, budgets stop the run rather than being
 * advisory, and the run's own record is what says what happened — never a variable
 * the handler set on the way past.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { EvidenceService } from '../../observation/vault/evidence.service.js';
import { ObservationCapability, type AcquisitionWrites }
  from '../../observation/observation.capabilities.js';
import { IntelligenceCapability, type ExtractionWrites, type IntelligenceReads,
  type MethodPin } from '../intelligence.capabilities.js';
import { ExtractionService, inheritedControlsOf, type EvidenceUnit,
  type ExtractionOutcome, type RetrievalReceipt } from './extraction.service.js';

/** The declared-target bound the capability permits for one operation. */
const MAX_CLAIMS_PER_EVIDENCE = 8;

@Injectable()
export class ExtractionOrchestrator {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly extraction: ExtractionService,
    private readonly evidence: EvidenceService,
  ) {}

  /** A governed read under the intelligence read action. */
  private async read<T>(
    a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string;
         correlationId: string; purposeId: string },
    objectType: string | null, objectId: string | null,
    fn: (cap: IntelligenceReads) => Promise<T>,
  ): Promise<T> {
    const out = await this.pipeline.consequentialRead<T, IntelligenceReads>(
      this.envelope(a, 'intelligence.read', objectType ?? 'CLM', objectId),
      a.principal,
      { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'intelligence.read', objectType, objectId },
      IntelligenceCapability.read,
      async (cap) => fn(cap));
    return out.result;
  }

  private envelope(
    a: { tenantId: string; domainId: string; correlationId: string; purposeId: string;
         principal: AuthenticatedPrincipal },
    action: string, objectType: string, objectId: string | null,
  ): Envelope {
    return {
      message_id: newId(),
      scope: 'DOMAIN',
      tenant_id: a.tenantId,
      domain_id: a.domainId,
      principal_id: `principal:${a.principal.principalId}`,
      purpose_id: a.purposeId,
      action,
      side_effect_class: 'reversible',
      consequence_class: 'C2',
      object_type: objectType,
      object_id: objectId,
      schema_version: 'v1',
      issued_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: a.correlationId,
      trace_id: 'intelligence',
    } as unknown as Envelope;
  }

  /**
   * Run one extraction method over the evidence it is scoped to.
   *
   * The evidence is resolved FIRST, in its own governed read, and the bytes are
   * fetched from the vault OUTSIDE any database transaction — the Phase 1 rule
   * that no external I/O happens inside a transaction applies unchanged to reading
   * the vault.
   */
  async run(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; methodId: string;
    limit: number; newAttempt: boolean;
  }): Promise<ExtractionOutcome> {
    const correlationId = a.envelope.correlation_id;
    const purposeId = a.envelope.purpose_id ?? 'intelligence';
    const read = { principal: a.principal, tenantId: a.tenantId, domainId: a.domainId,
                   correlationId, purposeId };

    const method = await this.read(read, 'MTH', a.methodId, async (cap) =>
      (await cap.readMethods().selectAll()
        .where('method_id' as never, '=', a.methodId as never)
        .executeTakeFirst()) as Record<string, unknown> | undefined);
    if (method === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'no authorized extraction method matches'), 404);
    }
    if (String(method['lifecycle_state']) !== 'active') {
      throw new HttpException(
        errorBody('EYE_STA_002', correlationId,
          `extraction refused: the method is ${String(method['lifecycle_state'])}, not active`), 409);
    }

    // The evidence this method reads: EVD objects for its source (or the whole
    // domain when the method declares none), current versions only.
    const sourceId = method['source_id'] === null ? null : String(method['source_id']);
    const evidence = await this.read(read, 'EVD', null, async (cap) => {
      const rows = (await cap.readCanonicalObjects()
        .selectAll()
        .where('object_type' as never, '=', 'EVD' as never)
        .orderBy('recorded_at' as never, 'desc')
        .limit(400)
        .execute()) as Array<Record<string, unknown>>;
      const current = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const id = String(r['object_id']);
        const prev = current.get(id);
        if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
          current.set(id, r);
        }
      }
      return [...current.values()].filter((r) => {
        if (sourceId === null) return true;
        return String(r['provenance_ref'] ?? '').startsWith(`SRC:${sourceId}@`);
      }).slice(0, a.limit);
    });

    const runId = newId();
    const pinRow = method;
    const mode = String(pinRow['gateway_mode']) as 'replay' | 'local-live';

    // Start the run in its own governed operation, so a run that then fails is
    // still a run that is recorded as having started.
    await this.pipeline.write<void, ExtractionWrites>(
      this.envelope({ ...read, principal: a.principal }, 'intelligence.run.start', 'RUN', runId),
      a.principal,
      { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'intelligence.run.start', objectType: 'RUN', objectId: runId },
      IntelligenceCapability.extraction,
      async (cap) => {
        await cap.startRun({
          runId, tenantId: a.tenantId, domainId: a.domainId, methodId: a.methodId,
          methodVersion: Number(pinRow['method_version']), agent: a.principal.principalId,
          mode, eventId: newId(), correlationId,
        });
        return { result: undefined, targetType: 'RUN', targetId: runId, targetVersion: '1',
                 outboxEvent: null };
      });

    const budgetCalls = Number(pinRow['budget_calls']);
    const budgetSeconds = Number(pinRow['budget_seconds']);
    const deadline = Date.now() + budgetSeconds * 1000;

    let evidenceRead = 0; let claimsAdmitted = 0; let abstentions = 0;
    let idempotentHits = 0; let callsUsed = 0; let queuedForReview = 0;
    let state: ExtractionOutcome['state'] = 'completed';
    let failure: string | null = null;
    const claims: ExtractionOutcome['claims'] = [];
    const evidenceRetrievals: RetrievalReceipt[] = [];
    const undeclaredRefusals: ExtractionOutcome['undeclaredRefusals'] = [];

    for (const evd of evidence) {
      // BUDGETS STOP THE RUN. They are not advisory and they are not checked after
      // the fact: the run ends here, records why, and escalates by leaving a
      // budget_exceeded event behind.
      if (callsUsed >= budgetCalls) { state = 'budget_exceeded'; failure = `call budget of ${budgetCalls} reached`; break; }
      if (Date.now() > deadline) { state = 'budget_exceeded'; failure = `time budget of ${budgetSeconds}s reached`; break; }

      const payload = evd['payload'] as Record<string, unknown>;
      const evdObjectId = String(evd['object_id']);
      const digest = String(payload['content_digest'] ?? '');
      if (digest === '') continue;

      /*
       * READ AND WRITE ARE TWO DECISIONS.
       *
       * Reading the original bytes is `observation.evidence.retrieve` — Phase 1's
       * own consequential read, with its own policy decision, its own audit entry
       * and its own custody record. `intelligence.claim.admit` authorises WRITING
       * a claim and must not be allowed to stand in for reading evidence.
       *
       * There is no second vault path here: this calls Phase 1's EvidenceService,
       * which resolves through the manifest only, re-verifies the digest, refuses
       * a withdrawn or tombstoned object, and writes the custody entry — now
       * carrying the purpose, method and run that read it.
       */
      let bytes: Buffer;
      let retrievalDecisionId: string;
      let retrievalAuditSeq: number;
      try {
        const got = await this.pipeline.write<
          { base64: string; contentDigest: string }, AcquisitionWrites>(
          this.envelope({ ...read, principal: a.principal },
            'observation.evidence.retrieve', 'EVD', evdObjectId),
          a.principal,
          { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
            action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdObjectId },
          ObservationCapability.acquisition,
          async (cap, scope) => {
            const r = await this.evidence.retrieve(
              cap, scope, `agent:${a.principal.principalId}`, evdObjectId, correlationId,
              {
                read_for: 'intelligence.extraction',
                purpose: purposeId,
                method_id: a.methodId,
                method_key: String(pinRow['method_key']),
                run_id: runId,
                mode,
              });
            return { result: { base64: r.base64, contentDigest: r.contentDigest },
                     targetType: 'EVD', targetId: evdObjectId, targetVersion: '1',
                     outboxEvent: null };
          });
        bytes = Buffer.from(got.result.base64, 'base64');
        retrievalDecisionId = got.policyDecisionId;
        retrievalAuditSeq = got.auditSeq;
        evidenceRetrievals.push({
          evidenceObjectId: evdObjectId,
          policyDecisionId: got.policyDecisionId,
          auditSeq: got.auditSeq,
        });
      } catch {
        // A refused, withdrawn, tombstoned or damaged object is not this run's to
        // repair. It is already recorded — by the refusal, or by the integrity
        // failure Phase 1 writes into custody before it answers.
        continue;
      }
      evidenceRead += 1;

      const declaredClaimIds = Array.from({ length: MAX_CLAIMS_PER_EVIDENCE }, () => newId());
      const unit: EvidenceUnit = {
        evdObjectId,
        obsObjectId: payload['obs_object_id'] === null || payload['obs_object_id'] === undefined
          ? null : String(payload['obs_object_id']),
        contentDigest: digest,
        bytes,
        sourceId: sourceId ?? String(evd['provenance_ref'] ?? '').replace(/^SRC:/, '').split('@')[0] ?? '',
        sourceKey: String(pinRow['method_key']),
        eventTime: evd['event_time'] === null || evd['event_time'] === undefined
          ? null : new Date(evd['event_time'] as string).toISOString(),
        itemKey: String(payload['locator']),
        // ES-29-002: the evidence object's own control block, carried onto every
        // claim derived from it. Read from the row, never defaulted here.
        inherited: inheritedControlsOf(evd),
      };

      const route: RouteInfo = {
        scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'intelligence.claim.admit', objectType: 'CLM',
        objectId: declaredClaimIds[0] ?? null,
        writableTargets: declaredClaimIds,
      };
      const pin: MethodPin = {
        method_key: String(pinRow['method_key']), method_version: Number(pinRow['method_version']),
        gateway_mode: mode, model_id: String(pinRow['model_id']),
        model_weights_digest: String(pinRow['model_weights_digest']),
        runtime_version: String(pinRow['runtime_version']),
        prompt_ref: String(pinRow['prompt_ref']), prompt_version: String(pinRow['prompt_version']),
        prompt_text: String(pinRow['prompt_text']), prompt_digest: String(pinRow['prompt_digest']),
        decoding_digest: String(pinRow['decoding_digest']),
        decoding_config: (pinRow['decoding_config'] ?? {}) as Record<string, unknown>,
        confidence_floor: String(pinRow['confidence_floor']),
        review_below: String(pinRow['review_below']),
        budget_calls: budgetCalls, budget_seconds: budgetSeconds,
        target_types: pinRow['target_types'] as string[],
        source_id: sourceId,
      };

      try {
        const out = await this.pipeline.write<{
          admitted: Array<{ objectId: string; type: string; confidence: number; review: string }>;
          abstained: boolean; idempotent: boolean; calls: number; queued: number;
          undeclared: Array<{ kind: string; objectType: string }>;
        }, ExtractionWrites>(
          this.envelope({ ...read, principal: a.principal }, 'intelligence.claim.admit',
            'CLM', declaredClaimIds[0] as string),
          a.principal, route,
          IntelligenceCapability.extraction,
          async (cap, scope) => {
            // The method is locked FOR SHARE inside the admitting transaction, so
            // it cannot be suspended between the check and the write.
            await cap.lockActiveMethod({
              methodId: a.methodId, tenantId: a.tenantId, domainId: a.domainId });
            const r = await this.extraction.extractOne(cap, scope, {
              pin, methodId: a.methodId, runId, agentPrincipalId: a.principal.principalId,
              unit, correlationId, purposeId, newAttempt: a.newAttempt, declaredClaimIds,
              // The read's own decision travels with the write, so the claim can
              // record BOTH and a reader can see which authorised which.
              retrievalDecisionId, retrievalAuditSeq,
            });
            return { result: r, targetType: 'CLM',
                     targetId: declaredClaimIds[0] as string, targetVersion: '1',
                     outboxEvent: r.admitted.length === 0 ? null : {
                       eventType: 'ClaimsExtracted',
                       payload: { run_id: runId, method_id: a.methodId, mode,
                                  claims: r.admitted.map((x) => x.objectId) },
                     } };
          });
        claimsAdmitted += out.result.admitted.length;
        // Each admitted claim carries the decision that ADMITTED it, which is this
        // write's own — distinct from the retrieval decision above.
        claims.push(...out.result.admitted.map((c) => ({
          ...c, admissionDecisionId: out.policyDecisionId, admissionAuditSeq: out.auditSeq,
        })));
        if (out.result.abstained) abstentions += 1;
        if (out.result.idempotent) idempotentHits += 1;
        callsUsed += out.result.calls;
        queuedForReview += out.result.queued;
        for (const u of out.result.undeclared) {
          undeclaredRefusals.push({ evidenceObjectId: evdObjectId, ...u });
        }
      } catch (e) {
        state = 'failed';
        failure = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
        break;
      }
    }

    await this.pipeline.write<void, ExtractionWrites>(
      this.envelope({ ...read, principal: a.principal }, 'intelligence.run.finish', 'RUN', runId),
      a.principal,
      { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'intelligence.run.finish', objectType: 'RUN', objectId: runId },
      IntelligenceCapability.extraction,
      async (cap) => {
        await cap.finishRun({
          runId, tenantId: a.tenantId, domainId: a.domainId, state, failure,
          evidenceRead, claims: claimsAdmitted, abstentions, idempotent: idempotentHits,
          calls: callsUsed, actor: a.principal.principalId, mode,
          eventId: newId(), correlationId,
        });
        return { result: undefined, targetType: 'RUN', targetId: runId, targetVersion: '1',
                 outboxEvent: null };
      });

    return { runId, mode, state, evidenceRead, claimsAdmitted, abstentions,
             idempotentHits, callsUsed, queuedForReview, failure, claims, evidenceRetrievals,
             undeclaredRefusals };
  }
}
