/**
 * Audit chain hashing — ADR-P0-09.
 *
 * row_hash = SHA-256( JCS({ version, partition_id, audit_seq, previous_hash, event }) )
 *
 * - version:       hash-structure version string, "eye-audit-v1"
 * - partition_id:  string — "platform" or "tenant:<tenant_uuid>"
 * - audit_seq:     integer (gap-free monotonic per partition)
 * - previous_hash: lowercase hex; genesis = 64 zeros
 * - event:         the audit-event object per its registered JSON Schema
 *
 * Domain-separated, unambiguously framed via RFC 8785 (JCS). No raw
 * concatenation of variable-length fields. Golden fixtures live in
 * fixtures/audit-hash.golden.json and are verified in CI.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from './jcs.js';

export const AUDIT_HASH_VERSION = 'eye-audit-v1';
export const GENESIS_HASH = '0'.repeat(64);

export type AuditOutcome = 'success' | 'denied' | 'indeterminate' | 'failure';

/** Audit event body (PR-62-002 / Vol 4 Ch.55). Sanitization rules apply to the security intake path. */
export interface AuditEventBody {
  event_type: string; // e.g. 'api.request', 'security.intake', 'admin.bootstrap', 'audit.verify'
  outcome: AuditOutcome;
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
  tenant_id: string | null;
  domain_id: string | null;
  actor: string; // principal id or 'anonymous'
  delegation_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_version: string | null;
  purpose_id: string | null;
  policy_decision_id: string | null;
  policy_version: string | null;
  result_code: string; // EYE-XXX-NNN or 'OK'
  occurred_at: string; // RFC 3339
  clock_quality: 'trusted' | 'degraded' | 'unknown';
  correlation_id: string;
  causation_id: string | null;
  trace_id: string | null;
  request_digest: string | null; // JCS digest of sanitized request metadata
  metadata: Record<string, unknown>; // sanitized; never credentials/tokens/payloads
}

export function sha256HexUtf8(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Content digest for any JSON value: SHA-256 over JCS bytes, lowercase hex. */
export function contentDigest(value: unknown): string {
  return sha256HexUtf8(jcsCanonicalize(value));
}

export function auditRowHash(input: {
  partitionId: string;
  auditSeq: number;
  previousHash: string;
  event: AuditEventBody;
}): string {
  if (!Number.isInteger(input.auditSeq) || input.auditSeq < 1) {
    throw new Error('audit_seq must be a positive integer');
  }
  if (!/^[0-9a-f]{64}$/.test(input.previousHash)) {
    throw new Error('previous_hash must be 64 lowercase hex chars');
  }
  const framed = {
    version: AUDIT_HASH_VERSION,
    partition_id: input.partitionId,
    audit_seq: input.auditSeq,
    previous_hash: input.previousHash,
    event: input.event,
  };
  return sha256HexUtf8(jcsCanonicalize(framed));
}

/** Partition id convention (ADR-P0-09). */
export function partitionIdFor(scope: 'PLATFORM' | 'TENANT' | 'DOMAIN', tenantId: string | null): string {
  if (scope === 'PLATFORM') return 'platform';
  if (tenantId === null) throw new Error('tenant-scoped audit requires tenant_id');
  return `tenant:${tenantId}`;
}
