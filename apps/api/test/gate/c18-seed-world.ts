/**
 * C18.1.9 — A GENERATED, SPECIFICATION-CONFORMANT SEEDED WORLD.
 *
 * The coverage registry claims an executable rule for every seeded column. Proving that claim
 * needs a world the whole registry accepts, so that mutating ONE column at a time shows each rule
 * actually fires. This builder derives that world from the same source-owned specification the
 * seeder and verifier use — the column set comes from the registry itself, so a column added to
 * the contract without a value here fails loudly rather than going unexercised.
 */
import { createHash } from 'node:crypto';
import { auditRowHash, jcsCanonicalize } from '@eye/contracts';
import {
  CAPABILITY_SESSIONLESS_ID, SEED_ADMIN, SEED_AUDIT_POSTURE, SEED_BASE_POSTURE,
  SEED_CAPABILITIES, SEED_CREDENTIAL_LIFECYCLE, SEED_DECISION_POSTURE, SEED_DOMAINS,
  SEED_LIFECYCLE_EVENTS, SEED_OBJECTS, SEED_OPERATIONS, SEED_OUTBOX, SEED_PRINCIPALS,
  SEED_SESSIONS, SEED_STANDALONE_AUDIT_EVENTS, SEED_TENANTS, seedInputDigestSource,
  seedOutboxPayload,
} from '../../../../scripts/gate/lib/c18-seed-spec.mjs';
import { SEED_COVERAGE, modelCoveredColumns } from '../../../../scripts/gate/lib/c18-seed-coverage.mjs';

const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
const u = (n: string) => `aaaaaaaa-${n.padStart(4, '0').slice(0, 4)}-4aaa-8aaa-aaaaaaaaaaaa`;
const hex = (c: string) => c.repeat(64);

const BASE = Date.parse('2026-08-01T00:00:00.000Z');
/** Distinct, ordered instants so a detached timestamp cannot coincide by accident. */
const t = (n: number) => new Date(BASE + n * 1000).toISOString().replace('Z', '+00:00');
const iso = (n: number) => new Date(BASE + n * 1000).toISOString();

export const WORLD_IDS = {
  tAlpha: u('0001'), tBeta: u('0002'), d0: u('0003'), d1: u('0004'), d2: u('0005'),
  adm: u('0006'), pa: u('0007'), pn: u('0008'), pb: u('0009'),
  s1: u('000a'), s2: u('000b'), o1: u('000c'), o2: u('000d'), e1: u('000e'), e2: u('000f'),
};

const SLOT_ENTITY: Record<string, string> = {
  'tenant-alpha': WORLD_IDS.tAlpha, 'tenant-beta': WORLD_IDS.tBeta,
  'alpha-dom0': WORLD_IDS.d0, 'alpha-dom1': WORLD_IDS.d1, 'beta-dom0': WORLD_IDS.d2,
  'platform-admin': WORLD_IDS.adm, 'alpha-admin': WORLD_IDS.pa,
  'alpha-analyst': WORLD_IDS.pn, 'beta-admin': WORLD_IDS.pb,
  'admin-session': WORLD_IDS.s1, 'alpha-admin-session': WORLD_IDS.s2,
  'claim-1': WORLD_IDS.o1, 'claim-2': WORLD_IDS.o2,
  'outbox-published': WORLD_IDS.e1, 'outbox-pending': WORLD_IDS.e2,
};
const entityOf = (slot: string | null) => (slot === null ? null : (SLOT_ENTITY[slot] ?? null));

/** Creation instants, so a lifecycle event or a token can be checked against its subject. */
const CREATED: Record<string, number> = {
  [WORLD_IDS.tAlpha]: 10, [WORLD_IDS.tBeta]: 11,
  [WORLD_IDS.d0]: 12, [WORLD_IDS.d1]: 13, [WORLD_IDS.d2]: 14,
  [WORLD_IDS.adm]: 1, [WORLD_IDS.pa]: 20, [WORLD_IDS.pn]: 21, [WORLD_IDS.pb]: 22,
  [WORLD_IDS.s1]: 5, [WORLD_IDS.s2]: 25,
};

