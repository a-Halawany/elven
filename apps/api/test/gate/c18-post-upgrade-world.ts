/**
 * C18.1.11 — A GENERATED, CONTRACT-CONFORMANT POST-UPGRADE BOUNDARY.
 *
 * The post-upgrade coverage contract claims an executable rule for every column of every row the
 * governed operation inserts or updates. Proving that claim needs an after → final pair the whole
 * contract accepts, so that contradicting ONE column at a time shows each rule actually fires.
 *
 * The mutations are RULE-AWARE: a generic "change the value" cannot exercise a uniqueness rule
 * (an arbitrary distinct digest is legitimately valid) or a lifetime rule (a value one second
 * later is still well-typed). Each column is contradicted in the way its own rule claims to
 * forbid — a well-typed but semantically wrong value, not a malformed one.
 */
import { createHash } from 'node:crypto';
import { auditRowHash, jcsCanonicalize } from '@eye/contracts';
import {
  POST_UPGRADE_COVERAGE, POST_UPGRADE_POSTURE, runPostUpgradeCoverage,
} from '../../../../scripts/gate/lib/c18-post-upgrade.mjs';
import { POST_UPGRADE_OPERATION_SPEC } from '../../../../scripts/gate/lib/c18-contract.mjs';
import { canonicalTimestamp } from '../../../../scripts/gate/lib/c18-seed-validators.mjs';

const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
const u = (n: string) => `bbbbbbbb-${n.padStart(4, '0').slice(0, 4)}-4bbb-8bbb-bbbbbbbbbbbb`;
const hex = (c: string) => c.repeat(64);
const BASE = Date.parse('2026-09-01T00:00:00.000Z');
const t = (ms: number) => new Date(BASE + ms).toISOString().replace('Z', '+00:00');
const iso = (ms: number) => new Date(BASE + ms).toISOString();
const SPEC: any = POST_UPGRADE_OPERATION_SPEC;
const SENTINEL = '00000000-0000-0000-0000-000000000000';

const IDS = {
  tenant: u('0001'), domain: u('0002'), principal: u('0003'),
  session: u('0004'), family: u('0005'), refresh: u('0006'),
  operation: u('0007'), decision: u('0008'), outbox: u('0009'),
  correlation: u('000a'), causation: u('000b'),
  priorSession: u('0010'), priorFamily: u('0011'), priorRefresh: u('0012'),
};
const SESSION_TTL_MS = 3_600_000;
const CAP_TTL_MS = 60_000;
const T = { issued: 1_000, capC1: 1_200, opened: 1_300, effect: 1_400, event: 1_500 };

const table = (rows: any[], columns: string[]) => ({
  rows, columns, pk: [columns[0]], row_count: rows.length,
});
const cols = (t2: string) => Object.keys((POST_UPGRADE_COVERAGE as any)[t2].columns);

