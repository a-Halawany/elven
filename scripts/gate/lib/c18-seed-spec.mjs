/**
 * C18.1.6 — THE SOURCE-OWNED DETERMINISTIC SEED SPECIFICATION.
 *
 * 8362cba fixed the seed's exact QUANTITIES, but several deterministic VALUES were only ever
 * checked for agreement between the seed record and the snapshots. Renaming a tenant, a domain
 * or a non-admin principal consistently across every record still reconciled, because nothing in
 * source stated what those names had to be.
 *
 * This module is the single source of truth for every deterministic, non-generated part of the
 * governed 0012-era seed. The SEEDER writes from it and the VERIFIER judges against it, so there
 * is exactly one place where the seed's semantics live. Generated values — UUIDs, correlations,
 * password hashes, context keys, timestamps — remain variable, and are bound to these named
 * SLOTS at verification time.
 */

/** Deterministic tenant slots, in creation order. */
export const SEED_TENANTS = Object.freeze([
  Object.freeze({ slot: 'tenant-alpha', name: 'c18-tenant-alpha' }),
  Object.freeze({ slot: 'tenant-beta', name: 'c18-tenant-beta' }),
]);

/** Domains are named `<tenant name>-dom<index>` and belong to the tenant slot that made them. */
export const SEED_DOMAINS = Object.freeze([
  Object.freeze({ slot: 'alpha-dom0', name: 'c18-tenant-alpha-dom0', tenantSlot: 'tenant-alpha' }),
  Object.freeze({ slot: 'alpha-dom1', name: 'c18-tenant-alpha-dom1', tenantSlot: 'tenant-alpha' }),
  Object.freeze({ slot: 'beta-dom0', name: 'c18-tenant-beta-dom0', tenantSlot: 'tenant-beta' }),
]);

/** The audited single-use bootstrap principal. */
export const SEED_ADMIN = Object.freeze({
  slot: 'platform-admin', loginName: 'platform-admin', kind: 'human',
  scope: 'PLATFORM', role: 'platform_admin', tenantSlot: null, domainSlot: null,
});

/** Governed principals minted through the identity authority, in creation order. */
export const SEED_PRINCIPALS = Object.freeze([
  Object.freeze({
    slot: 'alpha-admin', loginName: 'c18-alpha-admin', kind: 'human', scope: 'TENANT',
    role: 'tenant_admin', tenantSlot: 'tenant-alpha', domainSlot: null,
  }),
  Object.freeze({
    slot: 'alpha-analyst', loginName: 'c18-alpha-analyst', kind: 'human', scope: 'DOMAIN',
    role: 'domain_analyst', tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0',
  }),
  Object.freeze({
    slot: 'beta-admin', loginName: 'c18-beta-admin', kind: 'human', scope: 'TENANT',
    role: 'tenant_admin', tenantSlot: 'tenant-beta', domainSlot: null,
  }),
]);

/** Sessions, by the principal slot that owns each one. */
export const SEED_SESSIONS = Object.freeze([
  Object.freeze({ slot: 'admin-session', principalSlot: 'platform-admin', assurance: 'password' }),
  Object.freeze({ slot: 'alpha-admin-session', principalSlot: 'alpha-admin', assurance: 'password' }),
]);

/** Canonical objects: deterministic subject, type and tenancy placement. */
export const SEED_OBJECTS = Object.freeze([
  Object.freeze({
    slot: 'claim-1', subject: 'c18-claim-1', objectType: 'CLM', objectVersion: '1',
    lifecycleState: 'admitted', tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0',
    admittedByPrincipalSlot: 'alpha-admin', admittedBySessionSlot: 'alpha-admin-session',
  }),
  Object.freeze({
    slot: 'claim-2', subject: 'c18-claim-2', objectType: 'CLM', objectVersion: '1',
    lifecycleState: 'admitted', tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0',
    admittedByPrincipalSlot: 'alpha-admin', admittedBySessionSlot: 'alpha-admin-session',
  }),
]);

