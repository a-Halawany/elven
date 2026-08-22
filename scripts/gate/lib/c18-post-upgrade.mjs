/**
 * C18.1.11 — THE SOURCE-OWNED POST-UPGRADE COVERAGE CONTRACT.
 *
 * C18.1.10 authenticated the after → final boundary by COUNTING: nine tables, so many inserts,
 * one update touching three named columns, nothing deleted. That caught a final-only change to a
 * PRE-EXISTING row, and it caught an extra or missing row. It did not look inside the rows the
 * governed operation INSERTS, so every column of the new session, its refresh token, both
 * capabilities, the operation and its effect, the decision, the outbox row and the closing audit
 * event was unconstrained. Twenty-two mutations were accepted by the complete frozen a424505
 * verifier with ZERO findings.
 *
 * This module states the post-upgrade world the way C18.1.9 stated the seeded world: every column
 * of every inserted or updated row is classified exactly once and carries one executable rule, the
 * catalog / coverage / registration sets are proven equal in both directions, and the whole thing
 * runs whenever its slots resolve rather than behind a suppression gate.
 *
 * The governed operation opens ONE session for the platform admin, mints its refresh token and two
 * capabilities, records one decision, writes one outbox event, appends exactly one audit event to
 * its tenant partition and advances that partition's head. Every identity in that chain is bound
 * in BOTH directions.
 */

import { createHash } from 'node:crypto';
import {
  digest, exact, exactShape, generatedId, helpers, oneOf, phcArgon2id, volatileField,
} from './c18-seed-validators.mjs';
import { POST_UPGRADE_OPERATION_SPEC } from './c18-contract.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const stable = (v) => JSON.stringify(v);
const j = (v) => JSON.stringify(v);
const SPEC = POST_UPGRADE_OPERATION_SPEC;

/** The sessionless sentinel the identity capability carries. */
const SENTINEL_SESSION = '00000000-0000-0000-0000-000000000000';

/**
 * The governed post-upgrade posture that is fixed in SOURCE rather than observed. Anything not
 * listed here is generated at run time and is bound by a relationship instead of a literal.
 */
export const POST_UPGRADE_POSTURE = Object.freeze({
  session: Object.freeze({
    status: 'active', assurance: 'password', revoked_at: null, prev_refresh_token_hash: null,
  }),
  refreshToken: Object.freeze({
    generation: 1, replaced_by: null, reuse_seen_at: null, invalidated_at: null,
  }),
  capability: Object.freeze({ consumed_at: null }),
  operation: Object.freeze({
    runtime_role: 'eye', causation_id: null, finalized: true, expected_outcome: 'success',
    obligations_required: false, obligations_executed: false,
  }),
  effect: Object.freeze({ effect_kind: 'outbox' }),
  decision: Object.freeze({
    decision: 'allow', evidence_only: false, revocation_state: 'none', delegation_id: null,
    exception_ref: null, expires_at: null, obligations: [], environment: {},
  }),
  outbox: Object.freeze({
    status: 'pending', attempts: 0, lease_id: null, leased_until: null, published_at: null,
    payload: Object.freeze({ c18: 'post-upgrade governed operation' }),
  }),
  audit: Object.freeze({
    outcome: 'success', context_mode: 'authority', clock_quality: 'trusted',
    hash_alg_version: 'eye-audit-v1', metadata: {}, causation_id: null, delegation_id: null,
    trace_id: null, request_digest: null, target_version: null,
  }),
  head: Object.freeze({ frozen: false }),
  /**
   * The two capabilities the operation mints, as an exact multiset. `session` is either the new
   * session's id or the sessionless sentinel — never anything else.
   */
  capabilities: Object.freeze([
    Object.freeze({ op_class: 'identity', bound_action: 'identity.session.create', onNewSession: false }),
    Object.freeze({ op_class: SPEC.consequence, bound_action: SPEC.action, onNewSession: true }),
  ]),
});

/** One classified post-upgrade column: kind, note, and the executable rule. */
const k = (kind, note, rule, { sourceOwned = true } = {}) => Object.freeze({
  kind, note, rule, sourceOwned,
});

