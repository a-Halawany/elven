/**
 * Bounded internal append port for POL records (ADR-P0-08 §7.3, R2b).
 * Since remediation R2, direct INSERT on policy_decisions is revoked; the
 * append goes through SECURITY DEFINER policy.append_decision(jsonb), which
 * verifies the caller's signed context matches the decision's scope.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { PolicyInput, PolicyResult } from '../pdp.service.js';

export interface PolicyDecisionRecordRef {
  policyDecisionId: string;
}

export async function appendPolicyDecision(
  tx: Tx,
  input: PolicyInput,
  result: PolicyResult,
  correlationId: string,
): Promise<PolicyDecisionRecordRef> {
  const id = newId();
  const record = {
    id,
    scope: input.context.scope,
    tenant_id: input.context.tenantId,
    domain_id: input.context.domainId,
    decision: result.decision,
    obligations: result.obligations,
    principal_id: input.principal.principalId,
    delegation_id: input.delegationId,
    action: input.action,
    object_type: input.objectType,
    object_id: input.objectId,
    purpose_id: input.purposeId,
    consequence_class: input.consequenceClass,
    environment: input.environment,
    input_digest: result.inputDigest,
    bundle_version: result.bundleVersion,
    exception_ref: result.exceptionRef,
    expires_at: result.expiresAt,
    revocation_state: result.revocationState,
    reason: result.reason,
    correlation_id: correlationId,
  };
  await sql`select policy.append_decision(${JSON.stringify(record)}::jsonb)`.execute(tx);
  return { policyDecisionId: id };
}
