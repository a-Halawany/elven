/**
 * C18.1.8 — THE SOURCE-OWNED SEED COVERAGE CONTRACT.
 * C18.1.9 — every classified column now carries an EXECUTABLE RULE, not a note.
 *
 * bfc8695's seed model was "closed" only over the entities the specification happened to name.
 * Deterministic base-row posture (tenant/domain status and profiles, principal status and
 * revocation epoch, session status, credential and refresh-token lifecycle, capability rows,
 * lifecycle events) was never classified, and audit history was checked against MINIMA, so a
 * suspended tenant, a disabled bootstrap principal, a revoked session, a changed retention
 * profile and an entire extra production-valid audit event all reconciled.
 *
 * This module removes the omission class rather than the individual omissions: every column of
 * every table the governed seed touches is classified into exactly one kind, and the affected
 * table universe is DERIVED from an authenticated pre-seed → post-seed delta, so a table that
 * the seed writes but the contract forgets is itself a finding.
 */

import {
  byModel, digest, exact, exactBy, exactShape, exactShapeBy, formula, generatedId, helpers,
  inSeedWindow, notBefore, oneOf, phcArgon2id, sameTimeAs, slotRef, timestamp, volatileField,
  before as tsBefore,
  isPgTimestamp,
} from './c18-seed-validators.mjs';
import {
  SEED_ARGON2ID_PARAMS, SEED_AUDIT_POSTURE, SEED_BASE_POSTURE, SEED_CREDENTIAL_LIFECYCLE,
  SEED_DECISION_POSTURE, SEED_OBJECTS,
  SEED_DOMAINS, SEED_LIFECYCLE_EVENTS, SEED_TENANTS, seedObjectHeader, seedObjectPayload,
  seedOutboxPayload,
} from './c18-seed-spec.mjs';
import { GOVERNED_LIFETIMES, capabilityLifetimeSeconds, judgeLifetime } from './c18-lifetimes.mjs';

/**
 * C18.1.12 — SEEDED LIFETIMES ARE GOVERNED TOO.
 *
 * The seeded world required only `expires_at > issued_at`, so doubling every seeded session and
 * capability lifetime was invisible here; only the post-upgrade rows caught it. A governed
 * lifetime is a governed lifetime wherever it is written, and the producer sets these from the
 * same `c18-lifetimes.mjs` spec the rule below reads.
 */
const governedSeedLifetime = (seconds, label) => (v, row) => {
  // A governed lifetime lives on DATABASE columns; the body grammar is not a spelling of it.
  if (!isPgTimestamp(v)) {
    return [`is ${JSON.stringify(v)}, which is not the canonical database timestamp grammar`];
  }
  return judgeLifetime({
    issuedAt: row.issued_at, expiresAt: v, seconds: seconds(row), label,
  });
};

// ── Slot lookups shared by the rules ─────────────────────────────────────────
const P = SEED_BASE_POSTURE;
const D = SEED_DECISION_POSTURE;
const A = SEED_AUDIT_POSTURE;
/**
 * A credential's retirement columns: exactly null while the credential is active, and a valid
 * instant no earlier than its creation once it has been retired. The complete rotation ordering
 * (predecessor retired exactly when its replacement is minted, governed expiry inside its own
 * life) is owned by the runner's credential model, which judges the rows as a set.
 */