/** A value that must equal something else in the post-upgrade world, in both directions. */
const bound = (pick, what) => (v, row, ctx) => {
  const want = pick(row, ctx);
  if (want === undefined) return [];
  return stable(v) === stable(want) ? [] : [`is ${j(v)}; ${what} is ${j(want)}`];
};
/** A generated identifier: uuid-shaped, and unique across the rows of its own table. */
const uniqueUuid = () => (v, row, ctx) => {
  if (typeof v !== 'string' || !helpers.UUID_RE.test(v)) return [`is ${j(v)}, which is not a uuid`];
  const n = (ctx.tableRows ?? []).filter((r) => r[ctx.column] === v).length;
  return n > 1 ? [`value ${j(v)} appears ${n} times; this identifier is unique`] : [];
};
/**
 * A lifetime that must equal the SAME governed TTL the pre-existing rows of this kind carry.
 *
 * The TTL is governed configuration, not a compile-time constant, so it is derived from the rows
 * the same run already produced rather than hard-coded. `expires_at` is computed in the
 * application as `Date.now() + ttl` while `issued_at` comes from the database clock, so an
 * observed lifetime is the governed TTL plus a signed sub-second skew between those two clocks —
 * it can land just above OR just below the nominal value. The governed TTL is a whole number of
 * seconds, so it is recovered by ROUNDING a prior lifetime, and the row under test must sit within
 * one second of it. Comparing truncated seconds instead would make the rule depend on which side
 * of a second boundary the skew happened to fall: a prior lifetime of 3,599.997 s and a new one of
 * 3,600.006 s are the same governed hour, and only the hosted runner's skew revealed that.
 */
const governedLifetime = (priorRows, label) => (v, row, ctx) => {
  if (!ctx.canonicalTimestamp(v)) {
    return [`is ${j(v)}, which is not the canonical governed timestamp grammar`];
  }
  const issued = Date.parse(row.issued_at);
  const lived = Date.parse(v) - issued;
  if (!Number.isFinite(lived)) return [`cannot be measured against ${j(row.issued_at)}`];
  if (lived < 0) return [`is ${j(v)}, which precedes its own issue instant`];
  const priors = priorRows(row, ctx)
    .map((r) => Date.parse(r.expires_at) - Date.parse(r.issued_at))
    .filter(Number.isFinite);
  if (priors.length === 0) return [];
  const ttlSeconds = Math.round(Math.min(...priors) / 1000);
  const drift = Math.abs(lived - ttlSeconds * 1000);
  return drift < 1000 ? []
    : [`lives ${(lived / 1000).toFixed(3)}s; every ${label} in this run is issued for ${ttlSeconds}s`];
};
const puTimestamp = ({ nullable = false, notBefore = null, notAfter = null } = {}) => (v, row, ctx) => {
  if (v === null || v === undefined) {
    return nullable ? [] : ['is null; the specification requires an instant'];
  }
  if (!ctx.canonicalTimestamp(v)) {
    return [`is ${j(v)}, which is not the canonical governed timestamp grammar`];
  }
  const t = Date.parse(v);
  const out = [];
  const w = ctx.postUpgradeWindow();
  if (w !== null && (t < w.lo || t > w.hi)) {
    out.push(`is ${j(v)}, which falls outside the governed post-upgrade window`);
  }
  for (const [pick, what] of [[notBefore, 'must not precede'], [notAfter, 'must not follow']]) {
    if (pick === null) continue;
    const other = pick(row, ctx);
    if (other === undefined || other === null) continue;
    const o = Date.parse(other);
    if (what === 'must not precede' ? t < o : t > o) {
      out.push(`is ${j(v)}, which ${what} ${j(other)}`);
    }
  }
  return out;
};

/**
 * EVERY column of every inserted or updated post-upgrade row, classified exactly once.
 * `updatedColumns` names the columns an UPDATE may touch; every other column of an updated row
 * must be preserved byte-for-byte, which is checked structurally rather than per column.
 */
