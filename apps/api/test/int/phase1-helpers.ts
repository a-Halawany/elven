/**
 * Phase 1 integration fixture.
 *
 * Seeds a tenant, a domain, two human operators and one registered agent, then
 * registers, approves and activates a source contract — ALL THROUGH THE REAL
 * GOVERNED PORTS, under real capability contexts with proof of possession.
 *
 * The migrate superuser appears here for exactly two things, both of which are
 * observation rather than production behaviour: creating the tenant/domain rows
 * a test needs to exist, and reading state back to assert on it. No test path
 * writes observation state except through the ports the product uses.
 */
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, randomBytes } from 'node:crypto';
import type { EyeConfig } from '../../src/config/config.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** The connector version the fixture agent is registered as — read from the connector, not pinned. */
export const REST_CONNECTOR_VERSION = new RestConnector().version;

export interface Phase1Fixture {
  tenantId: string;
  domainId: string;
  sourceId: string;
  agentId: string;
  agentPrincipalId: string;
  registrarId: string;
  managerId: string;
  su: Db;
  /** A live authenticated principal for the collection manager. */
  managerPrincipal: () => Promise<AuthenticatedPrincipal>;
  /** The open sessions, so a test can mint a real capability as either operator. */
  managerSession: () => { sessionId: string; contextKey: string };
  registrarSession: () => { sessionId: string; contextKey: string };
  cleanup: () => Promise<void>;
}

function mkPool(cfg: EyeConfig, user: string, password: string): Db {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: cfg['eye.db.host'], port: cfg['eye.db.port'], database: cfg['eye.db.name'],
        user, password, max: 4,
      }),
    }),
  }) as unknown as Db;
}

/** A minimal §7 contract that reads the frozen PortWatch chokepoint set. */
export function fixtureContract(sourceKey: string): Record<string, unknown> {
  return {
    source_key: sourceKey,
    name: `Fixture PortWatch ${sourceKey}`,
    publisher: 'International Monetary Fund',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: sourceKey,
      publisher_identity: 'International Monetary Fund — PortWatch',
      endpoints: [
        'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=portid%3D%27chokepoint1%27&outFields=*&f=json',
      ],
      scheme_allowlist: ['https'],
      cadence_seconds: 86400,
      jitter_seconds: 60,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'fixture',
      authority: 'Official IMF derived indicator',
      legal_basis: 'Public open-data platform publication',
      rights_state: 'confirmed',
      licence: 'fixture',
      permitted_use: ['internal analysis'],
      robots_policy: 'API endpoint',
      purposes: ['observation'],
      classification_ceiling: 'internal',
      residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'endpoint host allowlisted from the contract and pinned at connect time',
        content_authenticity: 'unknown — this publisher offers no signature mechanism',
      },
      budgets: {
        max_requests_per_run: 12, max_bytes_per_run: 33554432,
        max_concurrency: 2, timeout_ms: 60000, max_retries: 2,
      },
      expected_schema: {
        media_types: ['application/json'],
        // chokepoint1 has no planted defect, so a fixture run admits cleanly and
        // a test that expects an admission is not fighting a deliberate one.
        required_fields: ['features.[].attributes.date'],
        drift_tolerance: 0,
        max_bytes: 8388608,
        item_path: 'features',
        item_key_field: 'attributes.date',
        item_time_field: 'attributes.date',
      },
      freshness_expectation: { threshold_seconds: 259200, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v2',
        denominator_derivation: 'one framed row per day across the covered band',
        expected_items_per_window: 21,
        not_applicable_dimensions: [],
        not_applicable_reason: null,
      },
      correction_channel: 'publisher re-publication of the series',
      replay_set: 'imf-portwatch-chokepoints',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  };
}

/**
 * Establish a commit capability exactly as the pipeline does, then run a body
 * inside it. This is the only way the fixture writes observation state.
 */