const credentialLifecycle = (field) => (v, row) => {
  const active = row.status === P.credential.activeStatus;
  // C18.1.13: an ABSENT property is not an explicit null. The two were indistinguishable here.
  if (v === undefined) return ['is ABSENT; this column records an explicit value, not nothing'];
  if (active) {
    return v === null ? []
      : [`is ${JSON.stringify(v)} on an ACTIVE credential; the specification requires null`];
  }
  if (v === null) return ['is null on a RETIRED credential; the specification requires an instant'];
  // C18.1.13: a DATABASE column, so the database grammar — `new Date(v)` accepted prose, alternate
  // offsets and the body family alike, which is how a cross-family respelling passed.
  if (!isPgTimestamp(v)) {
    return [`is ${JSON.stringify(v)}, which is not the canonical database timestamp grammar`];
  }
  const t = new Date(v).getTime();
  if (field === 'rotated_at' && !(isPgTimestamp(row.created_at)
    && new Date(row.created_at).getTime() <= t)) {
    return ['retires the credential before it was created'];
  }
  return [];
};
const idOf = (map, slot) => (slot === null || slot === undefined ? null : (map.get(slot) ?? null));
const slotOfId = (map, id) => [...map.entries()].find(([, v]) => v === id)?.[0] ?? null;
/** The specification entry whose slot owns this row, by the slot map that resolved it. */
const tenantSpecOf = (row, ctx) => SEED_TENANTS.find((t) => t.slot === slotOfId(ctx.slots.tenant, row.id));
const domainSpecOf = (row, ctx) => SEED_DOMAINS.find((d) => d.slot === slotOfId(ctx.slots.domain, row.id));
const principalSpecOf = (row, ctx) => {
  const slot = slotOfId(ctx.slots.principal, row.id);
  return slot === ctx.spec.admin.slot ? ctx.spec.admin : ctx.spec.principals.find((x) => x.slot === slot);
};
const sessionOwner = (row, ctx) => ctx.rows('identity.principals').find((r) => r.id === row.principal_id);
const sessionOf = (row, ctx) => ctx.rows('identity.sessions').find((r) => r.id === row.session_id);
const tokenOfSession = (row, ctx) => ctx.rows('identity.refresh_tokens').find((t) => t.session_id === row.id);
/** The lifecycle plan entry a lifecycle row belongs to, resolved by event + entity. */
const lifecycleSpecOf = (row, ctx) => SEED_LIFECYCLE_EVENTS.find((e) => e.event === row.event
  && idOf(ctx.slots.tenant, e.tenantSlot) === (row.tenant_id ?? null)
  && idOf(ctx.slots.domain, e.domainSlot) === (row.domain_id ?? null));
/** The entity row a lifecycle event describes — its creation time is the event's instant. */
const lifecycleEntityOf = (row, ctx) => {
  const spec = lifecycleSpecOf(row, ctx);
  if (spec === undefined) return undefined;
  return spec.entityKind === 'tenant'
    ? ctx.rows('tenancy.tenants').find((t) => t.id === idOf(ctx.slots.tenant, spec.entitySlot))
    : ctx.rows('tenancy.domains').find((d) => d.id === idOf(ctx.slots.domain, spec.entitySlot));
};
const objectSpecOf = (row, ctx) => ctx.spec.objects.find((o) => o.subject === row.payload?.subject);
const outboxSpecOf = (row, ctx) => ctx.spec.outbox.find((o) => o.eventType === row.event_type);

/** The classification kinds. Every covered column carries exactly one. */
export const COVERAGE_KINDS = Object.freeze([
  'exact',        // a source-owned exact value
  'slot',         // a slot-derived relationship to another seeded entity
  'formula',      // derived by a production or source-owned formula
  'generated-id', // a generated identifier, with type and uniqueness rules
  'digest',       // a generated digest/hash, with format and linkage rules
  'timestamp',    // a time, with explicit ordering/lifecycle rules
  'volatile',     // explicitly permitted nullable/volatile field
]);

/**
 * Every covered column: its kind, a human note, and — required — the EXECUTABLE rule that
 * enforces it. A column without a callable rule fails the structural meta-control.
 */
/**
 * One classified column: its kind, a human note, the EXECUTABLE rule that enforces the kind, and
 * the migration ERA in which the column exists. `era` defaults to 'every': present in both the
 * 0012-era catalog the seed writes and the upgraded catalog. A column marked 'latest' is added by
 * a later migration — it MUST be absent from the seed-era catalog and present in the upgraded
 * one, and BOTH directions are checked, so an era label cannot excuse a column that went missing.
 */
const k = (kind, note, rule, { era = 'every' } = {}) => Object.freeze({ kind, note, rule, era });

/**
 * Every table the governed 0012-era seed writes, and every column of each, classified.
 * `rowsClaimedBy` names the verification that must consume every row of the table, so an
 * unclaimed row is a finding rather than silence.
 */