export const POST_UPGRADE_COVERAGE = Object.freeze({
  'identity.sessions': Object.freeze({
    key: ['id'], inserts: 1, updates: 0, rowsClaimedBy: 'the governed operation session',
    columns: Object.freeze({
      id: k('generated-id', 'uuid, unique', uniqueUuid()),
      principal_id: k('slot', 'the operation actor', bound((r, c) => c.op.principalId, 'the operation actor')),
      assurance: k('exact', 'password', exact(POST_UPGRADE_POSTURE.session.assurance)),
      status: k('exact', 'active', exact(POST_UPGRADE_POSTURE.session.status)),
      refresh_token_hash: k('digest', "its refresh row's token hash",
        bound((r, c) => c.newRefresh()?.token_hash, "the refresh row's token hash")),
      prev_refresh_token_hash: k('exact', 'null on a first session', exact(null)),
      // The context key is generated per session and never recorded anywhere else, so its VALUE
      // is not source-derivable. The strongest available contract is its grammar and its
      // uniqueness across every session in the final snapshot, and that is what is enforced —
      // stated as source_owned_value:false rather than implied to be exact.
      context_key_hash: k('digest', 'sha-256 hex; generated per session, unique, no source-owned value',
        digest({ unique: true }), { sourceOwned: false }),
      issued_at: k('formula', "its refresh row's issue instant",
        bound((r, c) => c.newRefresh()?.issued_at, "the refresh row's issue instant")),
      expires_at: k('formula', 'exactly the governed session lifetime after issue',
        governedLifetime((r, c) => c.priorSessions(), 'session')),
      revoked_at: k('exact', 'null — the operation revokes nothing', exact(null)),
      bound_epoch: k('formula', "its owner's revocation epoch",
        bound((r, c) => c.principalEpoch(r.principal_id), "the owner's revocation epoch")),
      family_id: k('generated-id', "its refresh row's family",
        bound((r, c) => c.newRefresh()?.family_id, "the refresh row's family")),
    }),
  }),

  'identity.refresh_tokens': Object.freeze({
    key: ['id'], inserts: 1, updates: 0, rowsClaimedBy: 'the governed operation refresh token',
    columns: Object.freeze({
      id: k('generated-id', 'uuid, unique', uniqueUuid()),
      family_id: k('generated-id', "its session's family", bound((r, c) => c.newSession()?.family_id, "the session's family")),
      session_id: k('slot', 'the new session', bound((r, c) => c.newSession()?.id, 'the new session')),
      token_hash: k('digest', "its session's refresh hash",
        bound((r, c) => c.newSession()?.refresh_token_hash, "the session's refresh hash")),
      generation: k('exact', 'first generation', exact(POST_UPGRADE_POSTURE.refreshToken.generation)),
      issued_at: k('formula', "its session's issue instant",
        bound((r, c) => c.newSession()?.issued_at, "the session's issue instant")),
      invalidated_at: k('exact', 'null', exact(null)),
      replaced_by: k('exact', 'null', exact(null)),
      reuse_seen_at: k('exact', 'null — no reuse was seen', exact(null)),
    }),
  }),

  'ctx.issued': Object.freeze({
    key: ['nonce'], inserts: 2, updates: 0, rowsClaimedBy: 'the exact two-capability multiset',
    columns: Object.freeze({
      nonce: k('generated-id', 'uuid, unique', uniqueUuid()),
      session_id: k('slot', 'the new session, or the sessionless sentinel',
        (v, row, ctx) => ctx.capabilityField(row, 'session_id', v)),
      op_class: k('exact', 'from the capability multiset', (v, row, ctx) => ctx.capabilityField(row, 'op_class', v)),
      bound_action: k('exact', 'from the capability multiset', (v, row, ctx) => ctx.capabilityField(row, 'bound_action', v)),
      issued_at: k('timestamp', 'inside the window, before expiry',
        puTimestamp({ notAfter: (r) => r.expires_at })),
      expires_at: k('formula', 'exactly the governed capability lifetime after issue',
        governedLifetime((r, c) => c.priorCapabilities(), 'capability')),
      consumed_at: k('exact', 'null — the era ports do not stamp consumption', exact(null)),
    }),
  }),

  'ctx.operation': Object.freeze({
    // C18.1.10 declared `id`, which this table does not have; the identity column is operation_id.
    key: ['operation_id'], inserts: 1, updates: 0, rowsClaimedBy: 'the governed operation',
    columns: Object.freeze({
      operation_id: k('generated-id', 'uuid, unique', uniqueUuid()),
      decision_id: k('slot', 'the closure decision', bound((r, c) => c.op.decisionId, 'the closure decision')),
      txid: k('volatile', 'the backend transaction id: digits, no source-owned value',
        (v) => (/^\d+$/.test(String(v)) ? [] : [`is ${j(v)}, which is not a transaction id`]),
        { sourceOwned: false }),
      backend_pid: k('volatile', 'the backend process id: a positive integer',
        (v) => (Number.isInteger(v) && v > 0 ? [] : [`is ${j(v)}, which is not a backend pid`]),
        { sourceOwned: false }),
      runtime_role: k('exact', 'the governed runtime role', exact(POST_UPGRADE_POSTURE.operation.runtime_role)),
      principal_id: k('slot', 'the operation actor', bound((r, c) => c.op.principalId, 'the operation actor')),
      session_id: k('slot', 'the new session', bound((r, c) => c.newSession()?.id, 'the new session')),
      scope: k('exact', 'the operation scope', exact(SPEC.scope)),
      tenant_id: k('slot', 'the operation tenant', bound((r, c) => c.op.tenantId, 'the operation tenant')),
      domain_id: k('slot', 'the operation domain', bound((r, c) => c.op.domainId, 'the operation domain')),
      action: k('exact', 'the operation action', exact(SPEC.action)),
      target: k('formula', 'outbox:<event id>', bound((r, c) => `outbox:${c.op.eventId}`, 'the recorded target')),
      correlation_id: k('slot', 'the operation correlation', bound((r, c) => c.op.correlation, 'the operation correlation')),
      causation_id: k('exact', 'null', exact(null)),
      purpose: k('exact', 'the operation purpose', exact(SPEC.purpose)),
      consequence: k('exact', 'the operation consequence', exact(SPEC.consequence)),
      bundle_version: k('exact', 'the governing bundle', exact(SPEC.bundle_version)),
      capability_class: k('exact', 'the governed capability class', exact(SPEC.capability_class)),
      expected_outcome: k('exact', 'success', exact(POST_UPGRADE_POSTURE.operation.expected_outcome)),
      obligations_required: k('exact', 'false', exact(false)),
      obligations_executed: k('exact', 'false', exact(false)),
      opened_at: k('timestamp', 'inside the window', puTimestamp({})),
      finalized: k('exact', 'true — the operation closed', exact(true)),
    }),
  }),

  'ctx.operation_effect': Object.freeze({
    key: ['id'], inserts: 1, updates: 0, rowsClaimedBy: 'the governed operation effect',
    columns: Object.freeze({
      // A bare sequence value: the database chooses it, so only its grammar is source-owned.
      id: k('generated-id', 'a positive serial; no source-owned value',
        (v) => (Number.isInteger(v) && v > 0 ? [] : [`is ${j(v)}, which is not a positive serial`]),
        { sourceOwned: false }),
      operation_id: k('slot', 'its operation', bound((r, c) => c.operationRow()?.operation_id, 'its operation')),
      effect_kind: k('exact', 'the declared effect kind', oneOf([...SPEC.effect_kinds])),
      effect_ref: k('slot', 'the outbox row it wrote', bound((r, c) => c.op.effectRef, 'the recorded effect')),
      recorded_at: k('timestamp', 'not before the operation opened',
        puTimestamp({ notBefore: (r, c) => c.operationRow()?.opened_at })),
    }),
  }),

  'policy.policy_decisions': Object.freeze({
    key: ['id'], inserts: 1, updates: 0, rowsClaimedBy: 'the closure decision',
    columns: Object.freeze({
      id: k('slot', 'the recorded decision', bound((r, c) => c.op.decisionId, 'the recorded decision')),
      scope: k('exact', 'the operation scope', exact(SPEC.scope)),
      action: k('exact', 'the operation action', exact(SPEC.action)),
      reason: k('exact', 'the source-owned closure reason', exact(SPEC.reason)),
      decision: k('exact', 'allow', exact(POST_UPGRADE_POSTURE.decision.decision)),
      domain_id: k('slot', 'the operation domain', bound((r, c) => c.op.domainId, 'the operation domain')),
      object_id: k('slot', 'the outbox row it authorised', bound((r, c) => c.op.eventId, 'the authorised object')),
      tenant_id: k('slot', 'the operation tenant', bound((r, c) => c.op.tenantId, 'the operation tenant')),
      created_at: k('formula', "the outbox row's creation instant",
        bound((r, c) => c.newOutbox()?.created_at, "the outbox row's creation instant")),
      expires_at: k('exact', 'null', exact(null)),
      purpose_id: k('exact', 'the operation purpose', exact(SPEC.purpose)),
      environment: k('exact', 'empty', exactShape({})),
      object_type: k('exact', 'the governed object type', exact(SPEC.object_type)),
      obligations: k('exact', 'empty', exactShape([])),
      // The producer computes sha256(`c18-post:<event id>`); that is the whole formula.
      input_digest: k('formula', 'sha-256 of the source-owned subject c18-post:<event id>',
        bound((r, c) => sha256(`c18-post:${c.op.eventId}`), 'the source-owned input digest')),
      principal_id: k('formula', 'principal:<actor>', bound((r, c) => `principal:${c.op.principalId}`, 'the prefixed actor')),
      delegation_id: k('exact', 'null', exact(null)),
      evidence_only: k('exact', 'false — a real enforced decision', exact(false)),
      exception_ref: k('exact', 'null', exact(null)),
      bundle_version: k('exact', 'the governing bundle', exact(SPEC.bundle_version)),
      correlation_id: k('slot', 'the operation correlation', bound((r, c) => c.op.correlation, 'the operation correlation')),
      revocation_state: k('exact', 'none', exact(POST_UPGRADE_POSTURE.decision.revocation_state)),
      consequence_class: k('exact', 'the operation consequence', exact(SPEC.consequence)),
    }),
  }),

  'objects.object_outbox': Object.freeze({
    key: ['id'], inserts: 1, updates: 0, rowsClaimedBy: 'the governed operation outbox event',
    columns: Object.freeze({
      id: k('slot', 'the recorded event id', bound((r, c) => c.op.eventId, 'the recorded event')),
      scope: k('exact', 'the operation scope', exact(SPEC.scope)),
      status: k('exact', 'pending — the proof does not publish', exact(POST_UPGRADE_POSTURE.outbox.status)),
      payload: k('exact', 'the source-owned proof payload', exactShape(POST_UPGRADE_POSTURE.outbox.payload)),
      attempts: k('exact', 'never attempted', exact(0)),
      lease_id: k('exact', 'null — never leased', exact(null)),
      domain_id: k('slot', 'the operation domain', bound((r, c) => c.op.domainId, 'the operation domain')),
      tenant_id: k('slot', 'the operation tenant', bound((r, c) => c.op.tenantId, 'the operation tenant')),
      created_at: k('timestamp', 'inside the window', puTimestamp({})),
      event_type: k('exact', 'the governed event type', exact(SPEC.event_type)),
      causation_id: k('generated-id', 'uuid, unique', uniqueUuid()),
      leased_until: k('exact', 'null — never leased', exact(null)),
      published_at: k('exact', 'null — never published', exact(null)),
      correlation_id: k('slot', 'the operation correlation', bound((r, c) => c.op.correlation, 'the operation correlation')),
    }),
  }),

  'audit.audit_events': Object.freeze({
    key: ['partition_id', 'audit_seq'], inserts: 1, updates: 0,
    rowsClaimedBy: 'the closing audit event',
    columns: Object.freeze({
      partition_id: k('formula', "the operation tenant's partition",
        bound((r, c) => `tenant:${c.op.tenantId}`, "the operation tenant's partition")),
      audit_seq: k('formula', 'one past the prior head', (v, row, ctx) => ctx.auditField(row, 'audit_seq', v)),
      event_jcs: k('digest', 'the production canonicalization of its own body',
        (v, row, ctx) => ctx.auditField(row, 'event_jcs', v)),
      event: k('exact', 'the complete closing body', (v, row, ctx) => ctx.auditField(row, 'event', v)),
      scope: k('exact', 'the operation scope', exact(SPEC.scope)),
      tenant_id: k('slot', 'the operation tenant', bound((r, c) => c.op.tenantId, 'the operation tenant')),
      domain_id: k('slot', 'the operation domain', bound((r, c) => c.op.domainId, 'the operation domain')),
      event_type: k('exact', 'the governed audit event type', exact(SPEC.audit_event_type)),
      outcome: k('exact', 'success', exact(POST_UPGRADE_POSTURE.audit.outcome)),
      actor: k('formula', 'principal:<actor>', bound((r, c) => `principal:${c.op.principalId}`, 'the prefixed actor')),
      action: k('exact', 'the operation action', exact(SPEC.action)),
      result_code: k('exact', 'OK', exact(SPEC.result_code)),
      correlation_id: k('slot', 'the operation correlation', bound((r, c) => c.op.correlation, 'the operation correlation')),
      occurred_at: k('formula', "its own canonical body's instant",
        (v, row, ctx) => ctx.auditField(row, 'occurred_at', v)),
      previous_hash: k('formula', "the prior row's hash in this partition",
        (v, row, ctx) => ctx.auditField(row, 'previous_hash', v)),
      row_hash: k('formula', 'the production row hash of this chain position',
        (v, row, ctx) => ctx.auditField(row, 'row_hash', v)),
      hash_alg_version: k('exact', 'the chain algorithm version', exact(POST_UPGRADE_POSTURE.audit.hash_alg_version)),
      created_at: k('timestamp', 'inside the window', puTimestamp({})),
    }),
  }),

  'audit.audit_chain_heads': Object.freeze({
    key: ['partition_id'], inserts: 0, updates: 1,
    updatedColumns: Object.freeze(['next_seq', 'head_hash', 'updated_at']),
    rowsClaimedBy: "the advanced head of the operation's partition",
    columns: Object.freeze({
      next_seq: k('formula', 'one past the closing event', (v, row, ctx) => ctx.headField(row, 'next_seq', v)),
      head_hash: k('formula', "the closing event's row hash", (v, row, ctx) => ctx.headField(row, 'head_hash', v)),
      updated_at: k('formula', "the closing event's landing instant",
        (v, row, ctx) => ctx.headField(row, 'updated_at', v)),
    }),
  }),
});