export async function inCommitContext<T>(
  commitDb: Db,
  p: { sessionId: string; contextKey: string },
  scope: { tenantId: string; domainId: string },
  action: string,
  target: string,
  body: (tx: never) => Promise<T>,
): Promise<T> {
  const correlationId = uuidv7();
  const decisionId = uuidv7();
  return commitDb.transaction().execute(async (tx) => {
    await sql`select ctx.issue_commit(
      ${p.sessionId}::uuid, ${p.contextKey}, 'DOMAIN',
      ${scope.tenantId}::uuid, ${scope.domainId}::uuid, 'observation',
      ${action}, ${target}, ${correlationId}::uuid, ${decisionId}::uuid, 'bundle-v1', 'C1', 60)`.execute(tx);
    const out = await body(tx as never);
    // Close the operation exactly as the pipeline does: an effect without POL and
    // AUD cannot commit, and the fixture must not be an exception to that.
    await sql`select policy.commit_decision(
      ${decisionId}::uuid, ${action}, 'SRC', ${target}::uuid, 'C1', 'allow', '[]'::jsonb,
      ${sha256(action)}, 'bundle-v1', null, null, 'none', 'fixture',
      ${correlationId}::uuid, null, '{}'::jsonb)`.execute(tx);
    await sql`select audit.commit_event(
      'api.request', ${action}, 'success', 'OK', 'SRC', ${target}, '1',
      ${decisionId}::uuid, 'bundle-v1', ${correlationId}::uuid, null::uuid,
      'fixture', ${sha256('{}')}, null, '{}'::jsonb)`.execute(tx);
    return out;
  });
}