/** An after → final pair the post-upgrade contract accepts in full. */
export function buildPostUpgradeWorld() {
  const priorSession = {
    id: IDS.priorSession, principal_id: IDS.principal, assurance: 'password', status: 'active',
    refresh_token_hash: hex('1'), prev_refresh_token_hash: null, context_key_hash: hex('2'),
    issued_at: t(0), expires_at: t(SESSION_TTL_MS), revoked_at: null, bound_epoch: 2,
    family_id: IDS.priorFamily,
  };
  const priorRefresh = {
    id: IDS.priorRefresh, family_id: IDS.priorFamily, session_id: IDS.priorSession,
    token_hash: hex('1'), generation: 1, issued_at: t(0),
    invalidated_at: null, replaced_by: null, reuse_seen_at: null,
  };
  const priorCap = {
    nonce: u('0020'), session_id: IDS.priorSession, op_class: 'C2', bound_action: 'objects.create',
    issued_at: t(0), expires_at: t(CAP_TTL_MS), consumed_at: null,
  };
  const principals = [{ id: IDS.principal, revocation_epoch: 2 }];

  const newSession = {
    id: IDS.session, principal_id: IDS.principal, assurance: POST_UPGRADE_POSTURE.session.assurance,
    status: POST_UPGRADE_POSTURE.session.status, refresh_token_hash: hex('3'),
    prev_refresh_token_hash: null, context_key_hash: hex('4'),
    issued_at: t(T.issued), expires_at: t(T.issued + SESSION_TTL_MS), revoked_at: null,
    bound_epoch: 2, family_id: IDS.family,
  };
  const newRefresh = {
    id: IDS.refresh, family_id: IDS.family, session_id: IDS.session, token_hash: hex('3'),
    generation: 1, issued_at: t(T.issued), invalidated_at: null, replaced_by: null, reuse_seen_at: null,
  };
  const caps = [
    {
      nonce: u('0021'), session_id: SENTINEL, op_class: 'identity',
      bound_action: 'identity.session.create', issued_at: t(T.issued),
      expires_at: t(T.issued + CAP_TTL_MS), consumed_at: null,
    },
    {
      nonce: u('0022'), session_id: IDS.session, op_class: SPEC.consequence,
      bound_action: SPEC.action, issued_at: t(T.capC1),
      expires_at: t(T.capC1 + CAP_TTL_MS), consumed_at: null,
    },
  ];
  const operation = {
    operation_id: IDS.operation, decision_id: IDS.decision, txid: '4242', backend_pid: 99,
    runtime_role: POST_UPGRADE_POSTURE.operation.runtime_role, principal_id: IDS.principal,
    session_id: IDS.session, scope: SPEC.scope, tenant_id: IDS.tenant, domain_id: IDS.domain,
    action: SPEC.action, target: `outbox:${IDS.outbox}`, correlation_id: IDS.correlation,
    causation_id: null, purpose: SPEC.purpose, consequence: SPEC.consequence,
    bundle_version: SPEC.bundle_version, capability_class: SPEC.capability_class,
    expected_outcome: 'success', obligations_required: false, obligations_executed: false,
    opened_at: t(T.opened), finalized: true,
  };
  const effect = {
    id: 1, operation_id: IDS.operation, effect_kind: 'outbox', effect_ref: IDS.outbox,
    recorded_at: t(T.effect),
  };
  const decision = {
    id: IDS.decision, scope: SPEC.scope, action: SPEC.action, reason: SPEC.reason,
    decision: 'allow', domain_id: IDS.domain, object_id: IDS.outbox, tenant_id: IDS.tenant,
    created_at: t(T.capC1), expires_at: null, purpose_id: SPEC.purpose, environment: {},
    object_type: SPEC.object_type, obligations: [], input_digest: sha256(`c18-post:${IDS.outbox}`),
    principal_id: `principal:${IDS.principal}`, delegation_id: null, evidence_only: false,
    exception_ref: null, bundle_version: SPEC.bundle_version, correlation_id: IDS.correlation,
    revocation_state: 'none', consequence_class: SPEC.consequence,
  };
  const outbox = {
    id: IDS.outbox, scope: SPEC.scope, status: 'pending',
    payload: { ...POST_UPGRADE_POSTURE.outbox.payload }, attempts: 0, lease_id: null,
    domain_id: IDS.domain, tenant_id: IDS.tenant, created_at: t(T.capC1),
    event_type: SPEC.event_type, causation_id: IDS.causation, leased_until: null,
    published_at: null, correlation_id: IDS.correlation,
  };

  const partition = `tenant:${IDS.tenant}`;
  const priorEvent = (() => {
    const body = {
      actor: `principal:${IDS.principal}`, scope: SPEC.scope, action: 'tenancy.tenant.create',
      outcome: 'success', metadata: {}, trace_id: null, domain_id: null, target_id: IDS.tenant,
      tenant_id: null, event_type: 'api.request', purpose_id: 'seed', session_id: IDS.priorSession,
      occurred_at: iso(0), result_code: 'OK', target_type: 'tenancy.tenant', causation_id: null,
      context_mode: 'authority', clock_quality: 'trusted', delegation_id: null,
      correlation_id: u('0030'), policy_version: 'bundle-v1', request_digest: null,
      target_version: null, policy_decision_id: u('0031'),
    };
    const previous = hex('0');
    return {
      partition_id: partition, audit_seq: 4, event_jcs: jcsCanonicalize(body as never), event: body,
      scope: body.scope, tenant_id: body.tenant_id, domain_id: body.domain_id,
      event_type: body.event_type, outcome: body.outcome, actor: body.actor, action: body.action,
      result_code: body.result_code, correlation_id: body.correlation_id,
      occurred_at: body.occurred_at, previous_hash: previous,
      row_hash: auditRowHash({ partitionId: partition, auditSeq: 4, previousHash: previous, event: body as never }),
      hash_alg_version: 'eye-audit-v1', created_at: t(0),
    };
  })();
  const closing = (() => {
    const body = {
      actor: `principal:${IDS.principal}`, scope: SPEC.scope, action: SPEC.action,
      outcome: 'success', metadata: {}, trace_id: null, domain_id: IDS.domain,
      target_id: IDS.outbox, tenant_id: IDS.tenant, event_type: SPEC.audit_event_type,
      purpose_id: SPEC.purpose, session_id: IDS.session, occurred_at: iso(T.event),
      result_code: SPEC.result_code, target_type: SPEC.object_type, causation_id: null,
      context_mode: 'authority', clock_quality: 'trusted', delegation_id: null,
      correlation_id: IDS.correlation, policy_version: SPEC.bundle_version, request_digest: null,
      target_version: null, policy_decision_id: IDS.decision,
    };
    const previous = priorEvent.row_hash;
    return {
      partition_id: partition, audit_seq: 5, event_jcs: jcsCanonicalize(body as never), event: body,
      scope: body.scope, tenant_id: body.tenant_id, domain_id: body.domain_id,
      event_type: body.event_type, outcome: body.outcome, actor: body.actor, action: body.action,
      result_code: body.result_code, correlation_id: body.correlation_id,
      occurred_at: body.occurred_at, previous_hash: previous,
      row_hash: auditRowHash({ partitionId: partition, auditSeq: 5, previousHash: previous, event: body as never }),
      hash_alg_version: 'eye-audit-v1', created_at: t(T.capC1),
    };
  })();

  const headBefore = {
    partition_id: partition, next_seq: 5, head_hash: priorEvent.row_hash, frozen: false,
    updated_at: priorEvent.created_at,
  };
  const headAfter = {
    partition_id: partition, next_seq: 6, head_hash: closing.row_hash, frozen: false,
    updated_at: closing.created_at,
  };

  const after: any = {
    tables: {
      'identity.sessions': table([priorSession], cols('identity.sessions')),
      'identity.refresh_tokens': table([priorRefresh], cols('identity.refresh_tokens')),
      'ctx.issued': table([priorCap], cols('ctx.issued')),
      'ctx.operation': table([], cols('ctx.operation')),
      'ctx.operation_effect': table([], cols('ctx.operation_effect')),
      'policy.policy_decisions': table([], cols('policy.policy_decisions')),
      'objects.object_outbox': table([], cols('objects.object_outbox')),
      'audit.audit_events': table([priorEvent], cols('audit.audit_events')),
      'audit.audit_chain_heads': table([headBefore], ['partition_id', 'next_seq', 'head_hash', 'frozen', 'updated_at']),
      'identity.principals': table(principals.map((p) => ({ ...p })), ['id', 'revocation_epoch']),
    },
  };
  const final: any = {
    tables: {
      'identity.sessions': table([priorSession, newSession], cols('identity.sessions')),
      'identity.refresh_tokens': table([priorRefresh, newRefresh], cols('identity.refresh_tokens')),
      'ctx.issued': table([priorCap, ...caps], cols('ctx.issued')),
      'ctx.operation': table([operation], cols('ctx.operation')),
      'ctx.operation_effect': table([effect], cols('ctx.operation_effect')),
      'policy.policy_decisions': table([decision], cols('policy.policy_decisions')),
      'objects.object_outbox': table([outbox], cols('objects.object_outbox')),
      'audit.audit_events': table([priorEvent, closing], cols('audit.audit_events')),
      'audit.audit_chain_heads': table([headAfter], ['partition_id', 'next_seq', 'head_hash', 'frozen', 'updated_at']),
      'identity.principals': table(principals.map((p) => ({ ...p })), ['id', 'revocation_epoch']),
    },
  };
  const expected = {
    correlation: IDS.correlation, decisionId: IDS.decision, action: SPEC.action,
    target: `outbox:${IDS.outbox}`, tenantId: IDS.tenant, domainId: IDS.domain,
    principalId: IDS.principal, sessionId: IDS.session, eventId: IDS.outbox,
    effectRef: IDS.outbox, effectKinds: ['outbox'],
  };
  return { after, final, expected };
}