/** The columns for which a rule is registered, by table. */
export function postUpgradeRegisteredColumns(coverage = POST_UPGRADE_COVERAGE) {
  return Object.entries(coverage)
    .flatMap(([t, s]) => Object.keys(s.columns)
      .filter((c) => typeof s.columns[c].rule === 'function')
      .map((c) => `${t}.${c}`))
    .sort();
}

/** The columns with no source-owned value; each still carries a nontrivial executable rule. */
export function postUpgradeUnownedColumns(coverage = POST_UPGRADE_COVERAGE) {
  return Object.entries(coverage)
    .flatMap(([t, s]) => Object.keys(s.columns)
      .filter((c) => s.columns[c].sourceOwned === false)
      .map((c) => `${t}.${c}`))
    .sort();
}

/**
 * Derive the after → final affected-table universe from the snapshots themselves, so a table the
 * governed operation touches but the contract forgets is a finding rather than a blind spot.
 */
export function derivePostUpgradeTables(after, final) {
  const names = [...new Set([
    ...Object.keys(after?.tables ?? {}), ...Object.keys(final?.tables ?? {}),
  ])].sort();
  const affected = [];
  for (const t of names) {
    const a = after?.tables?.[t];
    const f = final?.tables?.[t];
    if (a === undefined || f === undefined) { affected.push(t); continue; }
    if (stable(a.rows ?? []) !== stable(f.rows ?? [])) affected.push(t);
  }
  return affected;
}