export const SEED_COVERAGE = Object.freeze({
  'tenancy.tenants': Object.freeze({
    rowsClaimedBy: 'tenant slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a tenant slot', generatedId({ unique: true })),
      name: k('exact', 'the slot name', exactBy((row, ctx) => tenantSpecOf(row, ctx)?.name)),
      status: k('exact', "'active' — the seed activates every tenant", exact(P.tenant.status)),
      residency_profile: k('exact', "'default' — the era create_tenant argument", exact(P.tenant.residency_profile)),
      retention_profile: k('exact', "'default' — the era default", exact(P.tenant.retention_profile)),
      created_at: k('timestamp', 'inside the governed seeding window; <= activated_at', inSeedWindow({})),
      activated_at: k('timestamp', 'inside the window; >= created_at', inSeedWindow({ relations: [notBefore((row) => row.created_at, 'its creation time')] })),
    }),
  }),
  'tenancy.domains': Object.freeze({
    rowsClaimedBy: 'domain slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a domain slot', generatedId({ unique: true })),
      tenant_id: k('slot', 'the parent tenant slot', slotRef((row, ctx) => idOf(ctx.slots.tenant, domainSpecOf(row, ctx)?.tenantSlot ?? null))),
      name: k('exact', 'the slot name', exactBy((row, ctx) => domainSpecOf(row, ctx)?.name)),
      status: k('exact', "'active'", exact(P.domain.status)),
      residency_profile: k('exact', "'local-dev' — the 0002 column default", exact(P.domain.residency_profile)),
      retention_profile: k('exact', "'default'", exact(P.domain.retention_profile)),
      created_at: k('timestamp', 'inside the governed seeding window; <= activated_at', inSeedWindow({})),
      activated_at: k('timestamp', 'inside the window; >= created_at', inSeedWindow({ relations: [notBefore((row) => row.created_at, 'its creation time')] })),
    }),
  }),
  'tenancy.lifecycle_events': Object.freeze({
    rowsClaimedBy: 'lifecycle-event plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid', generatedId({ unique: true })),
      scope: k('exact', "'TENANT' for tenant.created, 'DOMAIN' for domain.created", exactBy((row, ctx) => lifecycleSpecOf(row, ctx)?.scope)),
      tenant_id: k('slot', 'the tenant slot the event concerns', slotRef((row, ctx) => idOf(ctx.slots.tenant, lifecycleSpecOf(row, ctx)?.tenantSlot ?? null))),
      domain_id: k('slot', 'the domain slot, or null for tenant events', slotRef((row, ctx) => idOf(ctx.slots.domain, lifecycleSpecOf(row, ctx)?.domainSlot ?? null))),
      event: k('exact', "'tenant.created' | 'domain.created'", exactBy((row, ctx) => lifecycleSpecOf(row, ctx)?.event)),
      actor: k('exact', "'c18-admin' — the era actor argument", exact(P.lifecycleActor)),
      occurred_at: k('timestamp', 'equals the entity creation time', timestamp({ relations: [sameTimeAs((row, ctx) => lifecycleEntityOf(row, ctx)?.created_at, "the created entity's creation time")] })),
      details: k('exact', 'the entity name (and residency profile for tenants)', exactShapeBy((row, ctx) => lifecycleSpecOf(row, ctx)?.details)),
    }),
  }),
  'identity.bootstrap_claim': Object.freeze({
    rowsClaimedBy: 'bootstrap singleton',
    columns: Object.freeze({
      id: k('exact', 'the single-row identity, always 1', exact(P.bootstrapClaim.id)),
      principal_id: k('slot', 'the platform-admin slot', slotRef((row, ctx) => idOf(ctx.slots.principal, ctx.spec.admin.slot))),
      claimed_at: k('formula', 'the audited bootstrap event\'s landing instant', byModel('audit plan', (v, row, ctx) => ctx.bootstrapClaimTime(row, v))),
      nonce: k('exact', "0016's DDL default; the 0012-era claim predates the column", exact(null), { era: 'latest' }),
      consumed: k('exact', "0016's NOT NULL DEFAULT false; the era claim is never re-consumed", exact(false), { era: 'latest' }),
      consumed_at: k('exact', "0016's DDL default; the era claim records no consumption", exact(null), { era: 'latest' }),
    }),
  }),
  'identity.principals': Object.freeze({
    rowsClaimedBy: 'principal slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a principal slot', generatedId({ unique: true })),
      kind: k('exact', "'human'", exact(P.principal.kind)),
      scope: k('exact', 'the slot scope', exactBy((row, ctx) => principalSpecOf(row, ctx)?.scope)),
      tenant_id: k('slot', 'the slot tenancy', slotRef((row, ctx) => idOf(ctx.slots.tenant, principalSpecOf(row, ctx)?.tenantSlot ?? null))),
      domain_id: k('slot', 'the slot domain', slotRef((row, ctx) => idOf(ctx.slots.domain, principalSpecOf(row, ctx)?.domainSlot ?? null))),
      display_name: k('exact', 'equals the slot login name', exactBy((row, ctx) => principalSpecOf(row, ctx)?.loginName)),
      login_name: k('exact', 'the slot login name', exactBy((row, ctx) => principalSpecOf(row, ctx)?.loginName)),
      status: k('exact', "'active'", exact(P.principal.status)),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
      revocation_epoch: k('exact', '1 — no principal is revoked by the seed', exactBy((row, ctx) => (principalSpecOf(row, ctx)?.slot === ctx.spec.admin.slot ? P.principalRevocationEpoch.admin : P.principalRevocationEpoch.governed))),
    }),
  }),
  'identity.credentials': Object.freeze({
    rowsClaimedBy: 'credential plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid', generatedId({ unique: true })),
      principal_id: k('slot', 'the owning principal slot', slotRef((row, ctx) => (ctx.principalIds.has(row.principal_id) ? row.principal_id : null))),
      type: k('exact', "'password'", exact(P.credential.type)),
      secret_hash: k('digest', 'argon2id PHC: exact governed m/p/t, canonical base64, exact salt and tag lengths', phcArgon2id(SEED_ARGON2ID_PARAMS)),
      status: k('exact', "'active', plus exactly one 'rotated' bootstrap predecessor", oneOf([P.credential.activeStatus, P.credential.rotatedStatus])),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
      rotated_at: k('timestamp', 'set only on the rotated predecessor', credentialLifecycle('rotated_at')),
      expires_at: k('timestamp', 'set only on the rotated predecessor; 24h after a marking instant proved to lie inside a bounded causal interval, not at an exact time', credentialLifecycle('expires_at')),
    }),
  }),
  'identity.sessions': Object.freeze({
    rowsClaimedBy: 'session slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to a session slot', generatedId({ unique: true })),
      principal_id: k('slot', 'the owning principal slot', slotRef((row, ctx) => (ctx.principalIds.has(row.principal_id) ? row.principal_id : null))),
      assurance: k('exact', "'password'", exact(P.session.assurance)),
      status: k('exact', "'active'", exact(P.session.status)),
      refresh_token_hash: k('digest', 'sha-256 hex; equals its refresh token row', digest({ relatesTo: (row, ctx) => tokenOfSession(row, ctx)?.token_hash })),
      prev_refresh_token_hash: k('volatile', 'null — the seed never rotates a refresh token', volatileField({ allowed: [null], nullable: true })),
      context_key_hash: k('digest', 'sha-256 hex; generated per session and UNIQUE across sessions', digest({ unique: true })),
      issued_at: k('timestamp', 'inside the window; < expires_at', inSeedWindow({ relations: [tsBefore((row) => row.expires_at, 'its expiry')] })),
      expires_at: k('formula', 'exactly the source-governed session lifetime after issue',
        governedSeedLifetime(() => GOVERNED_LIFETIMES.sessionSeconds, 'session')),
      revoked_at: k('volatile', 'null — the seed revokes no session', volatileField({ allowed: [null], nullable: true })),
      bound_epoch: k('formula', "the owner's revocation epoch, plus the era binding offset", formula((row, ctx) => sessionOwner(row, ctx)?.revocation_epoch, "the owner's revocation epoch")),
      family_id: k('generated-id', 'uuid; equals its refresh token family', generatedId({ unique: true })),
    }),
  }),
  'identity.refresh_tokens': Object.freeze({
    rowsClaimedBy: 'session slots (one token per session)',
    columns: Object.freeze({
      id: k('generated-id', 'uuid', generatedId({ unique: true })),
      family_id: k('slot', "the session's family", slotRef((row, ctx) => sessionOf(row, ctx)?.family_id ?? null)),
      session_id: k('slot', 'the session slot', slotRef((row, ctx) => (ctx.sessionIds.has(row.session_id) ? row.session_id : null))),
      token_hash: k('digest', "equals the session's refresh_token_hash", digest({ relatesTo: (row, ctx) => sessionOf(row, ctx)?.refresh_token_hash })),
      generation: k('exact', '1 — the seed issues one generation', exact(P.refreshToken.generation)),
      issued_at: k('timestamp', "equals the session's issued_at", timestamp({ relations: [sameTimeAs((row, ctx) => sessionOf(row, ctx)?.issued_at, "its session's issue time")] })),
      invalidated_at: k('volatile', 'null', volatileField({ allowed: [null], nullable: true })),
      replaced_by: k('volatile', 'null', volatileField({ allowed: [null], nullable: true })),
      reuse_seen_at: k('volatile', 'null', volatileField({ allowed: [null], nullable: true })),
    }),
  }),
  'identity.role_bindings': Object.freeze({
    rowsClaimedBy: 'role-binding multiset',
    columns: Object.freeze({
      id: k('generated-id', 'uuid', generatedId({ unique: true })),
      principal_id: k('slot', 'the bound principal slot', slotRef((row, ctx) => (ctx.principalIds.has(row.principal_id) ? row.principal_id : null))),
      role_code: k('exact', "the slot's role", byModel('role-binding reconciliation', (v, row, ctx) => ctx.roleBindingField(row, 'role_code', v))),
      scope: k('exact', "the slot's scope", byModel('role-binding reconciliation', (v, row, ctx) => ctx.roleBindingField(row, 'scope', v))),
      tenant_id: k('slot', 'the slot tenancy', slotRef((row, ctx) => (row.tenant_id === null ? null : (ctx.tenantIds.has(row.tenant_id) ? row.tenant_id : null)))),
      domain_id: k('slot', 'the slot domain', slotRef((row, ctx) => (row.domain_id === null ? null : (ctx.domainIds.has(row.domain_id) ? row.domain_id : null)))),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
      revoked_at: k('exact', 'null — the seed revokes no binding', volatileField({ allowed: [null], nullable: true })),
      granted_by_principal: k('slot', 'the platform-admin slot, or null for its own grant', slotRef((row, ctx) => (row.granted_by_principal === null ? null : (ctx.principalIds.has(row.granted_by_principal) ? row.granted_by_principal : null)))),
      granted_by_scope: k('exact', "'PLATFORM'", byModel('role-binding reconciliation', (v, row, ctx) => ctx.roleBindingField(row, 'granted_by_scope', v))),
    }),
  }),
  'ctx.issued': Object.freeze({
    rowsClaimedBy: 'capability plan',
    columns: Object.freeze({
      nonce: k('generated-id', 'uuid; unique per capability', generatedId({ unique: true })),
      session_id: k('slot', 'the session slot that minted the capability, or null', slotRef((row, ctx) => ctx.capabilitySession(row))),
      op_class: k('exact', 'the capability class the plan assigns', exactBy((row, ctx) => ctx.capabilityOf(row)?.op_class)),
      bound_action: k('exact', 'the action the plan assigns', exactBy((row, ctx) => ctx.capabilityOf(row)?.bound_action)),
      issued_at: k('timestamp', 'inside the window; < expires_at', inSeedWindow({ relations: [tsBefore((row) => row.expires_at, 'its expiry')] })),
      expires_at: k('formula', 'exactly the source-governed capability lifetime after issue',
        governedSeedLifetime((row) => capabilityLifetimeSeconds(row.op_class), 'capability')),
      consumed_at: k('volatile', 'null — the era ports do not stamp consumption', exactBy((row, ctx) => ctx.capabilityOf(row)?.consumed_at ?? null)),
    }),
  }),
  'policy.policy_decisions': Object.freeze({
    rowsClaimedBy: 'operation plan',
    columns: Object.freeze({
      id: k('generated-id', 'uuid', generatedId({ unique: true })),
      scope: k('exact', 'the operation scope', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'scope', v))),
      action: k('exact', 'the operation action', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'action', v))),
      decision: k('exact', "'allow'", exact(D.decision)),
      reason: k('exact', 'the decision posture reason', exact(D.reason)),
      domain_id: k('slot', 'the operation domain', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'domain_id', v))),
      object_id: k('slot', 'the created entity', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'object_id', v))),
      tenant_id: k('slot', 'the operation tenant', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'tenant_id', v))),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
      expires_at: k('exact', 'null', volatileField({ allowed: [null], nullable: true })),
      purpose_id: k('exact', 'the decision posture purpose', exact(D.purpose_id)),
      environment: k('exact', 'empty', exactShape({})),
      object_type: k('exact', 'the operation object type', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'object_type', v))),
      obligations: k('exact', 'empty', exactShape([])),
      input_digest: k('formula', 'seedInputDigestSource', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'input_digest', v))),
      principal_id: k('slot', 'principal:<actor slot>', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'principal_id', v))),
      delegation_id: k('exact', 'null', volatileField({ allowed: [null], nullable: true })),
      evidence_only: k('exact', 'false', exact(D.evidence_only)),
      exception_ref: k('exact', 'null', volatileField({ allowed: [null], nullable: true })),
      bundle_version: k('exact', 'the decision posture bundle', exact(D.bundle_version)),
      correlation_id: k('generated-id', 'uuid; shared with the closing audit event', generatedId({ unique: true })),
      revocation_state: k('exact', "'none'", exact(D.revocation_state)),
      consequence_class: k('exact', 'the operation consequence', byModel('operation plan', (v, row, ctx) => ctx.decisionField(row, 'consequence_class', v))),
    }),
  }),
  'audit.audit_events': Object.freeze({
    rowsClaimedBy: 'audit-event plan',
    columns: Object.freeze({
      partition_id: k('exact', 'the plan partition', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'partition_id', v))),
      audit_seq: k('formula', 'chain position', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'audit_seq', v))),
      event_jcs: k('formula', 'canonical JCS of the planned body', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'event_jcs', v))),
      event: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'event', v))),
      scope: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'scope', v))),
      tenant_id: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'tenant_id', v))),
      domain_id: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'domain_id', v))),
      event_type: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'event_type', v))),
      outcome: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'outcome', v))),
      actor: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'actor', v))),
      action: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'action', v))),
      result_code: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'result_code', v))),
      correlation_id: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'correlation_id', v))),
      occurred_at: k('formula', 'generated from event_jcs', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'occurred_at', v))),
      previous_hash: k('digest', 'the preceding row hash, or genesis', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'previous_hash', v))),
      row_hash: k('digest', 'production auditRowHash', byModel('audit plan', (v, row, ctx) => ctx.auditField(row, 'row_hash', v))),
      hash_alg_version: k('exact', "'eye-audit-v1'", exact(A.hash_alg_version)),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
    }),
  }),
  'audit.audit_chain_heads': Object.freeze({
    rowsClaimedBy: 'audit-event plan',
    columns: Object.freeze({
      partition_id: k('exact', 'the plan partition', byModel('audit plan', (v, row, ctx) => ctx.headField(row, 'partition_id', v))),
      next_seq: k('formula', 'the planned event count plus one', byModel('audit plan', (v, row, ctx) => ctx.headField(row, 'next_seq', v))),
      head_hash: k('digest', 'the last planned row hash', byModel('audit plan', (v, row, ctx) => ctx.headField(row, 'head_hash', v))),
      frozen: k('exact', 'false', exact(A.headFrozen)),
      updated_at: k('formula', "its last event's landing instant", byModel('audit plan', (v, row, ctx) => ctx.headField(row, 'updated_at', v))),
    }),
  }),
  'objects.canonical_objects': Object.freeze({
    rowsClaimedBy: 'object slots',
    columns: Object.freeze({ /* the complete header is owned by seedObjectHeader */ }),
    columnsOwnedBy: 'seedObjectHeader + seedObjectPayload + canonicalHeaderDigest',
  }),
  'objects.object_outbox': Object.freeze({
    rowsClaimedBy: 'outbox slots',
    columns: Object.freeze({
      id: k('generated-id', 'uuid; bound to an outbox slot', generatedId({ unique: true })),
      scope: k('exact', 'the slot scope', exactBy((row, ctx) => outboxSpecOf(row, ctx)?.scope)),
      status: k('exact', 'the slot status', exactBy((row, ctx) => outboxSpecOf(row, ctx)?.status)),
      payload: k('exact', 'seedOutboxPayload', exactShapeBy((row, ctx) => { const s = outboxSpecOf(row, ctx); return s === undefined ? undefined : seedOutboxPayload(s); })),
      attempts: k('exact', '1', exactBy((row, ctx) => outboxSpecOf(row, ctx)?.attempts)),
      lease_id: k('generated-id', 'a uuid lease exactly on the pending-after-lease slot, else null', (v, row, ctx) => {
        const spec = outboxSpecOf(row, ctx);
        if (spec === undefined) return [];
        const leased = spec.lifecycle === 'pending-after-lease';
        if (!leased) {
          return (v ?? null) === null ? []
            : [`is ${JSON.stringify(v)} on the '${spec.lifecycle}' slot, which is never leased`];
        }
        if (typeof v !== 'string' || !helpers.UUID_RE.test(v)) {
          return [`is ${JSON.stringify(v)}; the leased slot carries a generated uuid lease`];
        }
        return [];
      }),
      domain_id: k('slot', 'the slot domain', slotRef((row, ctx) => idOf(ctx.slots.domain, outboxSpecOf(row, ctx)?.domainSlot ?? null))),
      tenant_id: k('slot', 'the slot tenant', slotRef((row, ctx) => idOf(ctx.slots.tenant, outboxSpecOf(row, ctx)?.tenantSlot ?? null))),
      created_at: k('timestamp', 'inside the governed seeding window', inSeedWindow({})),
      event_type: k('exact', 'the slot event type', exactBy((row, ctx) => outboxSpecOf(row, ctx)?.eventType)),
      causation_id: k('generated-id', 'uuid', generatedId({})),
      leased_until: k('timestamp', 'present only on the pending-after-lease slot', timestamp({ nullable: true, relations: [notBefore((row) => row.created_at, 'its creation time')] })),
      published_at: k('timestamp', 'present only on the published slot', timestamp({ nullable: true, relations: [notBefore((row) => row.created_at, 'its creation time')] })),
      correlation_id: k('formula', "its OWN enqueue decision's correlation", byModel('operation plan', (v, row, ctx) => ctx.outboxCorrelation(row, v))),
    }),
  }),
});