/**
 * C18.1.7 — the DETERMINISTIC CANONICAL-OBJECT HEADER, owned here rather than written as
 * literals inside the seeder. Only the generated identity fields (object/tenant/domain ids and
 * the audit correlation) are supplied per admission; every other field is fixed by the
 * specification, so the verifier can rebuild the exact admitted header and recompute its
 * content digest with the production canonicalizer.
 */
export const SEED_OBJECT_SCOPE = 'DOMAIN';
export const seedObjectHeader = ({ objectId, tenantId, domainId, correlation, spec }) => ({
  object_id: objectId, object_type: spec.objectType, tenant_id: tenantId, domain_id: domainId,
  scope: SEED_OBJECT_SCOPE, object_version: spec.objectVersion, lifecycle_state: spec.lifecycleState,
  owning_component: 'CP-OBJ-01', accountable_owner: 'principal:c18-seed', source_object_ids: [],
  event_time: null, observation_time: '2026-08-01T00:00:00.000Z', valid_from: null, valid_to: null,
  recorded_at: '2026-08-01T00:00:00.000Z', time_precision: 'exact',
  source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: false,
  confidence: null, uncertainty: null, evidence_refs: ['evd:c18-seed'], provenance_ref: null,
  method_ref: null, contradiction_refs: [], corroboration_refs: [], human_refs: [],
  classification: 'internal', purpose_scope: 'c18-era-seed', rights_profile: null,
  residency_profile: null, retention_profile: null, access_policy_ref: null,
  quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
  ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
  audit_correlation_id: correlation, content_ref: null,
});
/** The deterministic payload admitted for an object slot. */
export const seedObjectPayload = (spec) => ({
  subject: spec.subject, predicate: 'asserts', object_value: `v-${spec.subject}`,
});
/** The deterministic outbox payload for an outbox slot. */
export const seedOutboxPayload = (spec) => ({ seed: 'c18', event: spec.eventType });

/** Outbox effects: event type, terminal status and tenancy topology. */
export const SEED_OUTBOX = Object.freeze([
  Object.freeze({
    slot: 'outbox-published', eventType: 'c18.seed.published', status: 'published',
    tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0', scope: 'DOMAIN',
    attempts: 1, lifecycle: 'published',
    enqueuedByPrincipalSlot: 'alpha-admin', enqueuedBySessionSlot: 'alpha-admin-session',
  }),
  Object.freeze({
    slot: 'outbox-pending', eventType: 'c18.seed.pending', status: 'pending',
    tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0', scope: 'DOMAIN',
    attempts: 1, lifecycle: 'pending-after-lease',
    enqueuedByPrincipalSlot: 'alpha-admin', enqueuedBySessionSlot: 'alpha-admin-session',
  }),
]);

/**
 * The deterministic policy decisions the governed seed writes, as an exact multiset of
 * (action, consequence_class, object_type) — the observable, non-generated part of each row.
 */
/**
 * THE SOURCE-OWNED OPERATION PLAN (C18.1.7). dccfcf26 checked only an aggregate
 * (action, consequence, object_type) multiset, so a decision could be flipped from allow to deny
 * — or re-scoped, re-tenanted, or detached from its audit event — and still reconcile. Every
 * governed seed operation is now named, with the entity SLOT it creates, the actor and session
 * slots that performed it, and its scope and tenancy topology. Each entry authenticates exactly
 * one policy decision and exactly one closing audit event.
 */
