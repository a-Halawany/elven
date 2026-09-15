/**
 * Intelligence API client — the Claims, Review, Methods and Gateway screens.
 *
 * Same rule as the observation client: every response is returned VERBATIM and
 * nothing here predicts a result or fills in a value the server did not send.
 *
 * Phase 2 adds one of its own. `mode` — 'replay' or 'local-live' — is carried on
 * every run, every claim's lineage and every gateway call, and the screens render
 * it wherever they render the output it produced. A reader must never have to
 * infer whether a number came from a recorded response or a model that ran.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type GatewayMode = 'replay' | 'local-live';

export interface MethodSummary {
  method_id: string;
  method_key: string;
  name: string;
  lifecycle_state: 'draft' | 'approved' | 'active' | 'suspended' | 'retired';
  gateway_mode: GatewayMode;
  model_id: string;
  model_weights_digest: string;
  runtime_version: string;
  prompt_ref: string;
  prompt_version: string;
  prompt_digest: string;
  decoding_digest: string;
  confidence_floor: string;
  review_below: string;
  budget_calls: number;
  budget_seconds: number;
  target_types: string[];
  source_id: string | null;
  registered_at: string;
}

export interface ClaimRow {
  object_id: string;
  object_type: 'ENT' | 'EVT' | 'CLM' | 'REL' | 'ASM';
  object_version: number;
  truth_state: string;
  lifecycle_state: string;
  recorded_at: string;
  event_time: string | null;
  method_ref: string | null;
  payload: {
    claim_kind: string; subject: string; predicate: string; object_value: string;
    confidence: number;
    lineage: {
      mode: GatewayMode; method_key: string; model_id: string; model_weights_digest: string;
      runtime_version: string; prompt_version: string; decoding_digest: string;
      evidence_object_id: string; evidence_digest: string; byte_start: number; byte_end: number;
      extraction_identity: string; run_id: string; call_id: string | null;
      retrieval_decision_id: string; retrieval_audit_seq: number;
    };
    review: { state: string; reason: string | null; decider: string | null };
  };
}

export interface ReviewCase {
  case_id: string;
  claim_object_id: string | null;
  claim_version: number | null;
  run_id: string;
  method_id: string;
  /** 0066 §5 adds `contradiction` (the newer of two incompatible assertions) and `challenged` (a person's review request). */
  queued_reason: 'below_review_threshold' | 'abstained' | 'method_flagged' | 'contradiction' | 'challenged';
  confidence: string | null;
  state: 'queued' | 'approved' | 'corrected' | 'rejected';
  opened_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  superseded_to_version: number | null;
}

export interface RunRow {
  run_id: string; method_id: string; mode: GatewayMode; state: string;
  started_at: string; finished_at: string | null;
  evidence_read: number; claims_admitted: number; abstentions: number;
  idempotent_hits: number; calls_used: number; failure_reason: string | null;
}

export interface GatewayCall {
  call_id: string; mode: GatewayMode; request_digest: string; response_digest: string | null;
  model_id: string; runtime_version: string; prompt_version: string;
  outcome: 'completed' | 'abstained' | 'refused' | 'failed';
  latency_ms: number; occurred_at: string; detail: Record<string, unknown>;
}

/**
 * A CONTRADICTION (0066 §5, interface L2-I03): two admitted assertions about the same subject and predicate whose
 * values are incompatible, LINKED and never collapsed. `a` is the assertion that stood; `b` the one admitted (or
 * corrected) against it. The row is served as stored: its only mutation is the adjudication.
 */
export interface ContradictionRow {
  contradiction_id: string;
  scope: string;
  tenant_id: string;
  domain_id: string;
  kind: 'claim.value';
  a_object_id: string;
  a_version: number | string;
  b_object_id: string;
  b_version: number | string;
  subject: string;
  predicate: string;
  a_value: string | null;
  b_value: string | null;
  basis: Record<string, unknown>;
  state: 'open' | 'adjudicated';
  review_case_id: string | null;
  detected_by: string;
  detected_at: string;
  adjudicated_by: string | null;
  adjudicated_at: string | null;
  adjudication: 'both_stand' | 'a_withdrawn' | 'b_withdrawn' | 'superseded' | null;
  adjudication_reason: string | null;
  correlation_id: string;
}

export type Adjudication = NonNullable<ContradictionRow['adjudication']>;

export interface IntelligenceOverview {
  methods: { total: number; active: number; draft: number };
  runs: { total: number; replay: number; liveLocal: number };
  claims: { total: number; replay: number; liveLocal: number };
  review: { queued: number; abstentions: number; decided: number };
  gateway: {
    calls: number; replay: number; liveLocal: number;
    abstained: number; refused: number; failed: number;
  };
}

async function intel<T>(
  scope: Scope, path: string, action: string, objectType: string,
  payload: unknown = {}, objectId: string | null = null,
): Promise<ApiResult<T>> {
  return call<T>(
    `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/intelligence${path}`,
    {
      scope: 'DOMAIN',
      tenant_id: scope.tenantId,
      domain_id: scope.domainId,
      action,
      object_type: objectType,
      object_id: objectId,
      purpose_id: 'intelligence',
      side_effect_class: action.startsWith('intelligence.read') ? 'none' : 'reversible',
      consequence_class: 'C2',
    },
    payload,
  );
}