/** Tables whose columns are owned by a dedicated model rather than a per-column map. */
export const COLUMN_MODEL_TABLES = Object.freeze(
  Object.entries(SEED_COVERAGE).filter(([, v]) => v.columnsOwnedBy !== undefined).map(([t]) => t),
);

/**
 * The seed-affected table universe, DERIVED from an authenticated delta: any table whose rows
 * differ between the pre-seed and post-seed snapshots was written by the governed seed.
 */
export function deriveSeedAffectedTables(preseed, before) {
  const affected = [];
  const stable = (v) => JSON.stringify(v);
  for (const [table, after] of Object.entries(before.tables ?? {})) {
    const prior = preseed.tables?.[table];
    if (prior === undefined) { affected.push(table); continue; }
    if (stable(prior.rows) !== stable(after.rows)) affected.push(table);
  }
  return affected.sort();
}

/**
 * Judge the coverage contract against the authenticated delta and the delivered catalog: no
 * seed-affected table may be missing, no column unclassified, and no coverage entry may name a
 * table or column that does not exist.
 */
export function verifySeedCoverage({ preseed, before, latest = null, coverage = SEED_COVERAGE }) {
  const problems = [];
  const affected = deriveSeedAffectedTables(preseed, before);
  const covered = Object.keys(coverage).sort();
  for (const t of affected) {
    if (!covered.includes(t)) {
      problems.push(`seed coverage: the governed seed writes '${t}', which the coverage contract does not classify`);
    }
  }
  for (const t of covered) {
    if (!affected.includes(t)) {
      problems.push(`seed coverage: the contract classifies '${t}', which the authenticated pre-seed delta shows the seed does not write`);
    }
  }
  for (const [table, spec] of Object.entries(coverage)) {
    const delivered = before.tables?.[table];
    if (delivered === undefined) {
      problems.push(`seed coverage: contract table '${table}' is absent from the delivered snapshot`);
      continue;
    }
    if (spec.columnsOwnedBy !== undefined) continue; // owned by a dedicated model
    const catalogColumns = delivered.columns ?? [];
    for (const c of catalogColumns) {
      const entry = spec.columns[c];
      if (entry === undefined) {
        problems.push(`seed coverage: column '${table}.${c}' is UNCLASSIFIED`);
      } else if (!COVERAGE_KINDS.includes(entry.kind)) {
        problems.push(`seed coverage: column '${table}.${c}' carries unknown kind ${JSON.stringify(entry.kind)}`);
      }
    }
    // C18.1.9 — NO BLANKET EXEMPTION. 77489f5 allowed ANY classified 'exact' or 'volatile' column
    // to be absent from the delivered catalog, so dropping the column a rule was written for
    // silenced that rule instead of raising a finding. The only legitimate absence is a column
    // the contract explicitly declares as belonging to a LATER era, and that declaration is
    // itself checked against both catalogs below.
    const latestColumns = latest === null ? null : (latest.tables?.[table]?.columns ?? []);
    for (const [c, entry] of Object.entries(spec.columns)) {
      if (typeof entry.rule !== 'function') {
        problems.push(`seed coverage: column '${table}.${c}' is classified but carries no executable rule`);
      }
      if (entry.era === 'latest') {
        if (catalogColumns.includes(c)) {
          problems.push(`seed coverage: '${table}.${c}' is declared a later-era column, but the seed-era catalog already has it`);
        }
        if (latestColumns !== null && !latestColumns.includes(c)) {
          problems.push(`seed coverage: '${table}.${c}' is declared a later-era column, but the upgraded catalog does not have it either`);
        }
      } else if (!catalogColumns.includes(c)) {
        problems.push(`seed coverage: the contract classifies '${table}.${c}', which the delivered catalog does not have`);
      }
    }
  }
  return { affected, problems };
}