export const SEED_OPERATIONS = Object.freeze([
  ...SEED_TENANTS.map((t) => Object.freeze({
    action: 'tenancy.tenant.create', consequence: 'C2', objectType: 'tenancy.tenant',
    entityKind: 'tenant', entitySlot: t.slot, scope: 'PLATFORM',
    tenantSlot: null, domainSlot: null,
    actorSlot: 'platform-admin', sessionSlot: 'admin-session',
    targetType: 'tenancy.tenant', auditEventType: 'api.request',
  })),
  ...SEED_DOMAINS.map((d) => Object.freeze({
    action: 'tenancy.domain.create', consequence: 'C2', objectType: 'tenancy.domain',
    entityKind: 'domain', entitySlot: d.slot, scope: 'PLATFORM',
    tenantSlot: null, domainSlot: null,
    actorSlot: 'platform-admin', sessionSlot: 'admin-session',
    targetType: 'tenancy.domain', auditEventType: 'api.request',
  })),
  ...SEED_PRINCIPALS.map((p) => Object.freeze({
    action: 'identity.principal.create', consequence: 'C2', objectType: 'identity.principal',
    entityKind: 'principal', entitySlot: p.slot, scope: 'PLATFORM',
    tenantSlot: null, domainSlot: null,
    actorSlot: 'platform-admin', sessionSlot: 'admin-session',
    targetType: 'identity.principal', auditEventType: 'api.request',
  })),
  ...SEED_OBJECTS.map((o) => Object.freeze({
    action: 'objects.create', consequence: 'C2', objectType: o.objectType,
    entityKind: 'object', entitySlot: o.slot, scope: SEED_OBJECT_SCOPE,
    tenantSlot: o.tenantSlot, domainSlot: o.domainSlot,
    actorSlot: o.admittedByPrincipalSlot, sessionSlot: o.admittedBySessionSlot,
    targetType: o.objectType, auditEventType: 'api.request',
  })),
  ...SEED_OUTBOX.map((o) => Object.freeze({
    action: 'objects.create', consequence: 'C1', objectType: 'outbox',
    entityKind: 'outbox', entitySlot: o.slot, scope: o.scope,
    tenantSlot: o.tenantSlot, domainSlot: o.domainSlot,
    actorSlot: o.enqueuedByPrincipalSlot, sessionSlot: o.enqueuedBySessionSlot,
    targetType: 'outbox', auditEventType: 'api.request',
  })),
]);

/** Deterministic, non-generated decision posture shared by every governed seed operation. */
export const SEED_DECISION_POSTURE = Object.freeze({
  decision: 'allow', evidence_only: false, revocation_state: 'none',
  purpose_id: 'c18-era-seed', reason: 'C18 era seed', bundle_version: 'bundle-v1',
  delegation_id: null, exception_ref: null, expires_at: null,
  obligations: [], environment: {},
});
/** The deterministic audit posture of every governed seed operation. */
export const SEED_AUDIT_POSTURE = Object.freeze({
  event_type: 'api.request', outcome: 'success', result_code: 'OK',
  context_mode: 'authority', policy_version: 'bundle-v1', purpose_id: 'c18-era-seed',
  causation_id: null, delegation_id: null, trace_id: null, request_digest: null,
  target_version: null, metadata: {},
});
/** The source-owned input-digest formula each governed seed decision records. */
export const seedInputDigestSource = (op, entityId) => (op.entityKind === 'principal'
  ? `c18:principal:${entityId}`
  : `c18:${op.action}:${op.targetType}:${entityId}`);

/** Which identity SLOTS each governed step produces. */
export const SEED_STEP_SLOTS = Object.freeze({
  bootstrap: Object.freeze(['platform-admin']),
  'credential-rotation': Object.freeze(['platform-admin']),
  'admin-session': Object.freeze(['admin-session']),
  'tenants-domains': Object.freeze(['tenant-alpha', 'tenant-beta', 'alpha-dom0', 'alpha-dom1', 'beta-dom0']),
  principals: Object.freeze(['alpha-admin', 'alpha-analyst', 'beta-admin']),
  'tenant-session': Object.freeze(['alpha-admin-session']),
  'canonical-objects': Object.freeze(['claim-1', 'claim-2']),
  'outbox-enqueue': Object.freeze(['outbox-published', 'outbox-pending']),
  'outbox-publish': Object.freeze(['outbox-published']),
});