export const intelligence = {
  overview: (s: Scope) =>
    intel<{ overview: IntelligenceOverview; receipt: Receipt }>(
      s, '/overview', 'intelligence.read', 'CLM'),

  listMethods: (s: Scope) =>
    intel<{ methods: MethodSummary[]; receipt: Receipt }>(
      s, '/methods/list', 'intelligence.read', 'MTH', { limit: 200 }),

  getMethod: (s: Scope, methodId: string) =>
    intel<{ method: MethodSummary; events: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, `/methods/${methodId}/get`, 'intelligence.read', 'MTH', {}, methodId),

  approveMethod: (s: Scope, methodId: string, reason: string) =>
    intel<{ method: { state: string }; receipt: Receipt }>(
      s, `/methods/${methodId}/approve`, 'intelligence.method.approve', 'MTH', { reason }, methodId),

  transitionMethod: (s: Scope, methodId: string, target: string, reason: string) =>
    intel<{ method: { state: string }; receipt: Receipt }>(
      s, `/methods/${methodId}/transition`, 'intelligence.method.activate', 'MTH',
      { target, reason }, methodId),

  extract: (s: Scope, methodId: string, limit: number, newAttempt: boolean) =>
    intel<{ extraction: {
      runId: string; mode: GatewayMode; state: string; evidenceRead: number;
      claimsAdmitted: number; abstentions: number; idempotentHits: number;
      callsUsed: number; queuedForReview: number; failure: string | null;
      evidenceRetrievals: Array<{ evidenceObjectId: string; policyDecisionId: string; auditSeq: number }>;
      claims: Array<{ objectId: string; admissionDecisionId: string; admissionAuditSeq: number }>;
    } }>(s, '/extract', 'intelligence.claim.admit', 'CLM', { methodId, limit, newAttempt }),

  listRuns: (s: Scope) =>
    intel<{ runs: RunRow[]; receipt: Receipt }>(s, '/runs/list', 'intelligence.read', 'RUN', { limit: 100 }),

  listClaims: (s: Scope) =>
    intel<{ claims: ClaimRow[]; receipt: Receipt }>(
      s, '/claims/list', 'intelligence.read', 'CLM', { limit: 200 }),

  getClaim: (s: Scope, claimId: string, knownAt?: string) =>
    intel<{
      versions: ClaimRow[]; current: ClaimRow | null;
      lineage: Array<Record<string, unknown>>; cases: ReviewCase[]; receipt: Receipt;
    }>(s, `/claims/${claimId}/get`, 'intelligence.read', 'CLM',
      knownAt === undefined ? {} : { knownAt }, claimId),

  reviewQueue: (s: Scope) =>
    intel<{ queue: ReviewCase[]; receipt: Receipt }>(
      s, '/review/queue', 'intelligence.read', 'REV', { limit: 200 }),

  decideReview: (
    s: Scope, caseId: string, decision: 'approve' | 'correct' | 'reject', reason: string,
    correctedValue?: Record<string, unknown>,
  ) =>
    intel<{ review: { caseId: string; state: string; newVersion: number | null;
                      /** 0066 §5: the contradictions a correction entered (a corrected value that contradicts a standing assertion). */
                      contradictions: number };
            receipt: Receipt }>(
      s, `/review/${caseId}/decide`, 'intelligence.review.decide', 'REV',
      correctedValue === undefined ? { decision, reason } : { decision, reason, correctedValue },
      caseId),

  /**
   * A CHALLENGE (0066 §5, V00-T-037): a person opens a review case on an admitted claim version with a reason; the case
   * queues with the reason `challenged` and is decided through the review route. The envelope names no object: the
   * case id is the server's. A version already queued is refused, and the refusal says so.
   */
  requestReview: (s: Scope, claimObjectId: string, claimVersion: number, reason: string) =>
    intel<{ review: { caseId: string; claimObjectId: string; claimVersion: number; state: string; reason: string };
            receipt: Receipt }>(
      s, '/review/request', 'intelligence.review.request', 'REV', { claimObjectId, claimVersion, reason }),

  /** The contradictions of the domain, newest detection first; `state` narrows to open or adjudicated ones. */
  listContradictions: (s: Scope, state?: ContradictionRow['state']) =>
    intel<{ contradictions: ContradictionRow[]; receipt: Receipt }>(
      s, '/contradictions/list', 'intelligence.read', 'CTR',
      state === undefined ? { limit: 200 } : { state, limit: 200 }),

  /**
   * The ADJUDICATION (V03-T-286): a person records how the incompatible assertions stand — both stand, one withdrawn,
   * or superseded. Neither assertion is deleted by this act, and the link is immutable afterwards. It is the review
   * decision's action (intelligence.review.decide) on the contradiction (CTR), C2.
   */
  adjudicateContradiction: (s: Scope, contradictionId: string, adjudication: Adjudication, reason: string) =>
    intel<{ contradiction: { contradictionId: string; state: string; adjudication: string }; receipt: Receipt }>(
      s, `/contradictions/${contradictionId}/adjudicate`, 'intelligence.review.decide', 'CTR',
      { adjudication, reason }, contradictionId),

  gatewayCalls: (s: Scope) =>
    intel<{
      calls: GatewayCall[];
      recorded: Array<{ request_digest: string; response_digest: string; model_id: string;
                        runtime_version: string; recorded_from: string; recorded_at: string }>;
      receipt: Receipt;
    }>(s, '/gateway/calls', 'intelligence.read', 'GWC', { limit: 100 }),

  verifyProjections: (s: Scope) =>
    intel<{ projections: Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>;
            receipt: Receipt }>(s, '/projections/verify', 'intelligence.read', 'CLM'),
};