/** Run the real contract against a world. */
export function judgePostUpgrade(w: { after: any; final: any; expected: any }) {
  return runPostUpgradeCoverage({
    after: w.after, final: w.final, expected: w.expected, canonicalTimestamp,
    audit: { jcs: jcsCanonicalize, rowHash: auditRowHash },
  });
}

/** The changed row a column's rule applies to. */
export function postUpgradeSubject(w: { after: any; final: any }, table2: string, column: string) {
  const spec: any = (POST_UPGRADE_COVERAGE as any)[table2];
  const keyOf = (r: any) => JSON.stringify(spec.key.map((c: string) => r[c]));
  const before = new Map((w.after.tables[table2].rows ?? []).map((r: any) => [keyOf(r), r]));
  const inserted = (w.final.tables[table2].rows ?? []).filter((r: any) => !before.has(keyOf(r)));
  if (inserted.length > 0) return inserted[inserted.length - 1];
  return (w.final.tables[table2].rows ?? []).find((r: any) => before.has(keyOf(r)));
}

/**
 * Contradict ONE column in the way its own rule claims to forbid. Well-typed but wrong: a
 * duplicate where uniqueness is claimed, a different-but-valid identity where a binding is
 * claimed, a longer-but-plausible lifetime where a governed TTL is claimed.
 */