/** The machine-readable coverage report carried in the evidence package. */
export function buildCoverageReport({ preseed, before, latest = null, coverage = SEED_COVERAGE }) {
  const { affected } = verifySeedCoverage({ preseed, before, latest, coverage });
  return {
    derived_from: 'authenticated pre-seed to post-seed delta',
    seed_affected_tables: affected,
    tables: Object.fromEntries(Object.entries(coverage).map(([table, spec]) => [table, {
      rows_claimed_by: spec.rowsClaimedBy,
      ...(spec.columnsOwnedBy === undefined
        // C18.1.9 — each column publishes its kind AND the fact that an executable rule is
        // registered for it. The registry meta-control proves the flag is not a claim.
        ? {
          columns: Object.fromEntries(Object.entries(spec.columns).map(([c, e]) => [c, {
            kind: e.kind, era: e.era, executable_rule: typeof e.rule === 'function',
            source_owned_value: e.rule?.opaque !== true,
          }])),
        }
        : { columns_owned_by: spec.columnsOwnedBy }),
    }])),
  };
}


/**
 * C18.1.9 — THE STRUCTURAL META-CONTROL. Three independently-derived sets must be EXACTLY equal:
 *   1. the columns the delivered catalog actually has,
 *   2. the columns the coverage contract classifies, and
 *   3. the columns for which an executable rule is registered.
 * A classification without a rule, a rule without a catalog column, or a catalog column without
 * either, is a finding. This is what makes the published `seed-coverage.json` a statement about
 * what the verifier EXECUTES rather than a description of what it intends.
 */
