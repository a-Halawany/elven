/**
 * C18 — the PATH-A pre-upgrade seed, written ONLY through the historically valid governed
 * ports of the 0012-era schema. Every write below replays exactly what the era application
 * performed: the audited single-use bootstrap claim (run-bootstrap semantics), the identity
 * authority's principal/session ports, the operation-specific capability minters, the tenancy
 * and policy and audit admission ports, canonical-object admission with the real header digest,
 * and the outbox enqueue/lease/ack ports. There is NO direct DML anywhere in this module, and
 * the superuser connection is never used to write.
 *
 * Connections use apps/api's own driver stack (pg via createRequire) and the argon2 + JCS
 * digest implementations the application itself uses, so the seeded rows are indistinguishable
 * from era-application writes.
 */
import { createRequire } from 'node:module';
// C18.1.6 — deterministic names come from the SOURCE-OWNED specification the verifier also
// reads, so the seeder and the contract can never drift into separate expectations.
import {
  SEED_ADMIN, SEED_DOMAINS, SEED_OBJECTS, SEED_OUTBOX, SEED_PRINCIPALS, SEED_TENANTS,
  seedInputDigestSource, seedObjectHeader, seedObjectPayload, seedOutboxPayload,
} from './c18-seed-spec.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { GOVERNED_LIFETIMES, sessionExpiresAt } from './c18-lifetimes.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
/**
 * C18.1.12 — the capability TTL the producer hands every `ctx.issue_*` port, read from the SAME
 * source-owned spec the verifier judges the resulting rows against. It was six separate literal
 * `60`s, so the producer and the verifier agreed only by coincidence.
 */
const CAP_TTL = GOVERNED_LIFETIMES.capabilitySeconds;

