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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewCases(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSourceContracts(): any;
  rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string;
  }>>;
}

// ───────────────────────── method registry ─────────────────────────

export interface RegisterMethodArgs {
  methodId: string; tenantId: string; domainId: string; registrar: string; owner: string;
  methodKey: string; name: string; sourceId: string | null; targetTypes: string[];
  gatewayMode: 'replay' | 'local-live'; modelId: string; weightsDigest: string;
  runtimeVersion: string; promptRef: string; promptVersion: string; promptDigest: string;
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
  }): Promise<void>;
}

// ───────────────────────── extraction ─────────────────────────

export interface MethodPin {
  method_key: string; method_version: number; gateway_mode: 'replay' | 'local-live';
  model_id: string; model_weights_digest: string; runtime_version: string;
  prompt_ref: string; prompt_version: string; prompt_digest: string; decoding_digest: string;
  confidence_floor: string; review_below: string; budget_calls: number; budget_seconds: number;
  target_types: string[]; source_id: string | null;
}

export interface ExtractionWrites extends IntelligenceReads {
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
    correlationId: string;
  }): Promise<void>;
  queueReview(a: {
    caseId: string; tenantId: string; domainId: string; claimId: string | null;
    version: number | null; runId: string; methodId: string; reason: string;
    confidence: number | null; actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── review ─────────────────────────

export interface ReviewWrites extends IntelligenceReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  recordLineage(a: {
    claimId: string; version: number; tenantId: string; domainId: string; claimType: string;
    runId: string; methodId: string; callId: string | null; mode: string; evidenceObjectId: string;
    evidenceDigest: string; byteStart: number; byteEnd: number; confidence: number;
    correlationId: string;
  }): Promise<void>;
  decideReview(a: {
    caseId: string; tenantId: string; domainId: string; state: string; decider: string;
    reason: string; supersededTo: number | null; eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── implementation ─────────────────────────

class IntelligenceCapabilityImpl extends IntelligenceCore
  implements MethodWrites, ExtractionWrites, ReviewWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewCases(): any { return this.from('intelligence.review_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewEvents(): any { return this.from('intelligence.review_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
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
      ${a.runtimeVersion}, ${a.promptRef}, ${a.promptVersion}, ${a.promptDigest},
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
  }): Promise<void> {
    await this.call(sql`select intelligence.transition_method(
      ${a.methodId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.target},
      ${a.actor}::uuid, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
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
    correlationId: string;
  }): Promise<void> {
    await this.call(sql`select intelligence.record_lineage(
      ${a.claimId}::uuid, ${a.version}::bigint, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.claimType}, ${a.runId}::uuid, ${a.methodId}::uuid, ${a.callId}::uuid, ${a.mode},
      ${a.evidenceObjectId}::uuid, ${a.evidenceDigest}, ${a.byteStart}, ${a.byteEnd},
      ${a.confidence}::numeric, ${a.correlationId}::uuid)`);
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
};
