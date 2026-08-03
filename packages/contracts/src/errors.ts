/**
 * Standard error catalog — Volume 4 Appendix E (`EYE-XXX-NNN`).
 * Volume 4 owns error semantics (Vol 3 Ch.54). (ADR-P0-13)
 */

export type RetryClass = 'no' | 'bounded' | 'yes';

export interface ErrorSpec {
  readonly code: string;
  readonly machineName: string;
  readonly condition: string;
  readonly retry: RetryClass;
  readonly httpStatus: number;
}

export const ERROR_CATALOG = {
  EYE_REQ_001: { code: 'EYE-REQ-001', machineName: 'invalid_request', condition: 'Request cannot be interpreted under declared contract', retry: 'no', httpStatus: 400 },
  EYE_REQ_002: { code: 'EYE-REQ-002', machineName: 'unsupported_version', condition: 'Contract/schema/ontology/model/package version unsupported', retry: 'no', httpStatus: 400 },
  EYE_IDN_001: { code: 'EYE-IDN-001', machineName: 'authentication_required', condition: 'No acceptable principal proof present', retry: 'no', httpStatus: 401 },
  EYE_IDN_002: { code: 'EYE-IDN-002', machineName: 'authentication_failed', condition: 'Credential/audience/issuer/device/assurance validation failed', retry: 'no', httpStatus: 401 },
  EYE_AUT_001: { code: 'EYE-AUT-001', machineName: 'access_denied', condition: 'Current policy denies the normalized action', retry: 'no', httpStatus: 403 },
  EYE_AUT_002: { code: 'EYE-AUT-002', machineName: 'policy_indeterminate', condition: 'Authorization cannot be safely resolved (treated as deny)', retry: 'bounded', httpStatus: 403 },
  EYE_AUT_003: { code: 'EYE-AUT-003', machineName: 'obligation_unmet', condition: 'Required control obligation cannot be enforced', retry: 'no', httpStatus: 403 },
  EYE_TEN_001: { code: 'EYE-TEN-001', machineName: 'domain_context_invalid', condition: 'Tenant/domain context absent, conflicting, or untrusted', retry: 'no', httpStatus: 403 },
  EYE_STA_001: { code: 'EYE-STA-001', machineName: 'object_not_found', condition: 'No authorized object version matches request', retry: 'no', httpStatus: 404 },
  EYE_STA_002: { code: 'EYE-STA-002', machineName: 'version_conflict', condition: 'Expected vs current authoritative versions differ', retry: 'no', httpStatus: 409 },
  EYE_STA_003: { code: 'EYE-STA-003', machineName: 'truth_state_prohibited', condition: "Operation invalid for object's truth state", retry: 'no', httpStatus: 409 },
  EYE_TMP_001: { code: 'EYE-TMP-001', machineName: 'temporal_scope_invalid', condition: 'Time interval, clock quality, or as-of boundary invalid', retry: 'no', httpStatus: 400 },
  EYE_PRV_001: { code: 'EYE-PRV-001', machineName: 'provenance_incomplete', condition: 'Required source/transformation lineage missing', retry: 'no', httpStatus: 422 },
  EYE_QUA_001: { code: 'EYE-QUA-001', machineName: 'quality_insufficient', condition: 'Product quality below declared decision-use threshold', retry: 'bounded', httpStatus: 422 },
  EYE_QUA_002: { code: 'EYE-QUA-002', machineName: 'result_abstained', condition: 'Method cannot support a responsible result', retry: 'no', httpStatus: 422 },
  EYE_WFL_001: { code: 'EYE-WFL-001', machineName: 'workflow_conflict', condition: 'Transition invalid for current durable state', retry: 'no', httpStatus: 409 },
  EYE_WFL_002: { code: 'EYE-WFL-002', machineName: 'human_gate_required', condition: 'Named human authorization required before continuation', retry: 'no', httpStatus: 403 },
  EYE_WFL_003: { code: 'EYE-WFL-003', machineName: 'deadline_exceeded', condition: 'Work cannot complete within useful/authorized deadline', retry: 'no', httpStatus: 408 },
  EYE_AGT_001: { code: 'EYE-AGT-001', machineName: 'capability_denied', condition: 'Agent lacks valid grant for tool/data/effect', retry: 'no', httpStatus: 403 },
  EYE_MDL_001: { code: 'EYE-MDL-001', machineName: 'no_conforming_model', condition: 'No approved model satisfies task and policy constraints', retry: 'bounded', httpStatus: 503 },
  EYE_DEP_001: { code: 'EYE-DEP-001', machineName: 'dependency_unavailable', condition: 'Required dependency unavailable within operation deadline', retry: 'yes', httpStatus: 503 },
  EYE_CAP_001: { code: 'EYE-CAP-001', machineName: 'capacity_exhausted', condition: 'Admission control cannot safely accept current work', retry: 'yes', httpStatus: 429 },
  EYE_DEG_001: { code: 'EYE-DEG-001', machineName: 'capability_degraded', condition: 'Requested capability constrained by active degraded mode', retry: 'bounded', httpStatus: 503 },
  EYE_INT_001: { code: 'EYE-INT-001', machineName: 'integrity_failure', condition: 'Digest, signature, ordering, or custody verification failed', retry: 'no', httpStatus: 500 },
  EYE_AUD_001: { code: 'EYE-AUD-001', machineName: 'audit_unavailable', condition: 'Required durable evidence cannot be committed', retry: 'bounded', httpStatus: 503 },
  EYE_EXT_001: { code: 'EYE-EXT-001', machineName: 'external_effect_unknown', condition: 'Dispatch occurred but external completion cannot be proven', retry: 'no', httpStatus: 502 },
  EYE_RCV_001: { code: 'EYE-RCV-001', machineName: 'reconciliation_required', condition: 'Recovery/failover left state requiring deterministic reconciliation', retry: 'no', httpStatus: 503 },
  EYE_GOV_001: { code: 'EYE-GOV-001', machineName: 'conformance_blocked', condition: 'Artifact or operation lacks current governing evidence', retry: 'no', httpStatus: 403 },
} as const satisfies Record<string, ErrorSpec>;

export type ErrorKey = keyof typeof ERROR_CATALOG;

/**
 * Caller-visible error envelope (Vol 4 Ch.21).
 * MUST NOT contain: stack traces, secrets, unauthorized object existence,
 * cross-tenant signals, internal topology, model prompts.
 */
export interface ErrorBody {
  readonly code: string;
  readonly machineName: string;
  readonly message: string; // policy-safe human message
  readonly retry: RetryClass;
  readonly correlationId: string;
  readonly contractVersion: string;
  readonly degraded?: boolean;
  readonly supportRef?: string;
}

export function errorBody(key: ErrorKey, correlationId: string, message?: string): ErrorBody {
  const spec = ERROR_CATALOG[key];
  return {
    code: spec.code,
    machineName: spec.machineName,
    message: message ?? spec.condition,
    retry: spec.retry,
    correlationId,
    contractVersion: 'v1',
  };
}