export async function seedThroughEraPorts({ root, host, port, database, passwords, log = () => {} }) {
  const require = createRequire(join(root, 'apps', 'api', 'package.json'));
  const pg = require('pg');
  const argon2 = require('argon2');
  const { canonicalHeaderDigest } = await import(
    pathToFileURL(join(root, 'apps', 'api', 'node_modules', '@eye/contracts', 'dist', 'index.js')).href
  );

  const clientFor = async (user, password) => {
    const c = new pg.Client({ host, port, database, user, password });
    await c.connect();
    return c;
  };
  const identity = await clientFor('eye_identity', passwords.EYE_DB_IDENTITY_PASSWORD);
  const commit = await clientFor('eye_commit', passwords.EYE_DB_COMMIT_PASSWORD);
  const publisher = await clientFor('eye_publisher', passwords.EYE_DB_PUBLISHER_PASSWORD);

  const record = {
    admin: null, tenants: [], domains: [], principals: [], sessions: [],
    objects: [], outbox: [], decisions: [], correlations: [], steps: [],
  };
  /**
   * C18.1.3 — one SANITIZED governed-step receipt per plan step: the era ports the step used and
   * the identities it produced. Never a credential, never a hash of one; the verifier checks the
   * step sequence against the source-owned SEED_STEP_PLAN and every identity against the closed
   * seed record.
   */
  const step = (name, ports, ids = []) => { record.steps.push({ step: name, ports, ids }); };

  /** One governed operation = one transaction carrying one bound capability. */
  const tx = async (client, statements, step = 'seed') => {
    await client.query('BEGIN');
    try {
      const out = [];
      for (const [text, values] of statements) {
        try {
          out.push(await client.query(text, values ?? []));
        } catch (e) {
          throw new Error(`[${step}] ${text.slice(0, 70)}… → ${e instanceof Error ? e.message : e}`);
        }
      }
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  };

  try {
    // ── 1. AUDITED SINGLE-USE BOOTSTRAP (identity authority; run-bootstrap semantics) ──
    const adminId = randomUUID();
    const bootCorr = randomUUID();
    const adminHash = await argon2.hash(passwords.EYE_TEST_BOOTSTRAP_PASSWORD, { type: argon2.argon2id });
    await tx(identity, [
      ['select ctx.issue_bootstrap($1::uuid)', [bootCorr]],
      ['select identity.claim_bootstrap()'],
      ["select identity.create_principal($1::uuid,'human','PLATFORM',null::uuid,null::uuid,$2,$2,$3,'platform_admin')",
        [adminId, SEED_ADMIN.loginName, adminHash]],
      ['select identity.bootstrap_mark_one_time($1::uuid)', [adminId]],
      ['select identity.record_bootstrap_principal($1::uuid)', [adminId]],
      ["select audit.commit_identity_event($1::uuid, null::uuid, 'admin.bootstrap',"
        + "'identity.bootstrap.platform_admin','success','OK',$2::uuid,"
        + '$3::jsonb)', [adminId, bootCorr, JSON.stringify({ note: 'C18 path-A era seed: audited single-use bootstrap' })]],
    ]);
    record.admin = { principalId: adminId, loginName: SEED_ADMIN.loginName };
    record.correlations.push(bootCorr);
    step('bootstrap', ['ctx.issue_bootstrap', 'identity.claim_bootstrap', 'identity.create_principal',
      'identity.bootstrap_mark_one_time', 'identity.record_bootstrap_principal',
      'audit.commit_identity_event'], [adminId]);
    log('seed: bootstrap claimed; platform admin created through the identity authority');

    // ── 1b. FORCED ROTATION, exactly as the era login pipeline required it: a bootstrap
    // credential cannot mint authority until it is rotated through the identity ports. ──
    const oldCred = (await identity.query(
      'select id from identity.credential_get_active($1::uuid)', [adminId],
    )).rows[0].id;
    const rotCorr = randomUUID();
    const rotatedHash = await argon2.hash(passwords.EYE_TEST_ADMIN_PASSWORD, { type: argon2.argon2id });
    await tx(identity, [
      [`select ctx.issue_identity_op('identity.credential.rotate', $1::uuid, $2::uuid, ${CAP_TTL})`, [adminId, rotCorr]],
      ['select identity.credential_rotate_v2($1::uuid,$2::uuid,$3::uuid,$4)',
        [adminId, oldCred, randomUUID(), rotatedHash]],
      ["select audit.commit_identity_event($1::uuid, null::uuid, 'identity.credential',"
        + "'identity.credential.rotate','success','OK',$2::uuid,'{}'::jsonb)", [adminId, rotCorr]],
    ], 'rotate');
    record.correlations.push(rotCorr);
    step('credential-rotation', ['identity.credential_get_active', 'ctx.issue_identity_op',
      'identity.credential_rotate_v2', 'audit.commit_identity_event'], [adminId]);
    log('seed: bootstrap credential rotated through the identity ports');

    // ── 2. SESSION for the admin, through the identity ports ──
    const openSession = async (principalId, assurance) => {
      const sessionId = randomUUID();
      const familyId = randomUUID();
      const refreshToken = randomBytes(24).toString('hex');
      const contextKey = randomBytes(32).toString('base64url');
      const corr = randomUUID();
      await tx(identity, [
        [`select ctx.issue_identity_op('identity.session.create', $1::uuid, $2::uuid, ${CAP_TTL})`, [principalId, corr]],
        ['select identity.session_open($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid)',
          [sessionId, principalId, assurance, sha256(refreshToken), sha256(contextKey),
            sessionExpiresAt(), familyId]],
      ], 'session-open');
      record.sessions.push({ sessionId, principalId, familyId, correlation: corr });
      record.correlations.push(corr);
      return { sessionId, contextKey };
    };
    const admin = await openSession(adminId, 'password');
    step('admin-session', ['ctx.issue_identity_op', 'identity.session_open'], [admin.sessionId]);
    log('seed: admin session opened through identity.session_open');

    /** A COMMIT-capability operation, closed exactly as the era pipeline closed it. */
    const governedCommit = async ({ session, scope, tenantId, domainId, action, target, consequence, work, entityId, entityKind }) => {
      const corr = randomUUID();
      const decisionId = randomUUID();
      const cap = { corr, decisionId, bundle: 'bundle-v1' };
      const statements = [
        [`select ctx.issue_commit($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,${CAP_TTL})`,
          [session.sessionId, session.contextKey, scope, tenantId, domainId,
            'c18-era-seed', action, target, corr, decisionId, cap.bundle, consequence]],
        ...work(cap),
        // C18.1.7 — the decision records the CREATED ENTITY id, so the evidence carries a
        // bindable identity rather than an opaque random one, and its input digest follows the
        // source-owned formula the verifier recomputes.
        ["select policy.commit_decision($1::uuid,$2,$3,$4::uuid,$5,'allow','[]'::jsonb,$6,$7,null,null,'none','C18 era seed',$8::uuid,null,'{}'::jsonb)",
          [decisionId, action, target.split(':')[0], entityId, consequence,
            sha256(seedInputDigestSource({ action, targetType: target.split(':')[0], entityKind }, entityId)),
            cap.bundle, corr]],
        ["select audit.commit_event('api.request',$1,'success','OK',$2,$3,null,$4::uuid,$5,$6::uuid,null::uuid,null,null,null,'{}'::jsonb)",
          [action, target.split(':')[0], target.split(':')[1] ?? null, decisionId, cap.bundle, corr]],
      ];
      await tx(commit, statements, `commit:${action}`);
      record.decisions.push(decisionId);
      record.correlations.push(corr);
      return cap;
    };

    // ── 3. TWO TENANTS, THREE DOMAINS through tenancy admission ports (0010 signatures) ──
    for (const tenantSpecEntry of SEED_TENANTS) {
      const name = tenantSpecEntry.name;
      const tenantId = randomUUID();
      await governedCommit({
        session: admin, scope: 'PLATFORM', tenantId: null, domainId: null,
        action: 'tenancy.tenant.create', target: `tenancy.tenant:${tenantId}`, consequence: 'C2',
        entityId: tenantId, entityKind: 'tenant',
        work: () => [[
          'select tenancy.create_tenant($1::uuid,$2,$3,$4)', [tenantId, name, 'default', 'c18-admin'],
        ]],
      });
      record.tenants.push({ tenantId, name });
      const domainsForTenant = SEED_DOMAINS.filter((x) => x.tenantSlot === tenantSpecEntry.slot);
      for (const domainSpecEntry of domainsForTenant) {
        const domainId = randomUUID();
        await governedCommit({
          session: admin, scope: 'PLATFORM', tenantId: null, domainId: null,
          action: 'tenancy.domain.create', target: `tenancy.domain:${domainId}`, consequence: 'C2',
          entityId: domainId, entityKind: 'domain',
          work: () => [[
            'select tenancy.create_domain($1::uuid,$2::uuid,$3,$4)', [domainId, tenantId, domainSpecEntry.name, 'c18-admin'],
          ]],
        });
        record.domains.push({ domainId, tenantId, name: domainSpecEntry.name });
      }
    }
    step('tenants-domains', ['ctx.issue_commit', 'tenancy.create_tenant', 'tenancy.create_domain',
      'policy.commit_decision', 'audit.commit_event'],
    [...record.tenants.map((t) => t.tenantId), ...record.domains.map((d) => d.domainId)]);
    log(`seed: ${record.tenants.length} tenants + ${record.domains.length} domains through tenancy ports`);

    // ── 4. TENANT/DOMAIN PRINCIPALS through the identity authority ──
    // Principal creation is an ADMIN WRITE: the era pipeline minted a COMMIT capability on the
    // identity authority and closed the operation with a decision + audit event, exactly as
    // pipeline.write does for admin.controllers.
    const mkPrincipal = async ({ scope, tenantId, domainId, loginName, roleCode }) => {
      const pid = randomUUID();
      const corr = randomUUID();
      const decisionId = randomUUID();
      const hash = await argon2.hash(randomBytes(18).toString('hex'), { type: argon2.argon2id });
      await tx(identity, [
        [`select ctx.issue_commit($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,${CAP_TTL})`,
          [admin.sessionId, admin.contextKey, 'PLATFORM', null, null,
            'c18-era-seed', 'identity.principal.create', `identity.principal:${pid}`, corr, decisionId, 'bundle-v1', 'C2']],
        ["select identity.create_principal($1::uuid,'human',$2,$3::uuid,$4::uuid,$5,$5,$6,$7)",
          [pid, scope, tenantId, domainId, loginName, hash, roleCode]],
        ["select policy.commit_decision($1::uuid,'identity.principal.create','identity.principal',$2::uuid,'C2','allow','[]'::jsonb,$3,'bundle-v1',null,null,'none','C18 era seed',$4::uuid,null,'{}'::jsonb)",
          [decisionId, pid, sha256(seedInputDigestSource({ entityKind: 'principal' }, pid)), corr]],
        ["select audit.commit_event('api.request','identity.principal.create','success','OK','identity.principal',$1,null,$2::uuid,'bundle-v1',$3::uuid,null::uuid,null,null,null,'{}'::jsonb)",
          [pid, decisionId, corr]],
      ], `principal:${loginName}`);
      record.principals.push({ principalId: pid, scope, tenantId, domainId, loginName, roleCode });
      record.decisions.push(decisionId);
      record.correlations.push(corr);
      return pid;
    };
    const t0 = record.tenants[0].tenantId;
    const t1 = record.tenants[1].tenantId;
    const d00 = record.domains[0].domainId;
    const tenantIdForSlot = (slot) => (slot === null ? null
      : record.tenants[SEED_TENANTS.findIndex((x) => x.slot === slot)].tenantId);
    const domainIdForSlot = (slot) => (slot === null ? null
      : record.domains[SEED_DOMAINS.findIndex((x) => x.slot === slot)].domainId);
    const mintedBySlot = new Map();
    for (const p of SEED_PRINCIPALS) {
      mintedBySlot.set(p.slot, await mkPrincipal({
        scope: p.scope, tenantId: tenantIdForSlot(p.tenantSlot), domainId: domainIdForSlot(p.domainSlot),
        loginName: p.loginName, roleCode: p.role,
      }));
    }
    const tAdmin0 = mintedBySlot.get('alpha-admin');
    void t1;
    step('principals', ['ctx.issue_commit', 'identity.create_principal', 'policy.commit_decision',
      'audit.commit_event'], record.principals.map((p) => p.principalId));
    const alphaAdmin = await openSession(tAdmin0, 'password');
    step('tenant-session', ['ctx.issue_identity_op', 'identity.session_open'], [alphaAdmin.sessionId]);
    log(`seed: ${record.principals.length} governed principals + tenant session`);

    // ── 5. CANONICAL OBJECTS through the admission port, with the REAL header digest ──
    const admitObject = async (session, tenantId, domainId, objectSpec) => {
      const objectId = randomUUID();
      const cap = await governedCommit({
        session, scope: 'DOMAIN', tenantId, domainId,
        action: 'objects.create', target: `CLM:${objectId}`, consequence: 'C2',
        entityId: objectId, entityKind: 'object',
        work: ({ corr }) => {
          // C18.1.7 — the deterministic header and payload are OWNED BY THE SPECIFICATION the
          // verifier reads, so no admitted value can drift out of its sight.
          const header = seedObjectHeader({
            objectId, tenantId, domainId, correlation: corr, spec: objectSpec,
          });
          const payload = seedObjectPayload(objectSpec);
          return [[
            'select * from objects.admit_version($1::jsonb,$2::jsonb,$3)',
            [JSON.stringify(header), JSON.stringify(payload), canonicalHeaderDigest(header, payload)],
          ]];
        },
      });
      record.objects.push({ objectId, tenantId, domainId, correlation: cap.corr });
      return objectId;
    };
    for (const o of SEED_OBJECTS) {
      await admitObject(alphaAdmin, tenantIdForSlot(o.tenantSlot), domainIdForSlot(o.domainSlot), o);
    }
    step('canonical-objects', ['ctx.issue_commit', 'objects.admit_version', 'policy.commit_decision',
      'audit.commit_event'], record.objects.map((o) => o.objectId));
    log('seed: 2 canonical objects admitted with real header digests');

    // ── 6. OUTBOX effects: one enqueued-and-published, one left pending ──
    const enqueue = async (session, tenantId, domainId, outboxSpec) => {
      const eventType = outboxSpec.eventType;
      const eventId = randomUUID();
      const cap = await governedCommit({
        session, scope: 'DOMAIN', tenantId, domainId,
        action: 'objects.create', target: `outbox:${eventId}`, consequence: 'C1',
        entityId: eventId, entityKind: 'outbox',
        work: ({ corr }) => [[
          'select objects.enqueue_event($1::uuid,$2,$3::jsonb,$4::uuid,$5::uuid)',
          [eventId, eventType, JSON.stringify(seedOutboxPayload(outboxSpec)), corr, randomUUID()],
        ]],
      });
      record.outbox.push({ eventId, correlation: cap.corr, eventType });
      return eventId;
    };
    let published = null;
    for (const o of SEED_OUTBOX) {
      const id = await enqueue(alphaAdmin, tenantIdForSlot(o.tenantSlot), domainIdForSlot(o.domainSlot), o);
      if (o.status === 'published') published = id;
    }
    if (published === null) throw new Error('the seed specification names no publishable outbox effect');
    step('outbox-enqueue', ['ctx.issue_commit', 'objects.enqueue_event', 'policy.commit_decision',
      'audit.commit_event'], record.outbox.map((o) => o.eventId));
    await publisher.query('BEGIN');
    try {
      await publisher.query('select ctx.issue_publish($1::uuid)', [published]);
      const leased = await publisher.query('select * from objects.outbox_lease(2, 60)');
      const target = leased.rows.find((r) => r.id === published);
      if (target === undefined) throw new Error('outbox lease did not return the enqueued event');
      const acked = await publisher.query(
        "select objects.outbox_ack_leased($1::uuid,$2::uuid,'pending','published') as ok",
        [published, target.lease_id],
      );
      if (acked.rows[0].ok !== true) throw new Error('outbox ack was not accepted');
      await publisher.query('COMMIT');
    } catch (e) {
      await publisher.query('ROLLBACK');
      throw new Error(`[outbox-publish] ${e instanceof Error ? e.message : e}`);
    }
    step('outbox-publish', ['ctx.issue_publish', 'objects.outbox_lease', 'objects.outbox_ack_leased'],
      [published]);
    log('seed: outbox enqueued x2, one leased + acknowledged through the publish capability');

    return record;
  } finally {
    await identity.end().catch(() => {});
    await commit.end().catch(() => {});
    await publisher.end().catch(() => {});
  }
}

/**
 * C18.1 — ONE deterministic governed operation through the CURRENT (0021) application ports,
 * performed AFTER the upgrade so the operation-closure ledger (ctx.operation +
 * ctx.operation_effect, 0013) can be captured and authenticated. The effect reference is
 * MEASURED from the ledger the database itself wrote, never asserted.
 */
export async function runPostUpgradeOperation({ root, host, port, database, passwords, seedRecord }) {
  const require = createRequire(join(root, 'apps', 'api', 'package.json'));
  const pg = require('pg');
  const clientFor = async (user, password) => {
    const c = new pg.Client({ host, port, database, user, password });
    await c.connect();
    return c;
  };
  const identity = await clientFor('eye_identity', passwords.EYE_DB_IDENTITY_PASSWORD);
  const commit = await clientFor('eye_commit', passwords.EYE_DB_COMMIT_PASSWORD);
  // Superuser is used ONLY to MEASURE the ledger rows the database wrote (reads, never DML).
  const su = await clientFor('eye', passwords.EYE_DB_PASSWORD);
  try {
    const adminId = seedRecord.admin.principalId;
    const tenantId = seedRecord.tenants[0].tenantId;
    const domainId = seedRecord.domains[0].domainId;
    // A fresh session through the identity ports (current-era signatures).
    const sessionId = randomUUID();
    const contextKey = randomBytes(32).toString('base64url');
    const sessCorr = randomUUID();
    await identity.query('BEGIN');
    await identity.query(`select ctx.issue_identity_op('identity.session.create', $1::uuid, $2::uuid, ${CAP_TTL})`, [adminId, sessCorr]);
    await identity.query('select identity.session_open($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid)',
      [sessionId, adminId, 'password', sha256(randomBytes(24).toString('hex')), sha256(contextKey),
        sessionExpiresAt(), randomUUID()]);
    await identity.query('COMMIT');

    const corr = randomUUID();
    const decisionId = randomUUID();
    const eventId = randomUUID();
    const action = 'objects.create';
    const target = `outbox:${eventId}`;
    await commit.query('BEGIN');
    try {
      await commit.query(`select ctx.issue_commit($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,${CAP_TTL})`,
        [sessionId, contextKey, 'DOMAIN', tenantId, domainId,
          'c18-post-upgrade-proof', action, target, corr, decisionId, 'bundle-v1', 'C1']);
      await commit.query('select objects.enqueue_event($1::uuid,$2,$3::jsonb,$4::uuid,$5::uuid)',
        [eventId, 'c18.post_upgrade.proof', JSON.stringify({ c18: 'post-upgrade governed operation' }), corr, randomUUID()]);
      await commit.query("select policy.commit_decision($1::uuid,$2,'objects.outbox',$3::uuid,'C1','allow','[]'::jsonb,$4,'bundle-v1',null,null,'none','C18.1 post-upgrade closure proof',$5::uuid,null,'{}'::jsonb)",
        [decisionId, action, eventId, sha256(`c18-post:${eventId}`), corr]);
      await commit.query("select audit.commit_event('api.request',$1,'success','OK','objects.outbox',$2,null,$3::uuid,'bundle-v1',$4::uuid,null::uuid,null,null,null,'{}'::jsonb)",
        [action, eventId, decisionId, corr]);
      await commit.query('COMMIT');
    } catch (e) {
      await commit.query('ROLLBACK');
      throw new Error(`[post-upgrade-operation] ${e instanceof Error ? e.message : e}`);
    }
    // MEASURE the ledger the database wrote for this operation.
    const op = (await su.query(
      'select operation_id, action, target, tenant_id, principal_id, decision_id from ctx.operation where correlation_id = $1::uuid',
      [corr],
    )).rows[0];
    if (op === undefined) throw new Error('[post-upgrade-operation] ctx.operation recorded no row for the governed operation');
    const effects = (await su.query(
      'select effect_kind, effect_ref from ctx.operation_effect where operation_id = $1::uuid order by id',
      [op.operation_id],
    )).rows;
    if (effects.length === 0) throw new Error('[post-upgrade-operation] ctx.operation_effect recorded no effect');
    return {
      correlation: corr, decisionId, action, target,
      tenantId, domainId, principalId: adminId, sessionId, eventId,
      effectRef: effects[0].effect_ref, effectKinds: effects.map((e) => e.effect_kind),
    };
  } finally {
    await identity.end().catch(() => {});
    await commit.end().catch(() => {});
    await su.end().catch(() => {});
  }
}