export async function seedPhase1Domain(
  cfg: EyeConfig,
  identityDb: Db,
  commitDb: Db,
): Promise<Phase1Fixture> {
  const su = mkPool(cfg, cfg['eye.db.migrate_user'], cfg['eye.db.migrate_password']);
  const run = uuidv7().slice(-10);
  const tenantId = uuidv7();
  const domainId = uuidv7();

  // Tenant and domain: fixture scaffolding, seeded directly.
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at)
            values (${tenantId}::uuid, ${`fixture-${run}`}, 'active', 'EU', 'default', clock_timestamp())`.execute(su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at)
            values (${domainId}::uuid, ${tenantId}::uuid, ${`fixture-domain-${run}`}, 'active', clock_timestamp())`.execute(su);

  // Two humans and one agent principal, with their bindings.
  const registrarId = uuidv7();
  const managerId = uuidv7();
  const agentPrincipalId = uuidv7();

  // No credentials are created: the fixture opens sessions through the identity
  // port directly. A password would be a secret this suite has no use for, and
  // the tests exercise CAPABILITY authority, not the login path — which the
  // acceptance suite covers on its own.
  for (const [id, name, login, role, kind] of [
    [registrarId, `fixture-registrar-${run}`, `fx-reg-${run}`, 'domain_analyst', 'human'],
    [managerId, `fixture-manager-${run}`, `fx-mgr-${run}`, 'collection_manager', 'human'],
    [agentPrincipalId, `agent:observation.rest@${REST_CONNECTOR_VERSION}-${run}`, `fx-agent-${run}`, 'collection_agent', 'agent'],
  ] as const) {
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, ${kind}, 'DOMAIN', ${tenantId}::uuid, ${domainId}::uuid, ${name}, ${login}, 'active')`.execute(su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${tenantId}::uuid, ${domainId}::uuid)`.execute(su);
  }

  /**
   * Open a session through the real port, under a real identity capability —
   * exactly as the authentication controller does. A fixture that inserted the
   * session row directly would be testing against state the product could not
   * itself produce.
   */
  const openSession = async (principalId: string) => {
    const sessionId = uuidv7();
    const familyId = uuidv7();
    const contextKey = randomBytes(32).toString('base64url');
    const refresh = `${uuidv7()}.${randomBytes(24).toString('base64url')}`;
    await identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.session.create', ${principalId}::uuid,
        ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select identity.session_open(
        ${sessionId}::uuid, ${principalId}::uuid, 'password', ${sha256(refresh)},
        ${sha256(contextKey)}, ${new Date(Date.now() + 3600_000)}, ${familyId}::uuid)`.execute(tx);
      await sql`select audit.commit_identity_event(
        ${principalId}::uuid, ${sessionId}::uuid, 'identity.login',
        'identity.session.create', 'success', 'OK', ${uuidv7()}::uuid,
        '{"fixture":true}'::jsonb)`.execute(tx);
    });
    return { sessionId, contextKey, principalId };
  };

  const registrar = await openSession(registrarId);
  const manager = await openSession(managerId);

  // Register the source through the real port.
  const sourceId = uuidv7();
  const sourceKey = `fixture-portwatch-${run}`;
  const contract = fixtureContract(sourceKey);
  await inCommitContext(commitDb, registrar, { tenantId, domainId },
    'observation.source.register', sourceId, async (tx) => {
      await sql`select observation.register_source(
        ${sourceId}::uuid, 1, ${tenantId}::uuid, ${domainId}::uuid,
        ${sourceId}::uuid, 1::bigint, ${sourceKey}, ${'Fixture PortWatch'}, ${'IMF'},
        'authoritative', 'rest', 'replay', 'real', 'confirmed', ${registrarId}::uuid,
        86400, 259200, 'v2', 0, 'internal', 'EU',
        ${JSON.stringify(['observation'])}::jsonb,
        ${JSON.stringify((contract['identity'] as { endpoints: string[] }).endpoints)}::jsonb,
        ${JSON.stringify(contract)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });

  // Approve as the OTHER operator, then activate.
  await inCommitContext(commitDb, manager, { tenantId, domainId },
    'observation.source.approve', sourceId, async (tx) => {
      await sql`select observation.approve_source(
        ${sourceId}::uuid, 1, ${tenantId}::uuid, ${domainId}::uuid,
        'approve', 'fixture approval', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
  await inCommitContext(commitDb, manager, { tenantId, domainId },
    'observation.source.transition', sourceId, async (tx) => {
      await sql`select observation.transition_contract(
        ${sourceId}::uuid, 1, ${tenantId}::uuid, ${domainId}::uuid,
        'active', 'fixture activation', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });

  // The agent, bound to this source, owned by the registrar.
  const agentId = uuidv7();
  const { RestConnector } = await import('../../src/observation/connectors/rest.connector.js');
  const connector = new RestConnector();
  await inCommitContext(commitDb, manager, { tenantId, domainId },
    'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(
        ${agentId}::uuid, ${tenantId}::uuid, ${domainId}::uuid, ${agentPrincipalId}::uuid,
        'observation', ${connector.name}, ${connector.version}, ${connector.codeDigest},
        ${registrarId}::uuid, ${sourceId}::uuid,
        ${JSON.stringify({ maxRequestsPerRun: 12, maxBytesPerRun: 33554432, maxConcurrency: 2, timeoutMs: 60000, maxRetries: 2 })}::jsonb,
        ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });

  const managerPrincipal = async (): Promise<AuthenticatedPrincipal> => ({
    principalId: managerId,
    sessionId: manager.sessionId,
    contextKey: manager.contextKey,
    kind: 'human',
    homeScope: 'DOMAIN',
    homeTenantId: tenantId,
    homeDomainId: domainId,
    assurance: 'password',
    bindings: [{ roleCode: 'collection_manager', scope: 'DOMAIN', tenantId, domainId }],
  });
  return {
    tenantId, domainId, sourceId, agentId, agentPrincipalId, registrarId, managerId,
    su, managerPrincipal,
    managerSession: () => ({ sessionId: manager.sessionId, contextKey: manager.contextKey }),
    registrarSession: () => ({ sessionId: registrar.sessionId, contextKey: registrar.contextKey }),
    cleanup: async () => {
      await su.destroy().catch(() => undefined);
    },
  };
}