/** The whole specification, for callers that want one object. */
export const C18_SEED_SPEC = Object.freeze({
  tenants: SEED_TENANTS, domains: SEED_DOMAINS, admin: SEED_ADMIN, principals: SEED_PRINCIPALS,
  sessions: SEED_SESSIONS, objects: SEED_OBJECTS, outbox: SEED_OUTBOX,
  operations: SEED_OPERATIONS, decisionPosture: SEED_DECISION_POSTURE,
  auditPosture: SEED_AUDIT_POSTURE, stepSlots: SEED_STEP_SLOTS,
  // C18.1.8 — base-row posture, lifecycle, capability and exact audit-world plans. These are
  // attached lazily below because they are declared after this object.
});
/** C18.1.8 additions, attached after declaration so the specification stays one object. */
export const withC1818 = (base) => Object.freeze({
  ...base,
  basePosture: SEED_BASE_POSTURE,
  lifecycleEvents: SEED_LIFECYCLE_EVENTS,
  capabilities: SEED_CAPABILITIES,
  standaloneAuditEvents: SEED_STANDALONE_AUDIT_EVENTS,
  auditEventCount: SEED_AUDIT_EVENT_COUNT,
});

/** Exact cardinalities DERIVED from the specification — never independently maintained. */
export const SEED_CARDINALITIES = Object.freeze({
  tenants: SEED_TENANTS.length,
  domains: SEED_DOMAINS.length,
  principals: SEED_PRINCIPALS.length + 1,
  sessions: SEED_SESSIONS.length,
  objects: SEED_OBJECTS.length,
  outbox: SEED_OUTBOX.length,
  outbox_published: SEED_OUTBOX.filter((o) => o.status === 'published').length,
  outbox_pending: SEED_OUTBOX.filter((o) => o.status === 'pending').length,
  decisions: SEED_OPERATIONS.length,
  role_bindings: SEED_PRINCIPALS.length + 1,
  revoked_role_bindings: 0,
});

/** Lookup helpers used by the seeder and the verifier alike. */
export const tenantSpec = (slot) => SEED_TENANTS.find((t) => t.slot === slot);
export const domainSpec = (slot) => SEED_DOMAINS.find((d) => d.slot === slot);
export const principalSpec = (slot) => (slot === SEED_ADMIN.slot ? SEED_ADMIN : SEED_PRINCIPALS.find((p) => p.slot === slot));

/**
 * C18.1.8 — the DETERMINISTIC BASE POSTURE of every seeded row, and the exact audit-event plan.
 *
 * bfc8695 owned names, placement and per-operation decisions, but never the base-row posture
 * (status, profiles, revocation epoch, lifecycle timestamps) nor the audit world's exact
 * membership. Both are stated here.
 */
export const SEED_BASE_POSTURE = Object.freeze({
  tenant: Object.freeze({ status: 'active', residency_profile: 'default', retention_profile: 'default' }),
  domain: Object.freeze({ status: 'active', residency_profile: 'local-dev', retention_profile: 'default' }),
  // The FORCED bootstrap rotation bumps the admin's revocation epoch to 2; every governed
  // principal the seed mints afterwards is created at 1 and never revoked.
  principal: Object.freeze({ kind: 'human', status: 'active' }),
  principalRevocationEpoch: Object.freeze({ admin: 2, governed: 1 }),
  session: Object.freeze({ assurance: 'password', status: 'active', revoked_at: null, prev_refresh_token_hash: null }),
  refreshToken: Object.freeze({ generation: 1, invalidated_at: null, replaced_by: null, reuse_seen_at: null }),
  credential: Object.freeze({ type: 'password', activeStatus: 'active', rotatedStatus: 'rotated' }),
  bootstrapClaim: Object.freeze({ id: 1 }),
  lifecycleActor: 'c18-admin',
});