export function verifyCoverageRegistry({ before, coverage = SEED_COVERAGE, registered, era = 'seed' }) {
  // `registered` must be the registration list for THIS era (see registeredColumns).
  const problems = [];
  const catalog = [];
  const classified = [];
  for (const [table, spec] of Object.entries(coverage)) {
    if (spec.columnsOwnedBy !== undefined) continue;
    for (const c of before.tables?.[table]?.columns ?? []) catalog.push(`${table}.${c}`);
    // C18.1.10 — the equality is stated PER ERA and is literal within it. The seed-era catalog
    // excludes later-era columns because they do not exist there; the upgraded catalog includes
    // them, so nothing is permanently exempt from registration.
    for (const [c, e] of Object.entries(spec.columns)) {
      if (era === 'latest' || e.era !== 'latest') classified.push(`${table}.${c}`);
    }
  }
  catalog.sort(); classified.sort();
  const reg = [...registered].sort();
  const diff = (a, b, whatA, whatB) => {
    for (const x of a) {
      if (!b.includes(x)) problems.push(`coverage registry: '${x}' is ${whatA} but not ${whatB}`);
    }
  };
  diff(catalog, classified, 'in the delivered catalog', 'classified by the coverage contract');
  diff(classified, catalog, 'classified by the coverage contract', 'in the delivered catalog');
  diff(classified, reg, 'classified by the coverage contract', 'registered as an executable rule');
  diff(reg, classified, 'registered as an executable rule', 'classified by the coverage contract');
  return { problems, catalog, classified, registered: reg };
}