/** The columns the seed-era catalog carries, taken from the registry itself. */
export const catalogColumns = (table: string): string[] => {
  const spec: any = (SEED_COVERAGE as any)[table];
  // A dedicated-model table carries the exact column set its model authenticates, so the
  // catalog-to-model proof is exercised rather than trivially satisfied.
  if (spec === undefined || spec.columnsOwnedBy !== undefined) return modelCoveredColumns();
  return Object.entries(spec.columns)
    .filter(([, e]: [string, any]) => e.era !== 'latest')
    .map(([c]) => c);
};

/** Build one canonical audit event body carrying EXACTLY the specified field set. */
const body = (fields: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const f of SEED_AUDIT_POSTURE.bodyFields as string[]) out[f] = fields[f] ?? null;
  return out;
};

export interface SeedWorld {
  preseed: any;
  before: any;
  latest: any;
  seedRecord: any;
}

/** A complete world every registered coverage rule accepts. */
export function buildSeedWorld(): SeedWorld {
  const P = SEED_BASE_POSTURE as any;
  const decisionId = (i: number) => `dddddddd-${String(i).padStart(4, '0')}-4ddd-8ddd-dddddddddddd`;
  const corr = (i: number) => `cccccccc-${String(i).padStart(4, '0')}-4ccc-8ccc-cccccccccccc`;

  const tenants = SEED_TENANTS.map((s: any) => ({
    id: entityOf(s.slot), name: s.name, status: P.tenant.status,
    residency_profile: P.tenant.residency_profile, retention_profile: P.tenant.retention_profile,
    created_at: t(CREATED[entityOf(s.slot)!]), activated_at: t(CREATED[entityOf(s.slot)!] + 1),
  }));
  const domains = SEED_DOMAINS.map((s: any) => ({
    id: entityOf(s.slot), tenant_id: entityOf(s.tenantSlot), name: s.name, status: P.domain.status,
    residency_profile: P.domain.residency_profile, retention_profile: P.domain.retention_profile,
    created_at: t(CREATED[entityOf(s.slot)!]), activated_at: t(CREATED[entityOf(s.slot)!] + 1),
  }));
  const lifecycle = SEED_LIFECYCLE_EVENTS.map((e: any, i: number) => ({
    id: u(`040${i}`), scope: e.scope, event: e.event, actor: P.lifecycleActor,
    tenant_id: entityOf(e.tenantSlot), domain_id: entityOf(e.domainSlot),
    // The event instant IS the created entity's creation instant.
    occurred_at: t(CREATED[entityOf(e.entitySlot)!]), details: e.details,
  }));
  const principals = [SEED_ADMIN, ...SEED_PRINCIPALS].map((p: any) => ({
    id: entityOf(p.slot), kind: P.principal.kind, scope: p.scope,
    tenant_id: entityOf(p.tenantSlot), domain_id: entityOf(p.domainSlot),
    display_name: p.loginName, login_name: p.loginName, status: P.principal.status,
    created_at: t(CREATED[entityOf(p.slot)!]),
    revocation_epoch: p.slot === SEED_ADMIN.slot
      ? P.principalRevocationEpoch.admin : P.principalRevocationEpoch.governed,
  }));
  // The audited bootstrap is the earliest governed event (t(2) below), and the claim carries
  // exactly that landing instant.
  const bootstrapClaim = [{ id: P.bootstrapClaim.id, principal_id: WORLD_IDS.adm, claimed_at: t(2) }];

  // Exactly what the pinned producer emits: m,p,t order, 16-byte salt, 32-byte tag, canonical
  // unpadded standard-alphabet base64.
  const b64 = (bytes: number, fill: number) => Buffer.alloc(bytes, fill).toString('base64').replace(/=+$/, '');
  const ARGON = `$argon2id$v=19$m=65536,p=4,t=3$${b64(16, 0x41)}$${b64(32, 0x42)}`;
  const L = SEED_CREDENTIAL_LIFECYCLE as any;
  const rotatedCreated = 1;
  const replacementCreated = 3;
  const credentials = [
    {
      id: u('0101'), principal_id: WORLD_IDS.adm, type: P.credential.type, secret_hash: ARGON,
      status: P.credential.rotatedStatus, created_at: t(rotatedCreated),
      // Retired exactly when its replacement is minted; expiry is one governed lifetime after an
      // instant inside its own life.
      rotated_at: t(replacementCreated),
      expires_at: new Date(BASE + rotatedCreated * 1000 + L.lifetimeMs).toISOString().replace('Z', '+00:00'),
    },
    {
      id: u('0102'), principal_id: WORLD_IDS.adm, type: P.credential.type, secret_hash: ARGON,
      status: P.credential.activeStatus, created_at: t(replacementCreated),
      rotated_at: L.activeRotatedAt, expires_at: L.activeExpiresAt,
    },
    ...[WORLD_IDS.pa, WORLD_IDS.pn, WORLD_IDS.pb].map((pid, i) => ({
      id: u(`010${3 + i}`), principal_id: pid, type: P.credential.type, secret_hash: ARGON,
      status: P.credential.activeStatus, created_at: t(30 + i),
      rotated_at: L.activeRotatedAt, expires_at: L.activeExpiresAt,
    })),
  ];

  const sessions = SEED_SESSIONS.map((s: any, i: number) => ({
    id: entityOf(s.slot), principal_id: entityOf(s.principalSlot), assurance: P.session.assurance,
    status: P.session.status, refresh_token_hash: hex(String(i + 1)),
    prev_refresh_token_hash: P.session.prev_refresh_token_hash,
    context_key_hash: hex(String.fromCharCode(97 + i)),
    issued_at: t(CREATED[entityOf(s.slot)!]), expires_at: t(CREATED[entityOf(s.slot)!] + 3600),
    revoked_at: P.session.revoked_at,
    bound_epoch: s.principalSlot === SEED_ADMIN.slot
      ? P.principalRevocationEpoch.admin : P.principalRevocationEpoch.governed,
    family_id: u(`030${i}`),
  }));
  const refreshTokens = SEED_SESSIONS.map((s: any, i: number) => ({
    id: u(`020${i}`), family_id: u(`030${i}`), session_id: entityOf(s.slot),
    token_hash: hex(String(i + 1)), generation: P.refreshToken.generation,
    // A token is issued with its session, not at some unrelated instant.
    issued_at: t(CREATED[entityOf(s.slot)!]),
    invalidated_at: P.refreshToken.invalidated_at, replaced_by: P.refreshToken.replaced_by,
    reuse_seen_at: P.refreshToken.reuse_seen_at,
  }));
  const roleBindings = [SEED_ADMIN, ...SEED_PRINCIPALS].map((p: any, i: number) => ({
    id: u(`060${i}`), principal_id: entityOf(p.slot), role_code: p.role, scope: p.scope,
    tenant_id: entityOf(p.tenantSlot), domain_id: entityOf(p.domainSlot),
    created_at: t(CREATED[entityOf(p.slot)!]), revoked_at: null,
    granted_by_principal: p.slot === SEED_ADMIN.slot ? null : WORLD_IDS.adm,
    granted_by_scope: SEED_ADMIN.scope,
  }));

  let capSeq = 0;
  const capabilities = SEED_CAPABILITIES.flatMap((c: any) => Array.from({ length: c.count }, () => {
    capSeq += 1;
    return {
      nonce: u(`07${String(capSeq).padStart(2, '0')}`), op_class: c.op_class,
      bound_action: c.bound_action,
      session_id: c.sessionSlot === null ? CAPABILITY_SESSIONLESS_ID : entityOf(c.sessionSlot),
      issued_at: t(40 + capSeq), expires_at: t(40 + capSeq + 60), consumed_at: c.consumed_at,
    };
  }));

  const outbox = SEED_OUTBOX.map((o: any, i: number) => ({
    id: entityOf(o.slot), scope: o.scope, status: o.status, payload: seedOutboxPayload(o),
    attempts: o.attempts, lease_id: o.status === 'pending' ? u('0801') : null,
    domain_id: entityOf(o.domainSlot), tenant_id: entityOf(o.tenantSlot),
    created_at: t(50 + i), event_type: o.eventType, causation_id: u(`081${i}`),
    leased_until: o.status === 'pending' ? t(60 + i) : null,
    published_at: o.status === 'published' ? t(60 + i) : null,
    // The enqueue decision for this very row carries this correlation; nothing else may.
    correlation_id: corr(SEED_OPERATIONS.findIndex(
      (op: any) => op.entityKind === 'outbox' && op.entitySlot === o.slot)),
  }));

  // ── DECISIONS AND THEIR CLOSING AUDIT EVENTS, in plan order. ───────────────────────────
  const D = SEED_DECISION_POSTURE as any;
  const A = SEED_AUDIT_POSTURE as any;
  const decisions: any[] = [];
  const planned: any[] = [];
  SEED_OPERATIONS.forEach((op: any, i: number) => {
    const target = entityOf(op.entitySlot);
    decisions.push({
      id: decisionId(i), scope: op.scope, action: op.action, reason: D.reason, decision: D.decision,
      domain_id: entityOf(op.domainSlot), object_id: target, tenant_id: entityOf(op.tenantSlot),
      created_at: t(100 + i), expires_at: D.expires_at, purpose_id: D.purpose_id,
      environment: D.environment, object_type: op.objectType, obligations: D.obligations,
      input_digest: sha256(seedInputDigestSource(op, target)),
      principal_id: `principal:${entityOf(op.actorSlot)}`, delegation_id: D.delegation_id,
      evidence_only: D.evidence_only, exception_ref: D.exception_ref,
      bundle_version: D.bundle_version, correlation_id: corr(i),
      revocation_state: D.revocation_state, consequence_class: op.consequence,
    });
    planned.push({
      partition: op.tenantSlot === null ? 'platform' : `tenant:${entityOf(op.tenantSlot)}`,
      created_at: t(100 + i),
      body: body({
        actor: `principal:${entityOf(op.actorSlot)}`, scope: op.scope, action: op.action,
        outcome: A.outcome, result_code: A.result_code, event_type: op.auditEventType,
        metadata: A.metadata, clock_quality: A.clock_quality, context_mode: A.context_mode,
        purpose_id: A.purpose_id, policy_version: A.policy_version,
        policy_decision_id: decisionId(i), correlation_id: corr(i),
        tenant_id: entityOf(op.tenantSlot), domain_id: entityOf(op.domainSlot),
        target_id: target, target_type: op.targetType,
        session_id: entityOf(op.sessionSlot), occurred_at: iso(100 + i),
      }),
    });
  });
  SEED_STANDALONE_AUDIT_EVENTS.forEach((s: any, i: number) => {
    planned.unshift({
      partition: s.partition,
      created_at: t(2 + i),
      body: body({
        actor: `principal:${entityOf(s.actorSlot)}`, scope: s.scope, action: s.action,
        outcome: s.outcome, result_code: s.result_code, event_type: s.event_type,
        metadata: s.metadata, clock_quality: A.clock_quality, context_mode: s.context_mode,
        purpose_id: s.purpose_id, policy_version: null, policy_decision_id: null,
        correlation_id: corr(900 + i), tenant_id: null, domain_id: null,
        target_id: s.targetIsActor ? entityOf(s.actorSlot) : null, target_type: s.target_type,
        session_id: entityOf(s.sessionSlot), occurred_at: iso(2 + i),
      }),
    });
  });

  // Chain each partition with the production hash, so the chain is genuine rather than asserted.
  const events: any[] = [];
  const heads: any[] = [];
  for (const partition of [...new Set(planned.map((p) => p.partition))]) {
    const chain = planned.filter((p) => p.partition === partition);
    let previous = hex('0');
    let seq = 0;
    for (const p of chain) {
      seq += 1;
      const event_jcs = jcsCanonicalize(p.body);
      const row_hash = auditRowHash({
        partitionId: partition, auditSeq: seq, previousHash: previous, event: p.body,
      });
      events.push({
        partition_id: partition, audit_seq: seq, event_jcs, event: p.body,
        scope: p.body.scope, tenant_id: p.body.tenant_id, domain_id: p.body.domain_id,
        event_type: p.body.event_type, outcome: p.body.outcome, actor: p.body.actor,
        action: p.body.action, result_code: p.body.result_code,
        correlation_id: p.body.correlation_id, occurred_at: p.body.occurred_at,
        previous_hash: previous, row_hash, hash_alg_version: A.hash_alg_version,
        created_at: p.created_at,
      });
      previous = row_hash;
    }
    const last = events.filter((e) => e.partition_id === partition).pop();
    heads.push({
      partition_id: partition, next_seq: last.audit_seq + 1, head_hash: last.row_hash,
      frozen: A.headFrozen, updated_at: last.created_at,
    });
  }

  const rows: Record<string, any[]> = {
    'tenancy.tenants': tenants,
    'tenancy.domains': domains,
    'tenancy.lifecycle_events': lifecycle,
    'identity.principals': principals,
    'identity.bootstrap_claim': bootstrapClaim,
    'identity.credentials': credentials,
    'identity.sessions': sessions,
    'identity.refresh_tokens': refreshTokens,
    'identity.role_bindings': roleBindings,
    'ctx.issued': capabilities,
    'objects.object_outbox': outbox,
    'policy.policy_decisions': decisions,
    'audit.audit_events': events,
    'audit.audit_chain_heads': heads,
    'objects.canonical_objects': SEED_OBJECTS.map((o: any) => ({ object_id: entityOf(o.slot) })),
  };

  const table = (t2: string, r: any[]) => ({
    rows: r, columns: catalogColumns(t2), pk: ['id'], row_count: r.length,
  });
  const before: any = { tables: {}, audit: { events, heads } };
  const preseed: any = { tables: {} };
  const latest: any = { tables: {} };
  for (const [name, r] of Object.entries(rows)) {
    before.tables[name] = table(name, r);
    preseed.tables[name] = { ...table(name, []), rows: [] };
    // The upgraded catalog carries the later-era columns too.
    const spec: any = (SEED_COVERAGE as any)[name];
    // The upgraded catalog carries the later-era columns, and the rows carry their DDL defaults.
    const upgraded = spec?.columnsOwnedBy === undefined ? Object.keys(spec.columns) : modelCoveredColumns();
    const upgradedRows = name === 'identity.bootstrap_claim'
      ? r.map((row: any) => ({ ...row, nonce: null, consumed: false, consumed_at: null }))
      : r;
    latest.tables[name] = { ...table(name, upgradedRows), rows: upgradedRows, columns: upgraded };
  }
  const seedRecord = {
    admin: { principalId: WORLD_IDS.adm, loginName: SEED_ADMIN.loginName },
    tenants: SEED_TENANTS.map((s: any) => ({ tenantId: entityOf(s.slot), name: s.name })),
    domains: SEED_DOMAINS.map((s: any) => ({
      domainId: entityOf(s.slot), tenantId: entityOf(s.tenantSlot), name: s.name,
    })),
    principals: SEED_PRINCIPALS.map((p: any) => ({
      principalId: entityOf(p.slot), scope: p.scope, tenantId: entityOf(p.tenantSlot),
      domainId: entityOf(p.domainSlot), loginName: p.loginName, roleCode: p.role,
    })),
    sessions: SEED_SESSIONS.map((s: any) => ({
      sessionId: entityOf(s.slot), principalId: entityOf(s.principalSlot),
    })),
    objects: SEED_OBJECTS.map((o: any) => ({
      objectId: entityOf(o.slot), tenantId: entityOf(o.tenantSlot), domainId: entityOf(o.domainSlot),
    })),
    outbox: SEED_OUTBOX.map((o: any) => ({ eventId: entityOf(o.slot), eventType: o.eventType })),
  };
  return { preseed, before, latest, seedRecord };
}

/** The slot maps the runner needs, derived from the same source-owned slot table. */
export function worldSlots() {
  const m = (pairs: Array<[string, string | null]>) => new Map(pairs.filter(([, v]) => v !== null) as Array<[string, string]>);
  return {
    tenant: m(SEED_TENANTS.map((s: any) => [s.slot, entityOf(s.slot)])),
    domain: m(SEED_DOMAINS.map((s: any) => [s.slot, entityOf(s.slot)])),
    principal: m([SEED_ADMIN, ...SEED_PRINCIPALS].map((s: any) => [s.slot, entityOf(s.slot)])),
    session: m(SEED_SESSIONS.map((s: any) => [s.slot, entityOf(s.slot)])),
    object: m(SEED_OBJECTS.map((s: any) => [s.slot, entityOf(s.slot)])),
    outbox: m(SEED_OUTBOX.map((s: any) => [s.slot, entityOf(s.slot)])),
  };
}
