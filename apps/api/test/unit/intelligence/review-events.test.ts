/**
 * ReviewRequested@v1 at the function boundary (CP-6 B18; design §2.6, D14, D20): the five queued reasons the queue knows,
 * the claim block (null for an abstention; id, version and type otherwise), the contradictions named, `routed_to` — the
 * decide roles the policy names with the producing agent excluded (null for a challenge) — and the cause per site. No database.
 */
import { describe, expect, it } from 'vitest';
import { REVIEW_ROUTED_TO_ROLES, reviewRequestedEvent, type QueuedReason } from '../../../src/intelligence/review/review-events.js';

let counter = 0;
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const CASE = uid(); const CLAIM = uid(); const RUN = uid(); const METHOD = uid(); const AGENT = uid(); const EVD = uid(); const PERSON = uid(); const CTR = uid();
const AT = '2026-09-17T10:00:00.000Z';

describe('B18 · reviewRequestedEvent', () => {
  it('the roles are the policy\'s two decide roles (platform_admin is the platform\'s, not a queue)', () => {
    expect([...REVIEW_ROUTED_TO_ROLES]).toEqual(['domain_admin', 'extraction_manager']);
  });
  it('a below-threshold claim from the extraction: the claim by id, version and type; the producing agent excluded; the cause on the case', () => {
    const row = reviewRequestedEvent({
      caseId: CASE, claimObjectId: CLAIM, claimVersion: 1, claimType: 'CLM', runId: RUN, methodId: METHOD, queuedReason: 'below_review_threshold', confidence: 0.61,
      challenge: null, contradictionIds: [], excludedPrincipal: AGENT, evidenceObjectId: EVD, action: 'intelligence.claim.admit', actor: AGENT, occurredAt: AT,
    });
    expect(row.eventType).toBe('ReviewRequested');
    expect(row.payload).toEqual({
      schema: 'ReviewRequested', schema_version: 'v1',
      case_id: CASE, claim: { object_id: CLAIM, version: 1, type: 'CLM' }, run_id: RUN, method_id: METHOD, evidence_object_id: EVD,
      queued_reason: 'below_review_threshold', confidence: 0.61, challenge: null, contradictions: [], truncated: false,
      routed_to: { roles: ['domain_admin', 'extraction_manager'], excluded_principal: AGENT, rule: 'the agent that produced the output may not decide it (intelligence.decide_review)' },
      decided_by: 'POST …/intelligence/review/:caseId/decide',
      temporal: { known_at: AT },
      cause: { action: 'intelligence.claim.admit', actor: AGENT, target_type: 'REV', target_id: CASE },
    });
  });
  it('an abstention: no claim attached, never a zero-confidence claim', () => {
    const p = reviewRequestedEvent({
      caseId: CASE, claimObjectId: null, claimVersion: null, claimType: null, runId: RUN, methodId: METHOD, queuedReason: 'abstained', confidence: null,
      challenge: null, contradictionIds: [], excludedPrincipal: AGENT, evidenceObjectId: EVD, action: 'intelligence.claim.admit', actor: AGENT, occurredAt: AT,
    }).payload;
    expect(p).toMatchObject({ claim: null, queued_reason: 'abstained', confidence: null, evidence_object_id: EVD, routed_to: { excluded_principal: AGENT } });
  });
  it('a contradiction: the contradiction ids named, cut at 200 with truncated said', () => {
    const p = reviewRequestedEvent({
      caseId: CASE, claimObjectId: CLAIM, claimVersion: 1, claimType: 'REL', runId: RUN, methodId: METHOD, queuedReason: 'contradiction', confidence: 0.93,
      challenge: null, contradictionIds: [CTR], excludedPrincipal: AGENT, evidenceObjectId: EVD, action: 'intelligence.claim.admit', actor: AGENT, occurredAt: AT,
    }).payload;
    expect(p).toMatchObject({ queued_reason: 'contradiction', contradictions: [CTR], truncated: false, claim: { type: 'REL' } });
    const many = reviewRequestedEvent({
      caseId: CASE, claimObjectId: CLAIM, claimVersion: 1, claimType: 'CLM', runId: RUN, methodId: METHOD, queuedReason: 'contradiction', confidence: 0.9,
      challenge: null, contradictionIds: Array.from({ length: 201 }, () => uid()), excludedPrincipal: AGENT, evidenceObjectId: EVD, action: 'intelligence.claim.admit', actor: AGENT, occurredAt: AT,
    }).payload;
    expect(many['contradictions']).toHaveLength(200);
    expect(many['truncated']).toBe(true);
  });
  it('a challenge from the route: the person\'s words, no excluded principal (the run\'s agent is enforced at decision), no evidence named, the cause on the request', () => {
    const p = reviewRequestedEvent({
      caseId: CASE, claimObjectId: CLAIM, claimVersion: 2, claimType: 'CLM', runId: RUN, methodId: METHOD, queuedReason: 'challenged', confidence: 0.88,
      challenge: 'the value contradicts the restated terms', contradictionIds: [], excludedPrincipal: null, evidenceObjectId: null, action: 'intelligence.review.request', actor: PERSON, occurredAt: AT,
    }).payload;
    expect(p).toMatchObject({
      claim: { object_id: CLAIM, version: 2, type: 'CLM' }, queued_reason: 'challenged', challenge: 'the value contradicts the restated terms', evidence_object_id: null,
      routed_to: { roles: ['domain_admin', 'extraction_manager'], excluded_principal: null },
      cause: { action: 'intelligence.review.request', actor: PERSON, target_type: 'REV', target_id: CASE },
    });
  });
  it('method_flagged is vocabulary the queue knows; the builder carries it as any other reason', () => {
    const reasons: QueuedReason[] = ['below_review_threshold', 'abstained', 'method_flagged', 'contradiction', 'challenged'];
    for (const r of reasons) {
      const p = reviewRequestedEvent({ caseId: CASE, claimObjectId: CLAIM, claimVersion: 1, claimType: 'CLM', runId: RUN, methodId: METHOD, queuedReason: r, confidence: null, challenge: null, contradictionIds: [], excludedPrincipal: null, evidenceObjectId: null, action: 'intelligence.claim.admit', actor: AGENT, occurredAt: AT }).payload;
      expect(p['queued_reason']).toBe(r);
    }
  });
});
