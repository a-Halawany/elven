/**
 * REVIEW EVENTS — CP-6 B18 (0078, L2-I04): ReviewRequested@v1, built PURE and published from the transaction that
 * QUEUES a case (ES-19-001), at the three sites that do:
 *
 *   abstained                 the extraction's admitting write, when the model abstained — a case with no claim
 *                             attached (an abstention is an outcome, never absence);
 *   below_review_threshold /  the same write, one per admitted claim the method's own threshold or a contradiction
 *   contradiction             with an admitted assertion sends to review — the contradiction ids named;
 *   challenged                the challenge route (intelligence.review.request): a person's case on an admitted claim
 *                             version, the challenge in their words.
 *
 * `routed_to` says who decides it: the roles the policy names for intelligence.review.decide (platform_admin is the
 * platform's, not a queue) and the principal EXCLUDED — the agent that produced the output, refused by the port
 * (intelligence.decide_review) as the second boundary; null for a challenge (the run's agent is enforced at decision).
 * `method_flagged` is the vocabulary the queue knows (0023); no site queues it today. There is no consumer: the
 * accountable human reads the queue (0066's precedent). Lists are cut at LIFECYCLE_EVENT_LIST_MAX (D20).
 */
import { LIFECYCLE_EVENT_LIST_MAX, type OutboxRow } from '../../graph/subscriptions/change-events.js';

/** The reviewer roles the policy names for intelligence.review.decide (pdp.service.ts; platform_admin is the platform's, not a queue). */
export const REVIEW_ROUTED_TO_ROLES = ['domain_admin', 'extraction_manager'] as const;

export type QueuedReason = 'below_review_threshold' | 'abstained' | 'method_flagged' | 'contradiction' | 'challenged';

export function reviewRequestedEvent(a: {
  caseId: string; claimObjectId: string | null; claimVersion: number | null; claimType: string | null; runId: string; methodId: string;
  queuedReason: QueuedReason; confidence: number | null; challenge: string | null; contradictionIds: string[]; excludedPrincipal: string | null;
  evidenceObjectId: string | null; action: 'intelligence.claim.admit' | 'intelligence.review.request'; actor: string; occurredAt: string;
}): OutboxRow {
  return {
    eventType: 'ReviewRequested',
    payload: {
      schema: 'ReviewRequested', schema_version: 'v1',
      case_id: a.caseId,
      claim: a.claimObjectId === null ? null : { object_id: a.claimObjectId, version: a.claimVersion, type: a.claimType },
      run_id: a.runId, method_id: a.methodId, evidence_object_id: a.evidenceObjectId,
      queued_reason: a.queuedReason, confidence: a.confidence, challenge: a.challenge,
      contradictions: a.contradictionIds.slice(0, LIFECYCLE_EVENT_LIST_MAX),
      truncated: a.contradictionIds.length > LIFECYCLE_EVENT_LIST_MAX,
      routed_to: { roles: [...REVIEW_ROUTED_TO_ROLES], excluded_principal: a.excludedPrincipal, rule: 'the agent that produced the output may not decide it (intelligence.decide_review)' },
      decided_by: 'POST …/intelligence/review/:caseId/decide',
      temporal: { known_at: a.occurredAt },
      cause: { action: a.action, actor: a.actor, target_type: 'REV', target_id: a.caseId },
    },
  };
}
