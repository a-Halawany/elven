/**
 * THE EXTRACTION METHOD REGISTRY.
 *
 * A method is registered the way a source is: declared in full, approved by a
 * DIFFERENT person, then activated. What it declares is the whole pin — the model,
 * its weights digest, the runtime, the prompt and its digest, the decoding
 * configuration and its digest, and the mode. Every one of those is part of the
 * extraction identity, so changing any of them is a different method version
 * rather than a quiet change of meaning under a stable name.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { errorBody, jcsCanonicalize } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { MethodWrites, IntelligenceReads } from '../intelligence.capabilities.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export interface MethodIntake {
  methodKey: string;
  name: string;
  sourceId: string | null;
  targetTypes: string[];
  gatewayMode: 'replay' | 'local-live';
  modelId: string;
  modelWeightsDigest: string;
  runtimeVersion: string;
  promptRef: string;
  promptVersion: string;
  promptText: string;
  decoding: Record<string, unknown>;
  confidenceFloor: number;
  reviewBelow: number;
  budgetCalls: number;
  budgetSeconds: number;
}

const TYPES = ['ENT', 'EVT', 'CLM', 'REL', 'ASM'];

/** Validation refuses rather than repairs, and each refusal names its own reason. */
export function validateMethod(m: Partial<MethodIntake>, correlationId: string): MethodIntake {
  const bad = (msg: string): never => {
    throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422);
  };
  if (typeof m.methodKey !== 'string' || m.methodKey.length < 2 || m.methodKey.length > 128) {
    bad('method_key must be between 2 and 128 characters');
  }
  if (typeof m.name !== 'string' || m.name.length < 2) bad('name is required');
  if (!Array.isArray(m.targetTypes) || m.targetTypes.length === 0
    || m.targetTypes.length > 5 || !m.targetTypes.every((t) => TYPES.includes(t))) {
    bad(`target_types must name between 1 and 5 of ${TYPES.join(', ')}`);
  }
  if (m.gatewayMode !== 'replay' && m.gatewayMode !== 'local-live') {
    bad("gateway_mode must be 'replay' or 'local-live' — Phase 2 uses no hosted model API");
  }
  if (typeof m.modelId !== 'string' || m.modelId.length < 2) bad('model_id is required');
  if (typeof m.modelWeightsDigest !== 'string' || !/^[0-9a-f]{64}$/.test(m.modelWeightsDigest)) {
    bad('model_weights_digest must be a SHA-256 hex digest: an unpinned model is not a pinned method');
  }
  if (typeof m.runtimeVersion !== 'string' || m.runtimeVersion.length < 1) {
    bad('runtime_version is required — the runtime is part of what produced the output');
  }
  if (typeof m.promptRef !== 'string' || m.promptRef.length < 2) bad('prompt_ref is required');
  if (typeof m.promptVersion !== 'string' || m.promptVersion.length < 1) bad('prompt_version is required');
  if (typeof m.promptText !== 'string' || m.promptText.length < 8) {
    bad('prompt_text is required; its digest is what binds a claim to the instruction that produced it');
  }
  if (m.decoding === null || typeof m.decoding !== 'object') {
    bad('decoding configuration is required, even when it is empty of overrides');
  }
  const floor = Number(m.confidenceFloor);
  const review = Number(m.reviewBelow);
  if (!Number.isFinite(floor) || floor < 0 || floor > 1) bad('confidence_floor must be between 0 and 1');
  if (!Number.isFinite(review) || review < 0 || review > 1) bad('review_below must be between 0 and 1');
  if (review < floor) {
    bad('review_below must be at or above confidence_floor, or output would be admitted without review that the method itself calls unusable');
  }
  const calls = Number(m.budgetCalls); const seconds = Number(m.budgetSeconds);
  if (!Number.isInteger(calls) || calls < 1) bad('budget_calls must be a positive integer');
  if (!Number.isInteger(seconds) || seconds < 1) bad('budget_seconds must be a positive integer');
  return {
    methodKey: m.methodKey as string, name: m.name as string,
    sourceId: m.sourceId ?? null, targetTypes: m.targetTypes as string[],
    gatewayMode: m.gatewayMode as 'replay' | 'local-live', modelId: m.modelId as string,
    modelWeightsDigest: m.modelWeightsDigest as string,
    runtimeVersion: m.runtimeVersion as string, promptRef: m.promptRef as string,
    promptVersion: m.promptVersion as string, promptText: m.promptText as string,
    decoding: m.decoding as Record<string, unknown>,
    confidenceFloor: floor, reviewBelow: review, budgetCalls: calls, budgetSeconds: seconds,
  };
}

@Injectable()
export class MethodsService {
  async register(
    cap: MethodWrites, ctx: ScopeContext, correlationId: string,
    registrar: string, owner: string, m: MethodIntake,
  ): Promise<{ methodId: string; state: 'draft'; promptDigest: string; decodingDigest: string }> {
    const methodId = newId();
    const promptDigest = sha256(m.promptText);
    const decodingDigest = sha256(jcsCanonicalize(m.decoding));
    await cap.registerMethod({
      methodId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      registrar, owner, methodKey: m.methodKey, name: m.name, sourceId: m.sourceId,
      targetTypes: m.targetTypes, gatewayMode: m.gatewayMode, modelId: m.modelId,
      weightsDigest: m.modelWeightsDigest, runtimeVersion: m.runtimeVersion,
      promptRef: m.promptRef, promptVersion: m.promptVersion,
      promptText: m.promptText, promptDigest,
      decoding: m.decoding, decodingDigest,
      confidenceFloor: m.confidenceFloor, reviewBelow: m.reviewBelow,
      budgetCalls: m.budgetCalls, budgetSeconds: m.budgetSeconds,
      eventId: newId(), correlationId,
    });
    return { methodId, state: 'draft', promptDigest, decodingDigest };
  }

  async approve(
    cap: MethodWrites, ctx: ScopeContext, correlationId: string,
    methodId: string, approver: string, reason: string,
  ): Promise<{ methodId: string; state: 'approved' }> {
    await cap.approveMethod({
      methodId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      approver, reason, eventId: newId(), correlationId,
    });
    return { methodId, state: 'approved' };
  }

  async transition(
    cap: MethodWrites, ctx: ScopeContext, correlationId: string,
    methodId: string, target: string, actor: string, reason: string,
  ): Promise<{ methodId: string; state: string }> {
    await cap.transitionMethod({
      methodId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      target, actor, reason, eventId: newId(), correlationId,
    });
    return { methodId, state: target };
  }

  async list(cap: IntelligenceReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap.readMethods().selectAll()
      .orderBy('registered_at' as never, 'desc')
      .limit(Math.min(limit, 500)).execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: IntelligenceReads, methodId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readMethods().selectAll()
      .where('method_id' as never, '=', methodId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: IntelligenceReads, methodId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readMethodEvents().selectAll()
      .where('method_id' as never, '=', methodId as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }
}
