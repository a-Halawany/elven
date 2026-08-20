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
    admittedByPrincipalSlot: 'alpha-admin',
  }),
  Object.freeze({
    slot: 'claim-2', subject: 'c18-claim-2', objectType: 'CLM', objectVersion: '1',
    lifecycleState: 'admitted', tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0',
    admittedByPrincipalSlot: 'alpha-admin',
  }),
]);

/** Outbox effects: event type, terminal status and tenancy topology. */
export const SEED_OUTBOX = Object.freeze([
  Object.freeze({
    slot: 'outbox-published', eventType: 'c18.seed.published', status: 'published',
    tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0', scope: 'DOMAIN',
  }),
  Object.freeze({
    slot: 'outbox-pending', eventType: 'c18.seed.pending', status: 'pending',
    tenantSlot: 'tenant-alpha', domainSlot: 'alpha-dom0', scope: 'DOMAIN',
  }),
]);

/**
 * The deterministic policy decisions the governed seed writes, as an exact multiset of
 * (action, consequence_class, object_type) — the observable, non-generated part of each row.
 */
export const SEED_DECISIONS = Object.freeze([
  Object.freeze({ action: 'tenancy.tenant.create', consequence: 'C2', objectType: 'tenancy.tenant', count: 2 }),
  Object.freeze({ action: 'tenancy.domain.create', consequence: 'C2', objectType: 'tenancy.domain', count: 3 }),
  Object.freeze({ action: 'identity.principal.create', consequence: 'C2', objectType: 'identity.principal', count: 3 }),
  Object.freeze({ action: 'objects.create', consequence: 'C2', objectType: 'CLM', count: 2 }),
  Object.freeze({ action: 'objects.create', consequence: 'C1', objectType: 'outbox', count: 2 }),
]);

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
  sessions: SEED_SESSIONS, objects: SEED_OBJECTS, outbox: SEED_OUTBOX, decisions: SEED_DECISIONS,
  stepSlots: SEED_STEP_SLOTS,
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
  decisions: SEED_DECISIONS.reduce((n, d) => n + d.count, 0),
  role_bindings: SEED_PRINCIPALS.length + 1,
  revoked_role_bindings: 0,
});

/** Lookup helpers used by the seeder and the verifier alike. */
export const tenantSpec = (slot) => SEED_TENANTS.find((t) => t.slot === slot);
export const domainSpec = (slot) => SEED_DOMAINS.find((d) => d.slot === slot);
export const principalSpec = (slot) => (slot === SEED_ADMIN.slot ? SEED_ADMIN : SEED_PRINCIPALS.find((p) => p.slot === slot));
