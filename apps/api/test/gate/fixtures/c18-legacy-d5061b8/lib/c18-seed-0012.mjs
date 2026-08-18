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
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

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
    objects: [], outbox: [], decisions: [], correlations: [],
  };

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
        [adminId, 'platform-admin', adminHash]],
      ['select identity.bootstrap_mark_one_time($1::uuid)', [adminId]],
      ['select identity.record_bootstrap_principal($1::uuid)', [adminId]],
      ["select audit.commit_identity_event($1::uuid, null::uuid, 'admin.bootstrap',"
        + "'identity.bootstrap.platform_admin','success','OK',$2::uuid,"
        + '$3::jsonb)', [adminId, bootCorr, JSON.stringify({ note: 'C18 path-A era seed: audited single-use bootstrap' })]],
    ]);
    record.admin = { principalId: adminId, loginName: 'platform-admin' };
    record.correlations.push(bootCorr);
    log('seed: bootstrap claimed; platform admin created through the identity authority');

    // ── 1b. FORCED ROTATION, exactly as the era login pipeline required it: a bootstrap
    // credential cannot mint authority until it is rotated through the identity ports. ──
    const oldCred = (await identity.query(
      'select id from identity.credential_get_active($1::uuid)', [adminId],
    )).rows[0].id;
    const rotCorr = randomUUID();
    const rotatedHash = await argon2.hash(passwords.EYE_TEST_ADMIN_PASSWORD, { type: argon2.argon2id });
    await tx(identity, [
      ["select ctx.issue_identity_op('identity.credential.rotate', $1::uuid, $2::uuid, 60)", [adminId, rotCorr]],
      ['select identity.credential_rotate_v2($1::uuid,$2::uuid,$3::uuid,$4)',
        [adminId, oldCred, randomUUID(), rotatedHash]],
      ["select audit.commit_identity_event($1::uuid, null::uuid, 'identity.credential',"
        + "'identity.credential.rotate','success','OK',$2::uuid,'{}'::jsonb)", [adminId, rotCorr]],
    ], 'rotate');
    record.correlations.push(rotCorr);
    log('seed: bootstrap credential rotated through the identity ports');

    // ── 2. SESSION for the admin, through the identity ports ──
    const openSession = async (principalId, assurance) => {
      const sessionId = randomUUID();
      const familyId = randomUUID();
      const refreshToken = randomBytes(24).toString('hex');
      const contextKey = randomBytes(32).toString('base64url');
      const corr = randomUUID();
      await tx(identity, [
        ["select ctx.issue_identity_op('identity.session.create', $1::uuid, $2::uuid, 60)", [principalId, corr]],
        ['select identity.session_open($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid)',
          [sessionId, principalId, assurance, sha256(refreshToken), sha256(contextKey),
            new Date(Date.now() + 3600_000), familyId]],
      ], 'session-open');
      record.sessions.push({ sessionId, principalId, familyId });
      record.correlations.push(corr);
      return { sessionId, contextKey };
    };
    const admin = await openSession(adminId, 'password');
    log('seed: admin session opened through identity.session_open');

    /** A COMMIT-capability operation, closed exactly as the era pipeline closed it. */
    const governedCommit = async ({ session, scope, tenantId, domainId, action, target, consequence, work }) => {
      const corr = randomUUID();
      const decisionId = randomUUID();
      const cap = { corr, decisionId, bundle: 'bundle-v1' };
      const statements = [
        ['select ctx.issue_commit($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,60)',
          [session.sessionId, session.contextKey, scope, tenantId, domainId,
            'c18-era-seed', action, target, corr, decisionId, cap.bundle, consequence]],
        ...work(cap),
        ["select policy.commit_decision($1::uuid,$2,$3,$4::uuid,$5,'allow','[]'::jsonb,$6,$7,null,null,'none','C18 era seed',$8::uuid,null,'{}'::jsonb)",
          [decisionId, action, target.split(':')[0], randomUUID(), consequence, sha256(`c18:${action}:${target}`), cap.bundle, corr]],
        ["select audit.commit_event('api.request',$1,'success','OK',$2,$3,null,$4::uuid,$5,$6::uuid,null::uuid,null,null,null,'{}'::jsonb)",
          [action, target.split(':')[0], target.split(':')[1] ?? null, decisionId, cap.bundle, corr]],
      ];
      await tx(commit, statements, `commit:${action}`);
      record.decisions.push(decisionId);
      record.correlations.push(corr);
      return cap;
    };

    // ── 3. TWO TENANTS, THREE DOMAINS through tenancy admission ports (0010 signatures) ──
    for (const [t, name] of [[0, 'c18-tenant-alpha'], [1, 'c18-tenant-beta']]) {
      const tenantId = randomUUID();
      await governedCommit({
        session: admin, scope: 'PLATFORM', tenantId: null, domainId: null,
        action: 'tenancy.tenant.create', target: `tenancy.tenant:${tenantId}`, consequence: 'C2',
        work: () => [[
          'select tenancy.create_tenant($1::uuid,$2,$3,$4)', [tenantId, name, 'default', 'c18-admin'],
        ]],
      });
      record.tenants.push({ tenantId, name });
      const domainCount = t === 0 ? 2 : 1;
      for (let d = 0; d < domainCount; d += 1) {
        const domainId = randomUUID();
        await governedCommit({
          session: admin, scope: 'PLATFORM', tenantId: null, domainId: null,
          action: 'tenancy.domain.create', target: `tenancy.domain:${domainId}`, consequence: 'C2',
          work: () => [[
            'select tenancy.create_domain($1::uuid,$2::uuid,$3,$4)', [domainId, tenantId, `${name}-dom${d}`, 'c18-admin'],
          ]],
        });
        record.domains.push({ domainId, tenantId, name: `${name}-dom${d}` });
      }
    }
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
        ['select ctx.issue_commit($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,60)',
          [admin.sessionId, admin.contextKey, 'PLATFORM', null, null,
            'c18-era-seed', 'identity.principal.create', `identity.principal:${pid}`, corr, decisionId, 'bundle-v1', 'C2']],
        ["select identity.create_principal($1::uuid,'human',$2,$3::uuid,$4::uuid,$5,$5,$6,$7)",
          [pid, scope, tenantId, domainId, loginName, hash, roleCode]],
        ["select policy.commit_decision($1::uuid,'identity.principal.create','identity.principal',$2::uuid,'C2','allow','[]'::jsonb,$3,'bundle-v1',null,null,'none','C18 era seed',$4::uuid,null,'{}'::jsonb)",
          [decisionId, pid, sha256(`c18:principal:${pid}`), corr]],
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
    const tAdmin0 = await mkPrincipal({ scope: 'TENANT', tenantId: t0, domainId: null, loginName: 'c18-alpha-admin', roleCode: 'tenant_admin' });
    await mkPrincipal({ scope: 'DOMAIN', tenantId: t0, domainId: d00, loginName: 'c18-alpha-analyst', roleCode: 'domain_analyst' });
    await mkPrincipal({ scope: 'TENANT', tenantId: t1, domainId: null, loginName: 'c18-beta-admin', roleCode: 'tenant_admin' });
    const alphaAdmin = await openSession(tAdmin0, 'password');
    log(`seed: ${record.principals.length} governed principals + tenant session`);

    // ── 5. CANONICAL OBJECTS through the admission port, with the REAL header digest ──
    const admitObject = async (session, tenantId, domainId, subject) => {
      const objectId = randomUUID();
      const cap = await governedCommit({
        session, scope: 'DOMAIN', tenantId, domainId,
        action: 'objects.create', target: `CLM:${objectId}`, consequence: 'C2',
        work: ({ corr }) => {
          const header = {
            object_id: objectId, object_type: 'CLM', tenant_id: tenantId, domain_id: domainId,
            scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
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
            audit_correlation_id: corr, content_ref: null,
          };
          const payload = { subject, predicate: 'asserts', object_value: `v-${subject}` };
          return [[
            'select * from objects.admit_version($1::jsonb,$2::jsonb,$3)',
            [JSON.stringify(header), JSON.stringify(payload), canonicalHeaderDigest(header, payload)],
          ]];
        },
      });
      record.objects.push({ objectId, tenantId, domainId, correlation: cap.corr });
      return objectId;
    };
    await admitObject(alphaAdmin, t0, d00, 'c18-claim-1');
    await admitObject(alphaAdmin, t0, d00, 'c18-claim-2');
    log('seed: 2 canonical objects admitted with real header digests');

    // ── 6. OUTBOX effects: one enqueued-and-published, one left pending ──
    const enqueue = async (session, tenantId, domainId, eventType) => {
      const eventId = randomUUID();
      const cap = await governedCommit({
        session, scope: 'DOMAIN', tenantId, domainId,
        action: 'objects.create', target: `outbox:${eventId}`, consequence: 'C1',
        work: ({ corr }) => [[
          'select objects.enqueue_event($1::uuid,$2,$3::jsonb,$4::uuid,$5::uuid)',
          [eventId, eventType, JSON.stringify({ seed: 'c18', event: eventType }), corr, randomUUID()],
        ]],
      });
      record.outbox.push({ eventId, correlation: cap.corr, eventType });
      return eventId;
    };
    const published = await enqueue(alphaAdmin, t0, d00, 'c18.seed.published');
    await enqueue(alphaAdmin, t0, d00, 'c18.seed.pending');
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
    log('seed: outbox enqueued x2, one leased + acknowledged through the publish capability');

    return record;
  } finally {
    await identity.end().catch(() => {});
    await commit.end().catch(() => {});
    await publisher.end().catch(() => {});
  }
}