export function mutatePostUpgradeColumn(
  w: { after: any; final: any; expected: any }, table2: string, column: string, row: any,
) {
  const rows = w.final.tables[table2].rows;
  const other = rows.find((r: any) => r !== row);
  const v = row[column];

  // Uniqueness and lifetime rules need their own contradiction.
  if (column === 'context_key_hash' || column === 'nonce' || column === 'id'
      || column === 'operation_id' || column === 'causation_id') {
    if (other !== undefined && other[column] !== undefined && typeof v === typeof other[column]) {
      row[column] = other[column];      // duplicate: contradicts uniqueness
      return;
    }
  }
  if (column === 'expires_at' && (table2 === 'identity.sessions' || table2 === 'ctx.issued')) {
    row[column] = t(Date.parse(v) - BASE + 600_000);  // a longer, still well-formed lifetime
    return;
  }
  if (typeof v === 'boolean') { row[column] = !v; return; }
  if (typeof v === 'number') { row[column] = v + 1; return; }
  if (v === null) {
    row[column] = column.endsWith('_at') ? t(999_000) : u('00ff');
    return;
  }
  if (typeof v === 'string') {
    if (canonicalTimestamp(v)) { row[column] = t(Date.parse(v) - BASE + 7_000); return; }
    if (/^[0-9a-f]{64}$/.test(v)) { row[column] = hex('9'); return; }
    if (/^\d+$/.test(v)) { row[column] = 'not-a-number'; return; }
    row[column] = `${v}-wrong`;
    return;
  }
  row[column] = { ...(v as object), wrong: true };
}