/** The tenancy lifecycle events the governed seed writes, one per created entity. */
export const SEED_LIFECYCLE_EVENTS = Object.freeze([
  ...SEED_TENANTS.map((t) => Object.freeze({
    event: 'tenant.created', scope: 'TENANT', entityKind: 'tenant', entitySlot: t.slot,
    tenantSlot: t.slot, domainSlot: null,
    details: Object.freeze({ name: t.name, residency_profile: 'default' }),
  })),
  ...SEED_DOMAINS.map((d) => Object.freeze({
    event: 'domain.created', scope: 'DOMAIN', entityKind: 'domain', entitySlot: d.slot,
    tenantSlot: d.tenantSlot, domainSlot: d.slot,
    details: Object.freeze({ name: d.name }),
  })),
]);

/**
 * Every capability the governed seed mints, by class and bound action. One row per governed
 * operation, plus the bootstrap, rotation, session-open and publish capabilities.
 */
export const SEED_CAPABILITIES = Object.freeze([
  Object.freeze({ op_class: 'bootstrap', bound_action: 'identity.bootstrap.platform_admin', sessionSlot: null, count: 1 }),
  Object.freeze({ op_class: 'identity', bound_action: 'identity.credential.rotate', sessionSlot: null, count: 1 }),
  Object.freeze({ op_class: 'identity', bound_action: 'identity.session.create', sessionSlot: null, count: SEED_SESSIONS.length }),
  Object.freeze({ op_class: 'C2', bound_action: 'tenancy.tenant.create', sessionSlot: 'admin-session', count: SEED_TENANTS.length }),
  Object.freeze({ op_class: 'C2', bound_action: 'tenancy.domain.create', sessionSlot: 'admin-session', count: SEED_DOMAINS.length }),
  Object.freeze({ op_class: 'C2', bound_action: 'identity.principal.create', sessionSlot: 'admin-session', count: SEED_PRINCIPALS.length }),
  Object.freeze({ op_class: 'C2', bound_action: 'objects.create', sessionSlot: 'alpha-admin-session', count: SEED_OBJECTS.length }),
  Object.freeze({ op_class: 'C1', bound_action: 'objects.create', sessionSlot: 'alpha-admin-session', count: SEED_OUTBOX.length }),
  Object.freeze({ op_class: 'outbox', bound_action: 'objects.outbox.publish', sessionSlot: null, count: 1 }),
]);

/**
 * The NON-DECISION audit events: the audited single-use bootstrap and the forced credential
 * rotation. Together with the twelve operation-plan closers these are the EXACT Path-A seeded
 * audit world — no floor, no minimum.
 */
export const SEED_STANDALONE_AUDIT_EVENTS = Object.freeze([
  Object.freeze({
    slot: 'bootstrap-event', event_type: 'admin.bootstrap',
    action: 'identity.bootstrap.platform_admin', scope: 'PLATFORM', context_mode: 'bootstrap',
    actorSlot: 'platform-admin', sessionSlot: null, target_type: 'SES', targetIsActor: false,
    outcome: 'success', result_code: 'OK', purpose_id: 'authentication',
    metadata: Object.freeze({ note: 'C18 path-A era seed: audited single-use bootstrap' }),
    partition: 'platform',
  }),
  Object.freeze({
    slot: 'rotation-event', event_type: 'identity.credential',
    action: 'identity.credential.rotate', scope: 'PLATFORM', context_mode: 'identity_op',
    actorSlot: 'platform-admin', sessionSlot: null, target_type: 'SES', targetIsActor: false,
    outcome: 'success', result_code: 'OK', purpose_id: 'authentication',
    metadata: Object.freeze({}), partition: 'platform',
  }),
]);

/** The exact seeded audit-event count: twelve operation closers plus the standalone events. */
export const SEED_AUDIT_EVENT_COUNT = SEED_OPERATIONS.length + SEED_STANDALONE_AUDIT_EVENTS.length;


/** The complete specification, including the C18.1.8 posture and plans. */
export const C18_SEED_SPEC_FULL = withC1818(C18_SEED_SPEC);