/**
 * EXECUTE the post-upgrade coverage contract. Compares every table, row and column across the
 * boundary; classifies and judges every column of every inserted or updated row; and binds the
 * complete post-upgrade world in both directions.
 */
export function runPostUpgradeCoverage({
  after, final, expected, canonicalTimestamp, audit, coverage = POST_UPGRADE_COVERAGE,
}) {
  const problems = [];
  const executed = [];
  const rowsOf = (snap, t) => snap?.tables?.[t]?.rows ?? [];

  // ── 1. The affected universe must be EXACTLY the contract's table set. ────────────────
  const affected = derivePostUpgradeTables(after, final);
  const declared = Object.keys(coverage).sort();
  for (const t of affected) {
    if (!declared.includes(t)) {
      problems.push(`post-upgrade coverage: the governed operation changes '${t}', which the `
        + 'contract does not classify');
    }
  }
  for (const t of declared) {
    if (!affected.includes(t)) {
      problems.push(`post-upgrade coverage: the contract classifies '${t}', which the boundary `
        + 'shows the operation does not change');
    }
  }
  // Every table the contract does NOT name must be byte-identical across the boundary.
  for (const t of [...new Set([...Object.keys(after?.tables ?? {}), ...Object.keys(final?.tables ?? {})])]) {
    if (declared.includes(t)) continue;
    if (stable(rowsOf(after, t)) !== stable(rowsOf(final, t))) {
      problems.push(`post-upgrade coverage: '${t}' changed, but the governed operation does not touch it`);
    }
  }

  // ── 2. Partition each declared table into inserted / updated / preserved. ─────────────
  const changes = new Map();
  for (const [table, spec] of Object.entries(coverage)) {
    const a = after?.tables?.[table];
    const f = final?.tables?.[table];
    if (a === undefined || f === undefined) {
      problems.push(`post-upgrade coverage: table '${table}' is absent from one side of the boundary`);
      continue;
    }
    if (stable(a.columns ?? []) !== stable(f.columns ?? [])) {
      problems.push(`post-upgrade coverage: '${table}' columns changed across the upgrade`);
    }
    const keyOf = (r) => stable(spec.key.map((c) => r[c]));
    const aBy = new Map((a.rows ?? []).map((r) => [keyOf(r), r]));
    const fBy = new Map((f.rows ?? []).map((r) => [keyOf(r), r]));
    if (aBy.size !== (a.rows ?? []).length || fBy.size !== (f.rows ?? []).length) {
      problems.push(`post-upgrade coverage: '${table}' has rows sharing one ${stable(spec.key)} key`);
    }
    const inserted = [...fBy.entries()].filter(([kk]) => !aBy.has(kk)).map(([, r]) => r);
    const deleted = [...aBy.keys()].filter((kk) => !fBy.has(kk));
    const updated = [...fBy.entries()].filter(([kk, r]) => aBy.has(kk) && stable(aBy.get(kk)) !== stable(r))
      .map(([kk, r]) => ({ before: aBy.get(kk), after: r }));
    if (inserted.length !== (spec.inserts ?? 0)) {
      problems.push(`post-upgrade coverage: '${table}' gained ${inserted.length} row(s); the governed `
        + `operation inserts exactly ${spec.inserts ?? 0}`);
    }
    if (deleted.length !== 0) {
      problems.push(`post-upgrade coverage: '${table}' LOST ${deleted.length} row(s); the governed `
        + 'operation deletes nothing');
    }
    if (updated.length !== (spec.updates ?? 0)) {
      problems.push(`post-upgrade coverage: '${table}' changed ${updated.length} existing row(s); the `
        + `governed operation updates exactly ${spec.updates ?? 0}`);
    }
    for (const u of updated) {
      const moved = Object.keys(u.after).filter((c) => stable(u.before[c]) !== stable(u.after[c]));
      const allowed = spec.updatedColumns ?? [];
      for (const c of moved.filter((x) => !allowed.includes(x))) {
        problems.push(`post-upgrade coverage: '${table}' update touched '${c}', which the governed `
          + 'operation may not change');
      }
    }
    changes.set(table, { inserted, updated });
  }

  // ── 3. The execution context: the complete world, bound both ways. ────────────────────
  const need = ['correlation', 'decisionId', 'tenantId', 'domainId', 'principalId', 'eventId', 'effectRef'];
  if (expected === null || typeof expected !== 'object' || need.some((n) => expected[n] === undefined)) {
    problems.push('post-upgrade coverage: no complete governed operation record; the columns cannot be judged');
    return { problems, executed, affected };
  }
  const newRows = (t) => changes.get(t)?.inserted ?? [];
  const finalEvents = rowsOf(final, 'audit.audit_events');
  const afterEvents = rowsOf(after, 'audit.audit_events');
  const closing = newRows('audit.audit_events')[0] ?? null;
  const instants = [
    ...newRows('identity.sessions').map((r) => r.issued_at),
    ...newRows('objects.object_outbox').map((r) => r.created_at),
    closing?.created_at,
  ].filter((x) => typeof x === 'string').map((x) => Date.parse(x)).filter(Number.isFinite);
  // Every instant the governed operation records belongs to ONE transaction sequence — the
  // genuine spread is tens of milliseconds. A one-second bound is generous for that and still
  // tight enough that a value moved by seconds is a finding rather than noise.
  const WINDOW_SLACK_MS = 1_000;

  const ctx = {
    op: expected,
    canonicalTimestamp,
    table: null,
    column: null,
    tableRows: [],
    postUpgradeWindow: () => (instants.length === 0 ? null
      : { lo: Math.min(...instants) - WINDOW_SLACK_MS, hi: Math.max(...instants) + WINDOW_SLACK_MS }),
    newSession: () => newRows('identity.sessions')[0],
    newRefresh: () => newRows('identity.refresh_tokens')[0],
    newOutbox: () => newRows('objects.object_outbox')[0],
    operationRow: () => newRows('ctx.operation')[0],
    principalEpoch: (id) => rowsOf(final, 'identity.principals').find((p) => p.id === id)?.revocation_epoch,
    priorSessions: () => rowsOf(after, 'identity.sessions'),
    priorCapabilities: () => rowsOf(after, 'ctx.issued'),

    /** The exact two-capability multiset: class, action and the session each is bound to. */
    capabilityField(row, field, value) {
      const session = ctx.newSession()?.id;
      const wanted = POST_UPGRADE_POSTURE.capabilities.map((c) => ({
        op_class: c.op_class,
        bound_action: c.bound_action,
        session_id: c.onNewSession ? session : SENTINEL_SESSION,
      }));
      const match = wanted.find((w) => w.op_class === row.op_class && w.bound_action === row.bound_action);
      if (match === undefined) {
        return [`belongs to no planned capability (${row.op_class}/${row.bound_action})`];
      }
      return stable(value) === stable(match[field]) ? []
        : [`is ${j(value)}; that capability carries ${j(match[field])}`];
    },

    /** The closing audit event: chain position, canonical body, production hashes. */
    auditField(row, field, value) {
      if (closing === null) return [];
      const partition = row.partition_id;
      const prior = afterEvents.filter((e) => e.partition_id === partition)
        .sort((a, b) => Number(a.audit_seq) - Number(b.audit_seq)).pop() ?? null;
      if (field === 'audit_seq') {
        const want = prior === null ? 1 : Number(prior.audit_seq) + 1;
        return Number(value) === want ? [] : [`is ${j(value)}; the chain continues at ${want}`];
      }
      if (field === 'previous_hash') {
        const want = prior === null ? '0'.repeat(64) : prior.row_hash;
        return value === want ? [] : ['does not equal the prior row hash in this partition'];
      }
      if (field === 'event_jcs') {
        return value === audit.jcs(row.event) ? []
          : ['is not the production canonicalization of the delivered body'];
      }
      if (field === 'row_hash') {
        let want;
        try {
          want = audit.rowHash({
            partitionId: row.partition_id,
            auditSeq: Number(row.audit_seq),
            previousHash: row.previous_hash,
            event: row.event,
          });
        } catch (err) { return [`cannot be recomputed: ${err.message}`]; }
        return value === want ? [] : ['is not the production row hash of this chain position'];
      }
      if (field === 'occurred_at') {
        const bodyTime = row.event?.occurred_at ?? null;
        return Date.parse(value) === Date.parse(bodyTime) ? []
          : [`is detached from its canonical body's occurred_at ${j(bodyTime)}`];
      }
      if (field === 'event') return ctx.auditBody(row);
      return [];
    },

    /** Every meaningful field of the closing canonical body, and its exact field set. */
    auditBody(row) {
      const body = row.event ?? {};
      const out = [];
      const want = {
        actor: `principal:${expected.principalId}`,
        scope: SPEC.scope,
        action: SPEC.action,
        outcome: POST_UPGRADE_POSTURE.audit.outcome,
        result_code: SPEC.result_code,
        event_type: SPEC.audit_event_type,
        tenant_id: expected.tenantId,
        domain_id: expected.domainId,
        target_id: expected.eventId,
        target_type: SPEC.object_type,
        session_id: ctx.newSession()?.id,
        purpose_id: SPEC.purpose,
        policy_version: SPEC.bundle_version,
        policy_decision_id: expected.decisionId,
        correlation_id: expected.correlation,
        context_mode: POST_UPGRADE_POSTURE.audit.context_mode,
        clock_quality: POST_UPGRADE_POSTURE.audit.clock_quality,
        metadata: POST_UPGRADE_POSTURE.audit.metadata,
        causation_id: null, delegation_id: null, trace_id: null,
        request_digest: null, target_version: null,
      };
      const found = Object.keys(body).sort();
      const expectedFields = Object.keys(want).concat(['occurred_at']).sort();
      if (stable(found) !== stable(expectedFields)) {
        out.push(`the closing body field set is ${stable(found)}; the specification fixes `
          + `${stable(expectedFields)}`);
      }
      for (const [f, w] of Object.entries(want)) {
        if (w === undefined) continue;
        if (stable(body[f] ?? null) !== stable(w ?? null)) {
          out.push(`body ${f} is ${j(body[f])}; the operation requires ${j(w)}`);
        }
      }
      return out;
    },

    /** The advanced head, derived from the closing event. */
    headField(row, field, value) {
      if (closing === null || row.partition_id !== closing.partition_id) return [];
      const want = {
        next_seq: Number(closing.audit_seq) + 1,
        head_hash: closing.row_hash,
        updated_at: closing.created_at,
      }[field];
      if (field === 'updated_at') {
        return Date.parse(value) === Date.parse(want) ? []
          : [`is ${j(value)}; the head is stamped when its closing event lands (${j(want)})`];
      }
      return stable(value) === stable(want) ? []
        : [`is ${j(value)}; the closing event derives ${j(want)}`];
    },
  };

  // ── 4. Execute one rule for every classified column of every changed row. ─────────────
  for (const [table, spec] of Object.entries(coverage)) {
    const change = changes.get(table);
    if (change === undefined) continue;
    const tableRows = rowsOf(final, table);
    const subjects = [
      ...change.inserted.map((r) => ({ row: r, columns: Object.keys(spec.columns) })),
      ...change.updated.map((u) => ({ row: u.after, columns: spec.updatedColumns ?? [] })),
    ];
    for (const column of Object.keys(spec.columns)) executed.push(`${table}.${column}`);
    for (const { row, columns } of subjects) {
      for (const column of columns) {
        const entry = spec.columns[column];
        if (entry === undefined) continue;
        let found;
        try {
          found = entry.rule(row[column], row, { ...ctx, table, column, tableRows });
        } catch (err) { found = [`could not be judged: ${err.message}`]; }
        for (const f of found) problems.push(`post-upgrade column: ${table}.${column} ${f}`);
      }
    }
  }
  return { problems, executed: [...new Set(executed)].sort(), affected };
}

