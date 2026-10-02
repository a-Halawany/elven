/**
 * Intelligence capabilities — the Phase 1 capability discipline, applied to L2.
 *
 * One capability per action class. The relation is never a parameter, the
 * transaction is unreachable, and a handler receives a narrow interface with no
 * way to widen it. A method-registry route cannot admit a claim; an extraction
 * route cannot approve a method; a review route cannot start a run.
 *
 * These sit on top of migration 0023's ports, which bind every write to the
 * context's own bound action. Both layers must agree, and both are load-bearing.
 */
/** 0065 §7: a method transition and the edges it opened for reassessment (a suspension or retirement). */
export interface MethodTransition { method_id: string; event: string; from: string; to: string; edges_reassessment_opened: Array<{ edge_id: string; subject_entity_id: string; object_entity_id: string; predicate: string; claim_object_id: string; claim_version: number; valid_from: string | null; valid_to: string | null;
  dependencies?: Array<{ dependency_id: string; dependent_object_id: string; dependent_type: string; depends_on_kind: string; depends_on_id: string }> }> }
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

abstract class IntelligenceCore {
  readonly #tx: Tx;
  readonly #action: string;

  protected constructor(tx: Tx, action: string) {
    this.#tx = tx;
    this.#action = action;
  }

  get action(): string { return this.#action; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }

  protected async call<T>(fragment: { execute: (tx: Tx) => Promise<{ rows: T[] }> }): Promise<T[]> {
    return (await fragment.execute(this.#tx)).rows;
  }
}

// ───────────────────────── reads ─────────────────────────

export interface IntelligenceReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMethods(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMethodEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRuns(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRunEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readGatewayCalls(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRecordedResponses(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAttempts(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readLineage(): any;
  /** CP-6 B6 (0063): what is subscribed to a memory change at PUBLICATION — evidence the event carries, never authority. */
  changeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewCases(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any;
  readContradictions(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContracts(): any;
  rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string;
  }>>;
  /* B24 (0086) plan */
  /** 0083 §7 / 0086 §P: the plan selections, the extraction agents and the plan executions (each with its append-only ledger) — RLS-scoped reads. */
  readPlanSelections(): any;
  readExtractionAgents(): any;
  readExtractionAgentEvents(): any;
  readPlanExecutions(): any;
  readPlanExecutionEvents(): any;
  /* end B24 plan */
}

// ───────────────────────── method registry ─────────────────────────

export interface RegisterMethodArgs {
  methodId: string; tenantId: string; domainId: string; registrar: string; owner: string;
  methodKey: string; name: string; sourceId: string | null; targetTypes: string[];
  gatewayMode: 'replay' | 'local-live'; modelId: string; weightsDigest: string;
  runtimeVersion: string; promptRef: string; promptVersion: string;
  promptText: string; promptDigest: string;
  decoding: Record<string, unknown>; decodingDigest: string;
  confidenceFloor: number; reviewBelow: number;
  budgetCalls: number; budgetSeconds: number; eventId: string; correlationId: string;
}

export interface MethodWrites extends IntelligenceReads {
  registerMethod(a: RegisterMethodArgs): Promise<void>;
  approveMethod(a: {
    methodId: string; tenantId: string; domainId: string; approver: string;
    reason: string; eventId: string; correlationId: string;
  }): Promise<void>;
  transitionMethod(a: {
    methodId: string; tenantId: string; domainId: string; target: string; actor: string;
    reason: string; eventId: string; correlationId: string;
  }): Promise<MethodTransition>;
  /** 0065 §7: what is subscribed to a GraphChanged of this kind at publication (the model-change event). */
  graphChangeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>>;
  /** 0066 §6: the producing version's evaluation — measures from the ledgers, the evaluator's fitness verdict. */
  evaluateMethod(a: { evaluationId: string; tenantId: string; domainId: string; methodId: string; windowFrom: string | null; windowTo: string | null; fitness: 'fit' | 'unfit' | 'indeterminate'; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  readMethodEvaluations(): any;
}

// ───────────────────────── extraction ─────────────────────────

export interface MethodPin {
  method_key: string; method_version: number; gateway_mode: 'replay' | 'local-live';
  model_id: string; model_weights_digest: string; runtime_version: string;
  prompt_ref: string; prompt_version: string; prompt_text: string;
  prompt_digest: string; decoding_digest: string;
  decoding_config?: Record<string, unknown>;
  confidence_floor: string; review_below: string; budget_calls: number; budget_seconds: number;
  target_types: string[]; source_id: string | null;
}

/** 0066 §5: the contradiction link written by an admitting or correcting write (returns false when the pair is already linked). */
export interface ContradictionWrites {
  recordContradiction(a: { contradictionId: string; tenantId: string; domainId: string; kind: 'claim.value'; a: { objectId: string; version: number; value: string | null }; b: { objectId: string; version: number; value: string | null }; subject: string; predicate: string; basis: Record<string, unknown>; reviewCaseId: string | null; actor: string; correlationId: string }): Promise<boolean>;
}
export interface ExtractionWrites extends IntelligenceReads, ContradictionWrites {
  /** Claims are admitted through the SAME canonical path Phase 0 and 1 use. */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  lockActiveMethod(a: { methodId: string; tenantId: string; domainId: string }): Promise<MethodPin>;
  startRun(a: {
    runId: string; tenantId: string; domainId: string; methodId: string; methodVersion: number;
    agent: string; mode: string; eventId: string; correlationId: string;
  }): Promise<void>;
  finishRun(a: {
    runId: string; tenantId: string; domainId: string; state: string; failure: string | null;
    evidenceRead: number; claims: number; abstentions: number; idempotent: number; calls: number;
    actor: string; mode: string; eventId: string; correlationId: string;
  }): Promise<void>;
  /** B5: the DATABASE decides whether the model is called again, not the caller. */
  claimExtraction(a: {
    tenantId: string; domainId: string; identity: string; newAttempt: boolean;
  }): Promise<{
    decision: 'idempotent' | 'proceed'; attempt_ordinal: number;
    prior_result_digest: string | null; prior_claim_ids: string[] | null; prior_outcome: string | null;
  }>;
  recordAttempt(a: {
    attemptId: string; tenantId: string; domainId: string; identity: string; ordinal: number;
    runId: string; methodId: string; evidenceObjectId: string; evidenceDigest: string;
    mode: string; callId: string | null; resultDigest: string | null; claimIds: string[];
    outcome: string; correlationId: string;
  }): Promise<void>;
  recordGatewayCall(a: {
    callId: string; tenantId: string; domainId: string; runId: string | null; methodId: string;
    mode: string; requestDigest: string; responseDigest: string | null; modelId: string;
    weights: string; runtime: string; promptVersion: string; decoding: string;
    outcome: string; latencyMs: number; detail: Record<string, unknown>; correlationId: string;
  }): Promise<void>;
  recordResponse(a: {
    tenantId: string; domainId: string; requestDigest: string; response: unknown;
    responseDigest: string; modelId: string; runtime: string; from: 'local-live' | 'fixture';
    correlationId: string;
  }): Promise<boolean>;
  recordLineage(a: {
    claimId: string; version: number; tenantId: string; domainId: string; claimType: string;
    runId: string; methodId: string; callId: string | null; mode: string; evidenceObjectId: string;
    evidenceDigest: string; byteStart: number; byteEnd: number; confidence: number;
    retrievalDecisionId: string; retrievalAuditSeq: number;
    correlationId: string;
  }): Promise<void>;
  queueReview(a: {
    caseId: string; tenantId: string; domainId: string; claimId: string | null;
    version: number | null; runId: string; methodId: string; reason: string;
    confidence: number | null; actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

/* B24 (0086) plan */
// ───────────────────────── the extraction agent (0086 §P) ─────────────────────────

/** 0086 §P: the registry's two governed writes — a named human registers or revokes the domain's extraction agent. */
export interface ExtractionAgentWrites extends IntelligenceReads {
  registerExtractionAgent(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string; version: string; codeDigest: string;
    owner: string; escalation: string; budgets: Record<string, unknown>; actor: string; eventId: string; correlationId: string;
  }): Promise<{ agent_id: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown>; owner: string; escalation: string; requeued: number; pending: number }>;
  revokeExtractionAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<{ agent_id: string; status: string; pending: number }>;
}
/* end B24 plan */

// ───────────────────────── review ─────────────────────────

export interface ReviewWrites extends IntelligenceReads, ContradictionWrites {
  /** 0066 §5: a person's adjudication of a contradiction; 0066 §5: a challenge opens a review case on an admitted claim version. */
  adjudicateContradiction(a: { contradictionId: string; tenantId: string; domainId: string; adjudication: string; reason: string; actor: string; correlationId: string }): Promise<void>;
  requestReview(a: { caseId: string; tenantId: string; domainId: string; claimId: string; version: number; reason: string; actor: string; correlationId: string }): Promise<void>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  recordLineage(a: {
    claimId: string; version: number; tenantId: string; domainId: string; claimType: string;
    runId: string; methodId: string; callId: string | null; mode: string; evidenceObjectId: string;
    evidenceDigest: string; byteStart: number; byteEnd: number; confidence: number;
    retrievalDecisionId: string; retrievalAuditSeq: number;
    correlationId: string;
  }): Promise<void>;
  decideReview(a: {
    caseId: string; tenantId: string; domainId: string; state: string; decider: string;
    reason: string; supersededTo: number | null; eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── implementation ─────────────────────────

class IntelligenceCapabilityImpl extends IntelligenceCore
  implements MethodWrites, ExtractionWrites, ReviewWrites, ExtractionAgentWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  /* B24 (0086) plan */
  readPlanSelections(): any { return this.from('intelligence.plan_selections'); }
  readExtractionAgents(): any { return this.from('intelligence.extraction_agents'); }
  readExtractionAgentEvents(): any { return this.from('intelligence.extraction_agent_events'); }
  readPlanExecutions(): any { return this.from('intelligence.plan_executions'); }
  readPlanExecutionEvents(): any { return this.from('intelligence.plan_execution_events'); }
  async registerExtractionAgent(a: Parameters<ExtractionAgentWrites['registerExtractionAgent']>[0]) {
    type Answer = Awaited<ReturnType<ExtractionAgentWrites['registerExtractionAgent']>>;
    const rows = await this.call<{ r: Answer }>(sql`select intelligence.register_extraction_agent(
      ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.version}, ${a.codeDigest},
      ${a.owner}::uuid, ${a.escalation}::uuid, ${JSON.stringify(a.budgets)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r as Answer;
  }
  async revokeExtractionAgent(a: Parameters<ExtractionAgentWrites['revokeExtractionAgent']>[0]) {
    type Answer = Awaited<ReturnType<ExtractionAgentWrites['revokeExtractionAgent']>>;
    const rows = await this.call<{ r: Answer }>(sql`select intelligence.revoke_extraction_agent(
      ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r as Answer;
  }
  /* end B24 plan */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMethods(): any { return this.from('intelligence.methods_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMethodEvents(): any { return this.from('intelligence.method_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRuns(): any { return this.from('intelligence.runs_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRunEvents(): any { return this.from('intelligence.run_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readGatewayCalls(): any { return this.from('intelligence.gateway_calls'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRecordedResponses(): any { return this.from('intelligence.recorded_responses'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAttempts(): any { return this.from('intelligence.extraction_attempts'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readLineage(): any { return this.from('intelligence.claim_lineage'); }
  async changeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>> {
    const rows = await this.call<{ s: Array<{ subscription_id: string; consumer_kind: string }> }>(sql`select graph.subscriptions_matching(${a.tenantId}::uuid, ${a.domainId}::uuid, 'MemoryCorrected', ${a.changeKind}) as s`);
    return rows[0]?.s ?? [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewCases(): any { return this.from('intelligence.review_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewEvents(): any { return this.from('intelligence.review_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  readContradictions(): any { return this.from('intelligence.contradictions'); }
  readMethodEvaluations(): any { return this.from('intelligence.method_evaluations'); }
  async evaluateMethod(a: Parameters<MethodWrites['evaluateMethod']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select intelligence.evaluate_method(${a.evaluationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodId}::uuid, ${a.windowFrom}::timestamptz, ${a.windowTo}::timestamptz, ${a.fitness}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async recordContradiction(a: Parameters<ContradictionWrites['recordContradiction']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select intelligence.record_contradiction(${a.contradictionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.a.objectId}::uuid, ${a.a.version}, ${a.b.objectId}::uuid, ${a.b.version}, ${a.subject}, ${a.predicate}, ${a.a.value}, ${a.b.value}, ${JSON.stringify(a.basis)}::jsonb, ${a.reviewCaseId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok ?? false;
  }
  async adjudicateContradiction(a: Parameters<ReviewWrites['adjudicateContradiction']>[0]): Promise<void> {
    await this.call(sql`select intelligence.adjudicate_contradiction(${a.contradictionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.adjudication}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async requestReview(a: Parameters<ReviewWrites['requestReview']>[0]): Promise<void> {
    await this.call(sql`select intelligence.request_review(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.claimId}::uuid, ${a.version}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }

  async rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string;
  }>> {
    return this.call(sql`select projection, live_rows::text, rebuilt_rows::text,
                                mismatched::text from intelligence.rebuild_projections()`);
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('claim admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async registerMethod(a: RegisterMethodArgs): Promise<void> {
    await this.call(sql`select intelligence.register_method(
      ${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.registrar}::uuid,
      ${a.owner}::uuid, ${a.methodKey}, ${a.name}, ${a.sourceId}::uuid,
      ${a.targetTypes}::text[], ${a.gatewayMode}, ${a.modelId}, ${a.weightsDigest},
      ${a.runtimeVersion}, ${a.promptRef}, ${a.promptVersion}, ${a.promptText}, ${a.promptDigest},
      ${JSON.stringify(a.decoding)}::jsonb, ${a.decodingDigest},
      ${a.confidenceFloor}::numeric, ${a.reviewBelow}::numeric,
      ${a.budgetCalls}, ${a.budgetSeconds}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async approveMethod(a: {
    methodId: string; tenantId: string; domainId: string; approver: string;
    reason: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.approve_method(
      ${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.approver}::uuid,
      ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async transitionMethod(a: {
    methodId: string; tenantId: string; domainId: string; target: string; actor: string;
    reason: string; eventId: string; correlationId: string;
  }): Promise<MethodTransition> {
    const rows = await this.call<{ r: MethodTransition }>(sql`select intelligence.transition_method(
      ${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.target},
      ${a.actor}::uuid, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]!.r;
  }
  async graphChangeSubscriptions(a: { tenantId: string; domainId: string; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>> {
    const rows = await this.call<{ s: Array<{ subscription_id: string; consumer_kind: string }> }>(sql`select graph.subscriptions_matching(${a.tenantId}::uuid, ${a.domainId}::uuid, 'GraphChanged', ${a.changeKind}) as s`);
    return rows[0]?.s ?? [];
  }

  async lockActiveMethod(a: { methodId: string; tenantId: string; domainId: string }): Promise<MethodPin> {
    const rows = await this.call<MethodPin>(sql`select * from intelligence.lock_active_method(
      ${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid)`);
    const r = rows[0];
    if (r === undefined) throw new Error('active method lock returned no row');
    return r;
  }

  async startRun(a: {
    runId: string; tenantId: string; domainId: string; methodId: string; methodVersion: number;
    agent: string; mode: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.start_run(
      ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.methodId}::uuid,
      ${a.methodVersion}, ${a.agent}::uuid, ${a.mode}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async finishRun(a: {
    runId: string; tenantId: string; domainId: string; state: string; failure: string | null;
    evidenceRead: number; claims: number; abstentions: number; idempotent: number; calls: number;
    actor: string; mode: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.finish_run(
      ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.failure},
      ${a.evidenceRead}, ${a.claims}, ${a.abstentions}, ${a.idempotent}, ${a.calls},
      ${a.actor}::uuid, ${a.mode}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async claimExtraction(a: {
    tenantId: string; domainId: string; identity: string; newAttempt: boolean;
  }): Promise<{
    decision: 'idempotent' | 'proceed'; attempt_ordinal: number;
    prior_result_digest: string | null; prior_claim_ids: string[] | null; prior_outcome: string | null;
  }> {
    const rows = await this.call<{
      decision: 'idempotent' | 'proceed'; attempt_ordinal: number;
      prior_result_digest: string | null; prior_claim_ids: string[] | null; prior_outcome: string | null;
    }>(sql`select * from intelligence.claim_extraction(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.identity}, ${a.newAttempt})`);
    const r = rows[0];
    if (r === undefined) throw new Error('extraction identity check returned no row');
    return r;
  }

  async recordAttempt(a: {
    attemptId: string; tenantId: string; domainId: string; identity: string; ordinal: number;
    runId: string; methodId: string; evidenceObjectId: string; evidenceDigest: string;
    mode: string; callId: string | null; resultDigest: string | null; claimIds: string[];
    outcome: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.record_attempt(
      ${a.attemptId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.identity}, ${a.ordinal},
      ${a.runId}::uuid, ${a.methodId}::uuid, ${a.evidenceObjectId}::uuid, ${a.evidenceDigest},
      ${a.mode}, ${a.callId}::uuid, ${a.resultDigest}, ${a.claimIds}::uuid[], ${a.outcome},
      ${a.correlationId}::uuid)`);
  }

  async recordGatewayCall(a: {
    callId: string; tenantId: string; domainId: string; runId: string | null; methodId: string;
    mode: string; requestDigest: string; responseDigest: string | null; modelId: string;
    weights: string; runtime: string; promptVersion: string; decoding: string;
    outcome: string; latencyMs: number; detail: Record<string, unknown>; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.record_gateway_call(
      ${a.callId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid,
      ${a.methodId}::uuid, ${a.mode}, ${a.requestDigest}, ${a.responseDigest}, ${a.modelId},
      ${a.weights}, ${a.runtime}, ${a.promptVersion}, ${a.decoding}, ${a.outcome},
      ${a.latencyMs}, ${JSON.stringify(a.detail)}::jsonb, ${a.correlationId}::uuid)`);
  }

  async recordResponse(a: {
    tenantId: string; domainId: string; requestDigest: string; response: unknown;
    responseDigest: string; modelId: string; runtime: string; from: 'local-live' | 'fixture';
    correlationId: string;
  }): Promise<boolean> {
    const rows = await this.call<{ record_response: boolean }>(
      sql`select intelligence.record_response(
        ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.requestDigest},
        ${JSON.stringify(a.response)}::jsonb, ${a.responseDigest}, ${a.modelId},
        ${a.runtime}, ${a.from}, ${a.correlationId}::uuid) as record_response`);
    return rows[0]?.record_response === true;
  }

  async recordLineage(a: {
    claimId: string; version: number; tenantId: string; domainId: string; claimType: string;
    runId: string; methodId: string; callId: string | null; mode: string; evidenceObjectId: string;
    evidenceDigest: string; byteStart: number; byteEnd: number; confidence: number;
    retrievalDecisionId: string; retrievalAuditSeq: number;
    correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.record_lineage(
      ${a.claimId}::uuid, ${a.version}::bigint, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.claimType}, ${a.runId}::uuid, ${a.methodId}::uuid, ${a.callId}::uuid, ${a.mode},
      ${a.evidenceObjectId}::uuid, ${a.evidenceDigest}, ${a.byteStart}, ${a.byteEnd},
      ${a.confidence}::numeric, ${a.retrievalDecisionId}::uuid, ${a.retrievalAuditSeq}::bigint,
      ${a.correlationId}::uuid)`);
  }

  async queueReview(a: {
    caseId: string; tenantId: string; domainId: string; claimId: string | null;
    version: number | null; runId: string; methodId: string; reason: string;
    confidence: number | null; actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.queue_review(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.claimId}::uuid,
      ${a.version}::bigint, ${a.runId}::uuid, ${a.methodId}::uuid, ${a.reason},
      ${a.confidence}::numeric, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async decideReview(a: {
    caseId: string; tenantId: string; domainId: string; state: string; decider: string;
    reason: string; supersededTo: number | null; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.decide_review(
      ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.decider}::uuid,
      ${a.reason}, ${a.supersededTo}::bigint, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}

export const IntelligenceCapability = {
  read(tx: Tx, action: string): IntelligenceReads {
    return new IntelligenceCapabilityImpl(tx, action);
  },
  methods(tx: Tx, action: string): MethodWrites {
    return new IntelligenceCapabilityImpl(tx, action);
  },
  extraction(tx: Tx, action: string): ExtractionWrites {
    return new IntelligenceCapabilityImpl(tx, action);
  },
  review(tx: Tx, action: string): ReviewWrites {
    return new IntelligenceCapabilityImpl(tx, action);
  },
  /* B24 (0086) plan */
  extractionAgents(tx: Tx, action: string): ExtractionAgentWrites {
    return new IntelligenceCapabilityImpl(tx, action);
  },
  /* end B24 plan */
};