/**
 * C18.1.10 — THE DEDICATED-MODEL COVERAGE PROOF.
 *
 * `objects.canonical_objects` is authenticated by a dedicated semantic model rather than a
 * per-column map, and 53a4eec simply excluded it from the registry equality while still reporting
 * the registry as complete. That is now proven instead of assumed: the exact set of columns the
 * model authenticates is derived from the model itself and must EQUAL the delivered catalog, with
 * no column skipped on either side. It is reported separately from the per-column registry so the
 * two claims stay distinguishable.
 */
export function modelCoveredColumns() {
  // Every header field the source-owned builder writes, plus the two columns the model derives.
  const header = seedObjectHeader({
    objectId: 'x', tenantId: 'x', domainId: 'x', correlation: 'x', spec: SEED_OBJECTS[0],
  });
  return [...Object.keys(header), 'payload', 'content_digest'].sort();
}

export function verifyModelCoverage({ before, coverage = SEED_COVERAGE }) {
  const problems = [];
  const proofs = [];
  for (const [table, spec] of Object.entries(coverage)) {
    if (spec.columnsOwnedBy === undefined) continue;
    const catalog = [...(before.tables?.[table]?.columns ?? [])].sort();
    const modelled = modelCoveredColumns();
    for (const c of catalog) {
      if (!modelled.includes(c)) {
        problems.push(`model coverage: '${table}.${c}' is in the delivered catalog but the `
          + `'${spec.columnsOwnedBy}' model does not authenticate it`);
      }
    }
    for (const c of modelled) {
      if (!catalog.includes(c)) {
        problems.push(`model coverage: the '${spec.columnsOwnedBy}' model authenticates `
          + `'${table}.${c}', which the delivered catalog does not have`);
      }
    }
    proofs.push({ table, model: spec.columnsOwnedBy, columns: catalog.length });
  }
  return { problems, proofs };
}