/**
 * The three-way structural proof for the post-upgrade world: the delivered catalog columns of
 * every changed table, the coverage entries, and the registered executable rules must be equal in
 * BOTH directions. An updated table contributes only the columns an update may touch.
 */
export function verifyPostUpgradeRegistry({ final, coverage = POST_UPGRADE_COVERAGE, registered }) {
  const problems = [];
  const catalog = [];
  const classified = [];
  for (const [table, spec] of Object.entries(coverage)) {
    const cols = final?.tables?.[table]?.columns ?? [];
    const scope = (spec.inserts ?? 0) > 0 ? cols : (spec.updatedColumns ?? []);
    for (const c of scope) catalog.push(`${table}.${c}`);
    for (const c of Object.keys(spec.columns)) classified.push(`${table}.${c}`);
  }
  catalog.sort(); classified.sort();
  const reg = [...registered].sort();
  const diff = (a, b, whatA, whatB) => {
    for (const x of a) if (!b.includes(x)) problems.push(`post-upgrade registry: '${x}' is ${whatA} but not ${whatB}`);
  };
  diff(catalog, classified, 'in the delivered catalog', 'classified');
  diff(classified, catalog, 'classified', 'in the delivered catalog');
  diff(classified, reg, 'classified', 'registered as an executable rule');
  diff(reg, classified, 'registered as an executable rule', 'classified');
  return { problems, catalog, classified, registered: reg };
}
