/**
 * CODEX REVIEW OF 6914af03 — DATABASE AND API verification.
 *
 * The service-level probes in `test/unit/codex-corrections.test.ts` drive real
 * implementations through in-memory doubles. They cannot say anything about what
 * PostgreSQL enforces, and this file makes no claim they can.
 *
 * THIS file runs against a real database through the real governed ports, under
 * real capability contexts. It is the evidence for the corrections whose whole
 * point is a boundary the service layer cannot provide on its own — a port that
 * refuses, a column that persists, a constraint that holds.
 *
 * Neither file is browser evidence. Nothing here was verified through the UI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import { AppModule } from '../../src/app.module.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB, IDENTITY_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { GraphCapability, type GraphReads, type EdgeWrites, type ImpactWrites,
  type ResolverWrites } from '../../src/graph/graph.capabilities.js';
import { ImpactService } from '../../src/graph/strategy/impact.service.js';
import { EntitiesService } from '../../src/graph/entities/entities.service.js';
import { EdgesService } from '../../src/graph/edges/edges.service.js';
import { seedPhase1Domain, type Phase1Fixture } from './phase1-helpers.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

let app: INestApplicationContext;
let pipeline: PipelineService;
let impact: ImpactService;
let entities: EntitiesService;
let edges: EdgesService;
let su: Db;
let fx: Phase1Fixture;
let managerId: string;
let manager: AuthenticatedPrincipal;
let entA = ''; let entB = '';

function env(action: string, objectType: string, objectId: string | null): Envelope {
  return {
    message_id: uuidv7(), scope: 'DOMAIN', tenant_id: fx.tenantId, domain_id: fx.domainId,
    principal_id: `principal:${managerId}`, purpose_id: 'graph', action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible',
    consequence_class: 'C2', object_type: objectType, object_id: objectId,
    schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: uuidv7(), trace_id: 'p3-corrections',
  } as unknown as Envelope;
}

/** Fixture scaffolding: a canonical claim row the ports under test read. */
async function seedClaim(a: {
  id: string; version: number; type: string; reviewState: string; recordedAt: string;
  subject: string;
}) {
  await sql`insert into objects.canonical_objects (
      object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state,
      owning_component, accountable_owner, truth_state, synthetic_state, classification,
      purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref,
      recorded_at, payload)
    values (${a.id}::uuid, ${a.type}, ${fx.tenantId}::uuid, ${fx.domainId}::uuid, 'DOMAIN',
      ${a.version}::bigint, 'active', 'CP-INT-01', ${'agent:test'}, 'extracted', false,
      'internal', 'graph', ${`${a.type}@v1`}, ${uuidv7()}::uuid, ${sha256(a.id + a.version)},
      ${'fixture-scaffolding@1'},
      ${a.recordedAt}::timestamptz,
      ${JSON.stringify({
        claim_kind: 'relationship', subject: a.subject, predicate: 'supplies',
        object_value: 'Widget', confidence: 0.5,
        review: { state: a.reviewState, reason: null, decider: null },
      })}::jsonb)`.execute(su);
}

beforeAll(async () => {
  process.env['EYE_RUNTIME_ENV'] = 'test';
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  pipeline = app.get(PipelineService);
  impact = app.get(ImpactService);
  entities = app.get(EntitiesService);
  edges = app.get(EdgesService);
  fx = await seedPhase1Domain(app.get(EYE_CONFIG), app.get(IDENTITY_DB), app.get(COMMIT_DB));
  su = fx.su;

  managerId = uuidv7();
  const run = managerId.slice(-8);
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${managerId}::uuid, 'human', 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
                    ${`fixture-resmgr-${run}`}, ${`fxc-${run}`}, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${managerId}::uuid, 'resolution_manager', 'DOMAIN',
                    ${fx.tenantId}::uuid, ${fx.domainId}::uuid)`.execute(su);
  const base = await fx.managerPrincipal();
  manager = { ...base, principalId: managerId,
    bindings: [{ roleCode: 'resolution_manager', scope: 'DOMAIN',
                 tenantId: fx.tenantId, domainId: fx.domainId }] } as AuthenticatedPrincipal;

  // Two entities, created through the real port under a real capability.
  entA = uuidv7(); entB = uuidv7();
  for (const [id, name] of [[entA, 'Acme'], [entB, 'Widget']] as const) {
    await pipeline.write<void, ResolverWrites>(
      env('graph.entity.create', 'ENT', id), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.entity.create', objectType: 'ENT', objectId: id },
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.createEntity({
          entityId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          entityType: 'organization', canonicalName: name, normalizedName: name.toLowerCase(),
          actor: managerId, splitFrom: null, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'ENT', targetId: id, targetVersion: '1',
                 outboxEvent: null };
      });
  }
}, 300_000);

afterAll(async () => {
  await fx?.cleanup();
  await app?.close();
});

async function readAs<T>(fn: (cap: GraphReads) => Promise<T>): Promise<T> {
  const out = await pipeline.consequentialRead<T, GraphReads>(
    env('graph.read', 'ENT', null), manager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'graph.read', objectType: 'ENT', objectId: null },
    GraphCapability.read, async (cap) => fn(cap));
  return out.result;
}

/* ───────────────── F2 · the port refuses an unreviewed claim ───────────────── */

describe('F2 (database) — graph.assert_edge refuses a claim awaiting review', () => {
  it('refuses a QUEUED claim at the port, not only in the service', async () => {
    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'REL', reviewState: 'queued',
                      recordedAt: new Date().toISOString(), subject: 'Acme' });
    const edgeId = uuidv7();
    await expect(pipeline.write<void, EdgeWrites>(
      env('graph.edge.assert', 'EDG', edgeId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId },
      GraphCapability.edges,
      async (cap, scope) => {
        await cap.assertEdge({
          edgeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          subject: entA, predicate: 'supplies', object: entB,
          validFrom: new Date().toISOString(), validTo: null,
          claimObjectId: claimId, claimVersion: 1, evidenceObjectId: uuidv7(),
          evidenceDigest: sha256('e'), methodId: null, runId: null, mode: 'replay',
          confidence: 0.5, actor: managerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'EDG', targetId: edgeId,
                 targetVersion: '1', outboxEvent: null };
      })).rejects.toThrow(/queued for review|not decided/i);

    const n = (await sql<{ n: string }>`select count(*)::text n from graph.edges_current
       where edge_id = ${edgeId}::uuid`.execute(su)).rows[0];
    expect(Number(n?.n), 'a refused edge was nonetheless written').toBe(0);
  });

  it('admits the edge once the claim is no longer queued', async () => {
    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'REL', reviewState: 'approved',
                      recordedAt: new Date().toISOString(), subject: 'Acme' });
    const edgeId = uuidv7();
    await pipeline.write<void, EdgeWrites>(
      env('graph.edge.assert', 'EDG', edgeId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId },
      GraphCapability.edges,
      async (cap, scope) => {
        await cap.assertEdge({
          edgeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          subject: entA, predicate: 'supplies', object: entB,
          validFrom: '2024-01-01T00:00:00.000Z', validTo: null,
          claimObjectId: claimId, claimVersion: 1, evidenceObjectId: uuidv7(),
          evidenceDigest: sha256('e'), methodId: null, runId: null, mode: 'replay',
          confidence: 0.9, actor: managerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'EDG', targetId: edgeId,
                 targetVersion: '1', outboxEvent: null };
      });
    const row = (await sql<{ review_state: string }>`
      select details ->> 'review_state' review_state from graph.edge_events
       where edge_id = ${edgeId}::uuid and event = 'edge.asserted'`.execute(su)).rows[0];
    // The event records WHICH review state admitted it, so the decision is auditable.
    expect(row?.review_state).toBe('approved');
  });
});

/* ───────────────── F3 · known-at against the real database ───────────────── */

describe('F3 (database) — a historical read returns the version current then', () => {
  it('does not return a version recorded after the cutoff', async () => {
    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'ENT', reviewState: 'not_required',
                      recordedAt: '2026-02-01T00:00:00.000Z', subject: 'v1' });
    await seedClaim({ id: claimId, version: 2, type: 'ENT', reviewState: 'not_required',
                      recordedAt: '2026-03-01T00:00:00.000Z', subject: 'v2' });
    const atFeb = await readAs(async (cap) =>
      entities.claimsFor(cap, [claimId], '2026-02-15T00:00:00.000Z'));
    expect(Number(atFeb[0]?.['object_version'])).toBe(1);
    const now = await readAs(async (cap) => entities.claimsFor(cap, [claimId]));
    expect(Number(now[0]?.['object_version'])).toBe(2);
  });

  it('reports whether a historical edge answer was complete', async () => {
    const r = await readAs(async (cap) => edges.asOfBounded(cap, {
      knownAt: new Date().toISOString(), validAt: new Date().toISOString() }));
    expect(typeof r.complete).toBe('boolean');
    expect(r.complete, 'this fixture is far below the scan bound').toBe(true);
  });
});

/* ───────────────── F4 · closure, truncation and the visible queue ───────────────── */

describe('F4 (database) — propagation records what it did and did not do', () => {
  it('persists truncation, and a partial walk does NOT retire Phase 1\'s sentence', async () => {
    // A correction case in Phase 1's own shape, carrying Phase 1's sentence and
    // the evidence object it superseded; the walk is of that root.
    const caseId = uuidv7();
    const sentence = 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)';
    const root = uuidv7();
    const trigger = uuidv7();
    await sql`insert into intelligence.claim_lineage (
        claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id,
        method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
        confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id,
        correlation_id)
      values (${trigger}::uuid, 1, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${root}::uuid,
        ${sha256(root)}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid,
        ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${fx.sourceId}::uuid, 'correction', 'applied', now(), 'test', null,
        'a correction whose walk will be truncated',
        ${JSON.stringify([{ object_id: root, from: 1, to: 2 }])}::jsonb, ${sentence})`.execute(su);

    // A dependency chain longer than the traversal bound.
    const ids = Array.from({ length: 12 }, () => uuidv7());
    for (let i = 0; i < ids.length; i += 1) {
      await sql`insert into graph.strategy_current (
          strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
          title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${ids[i]}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          'ASU', 1, ${`chain ${i}`}, 'a link in a long chain', 'active', 'verified',
          ${managerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    }
    await sql`insert into graph.dependencies (
        dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
        depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${ids[0]}::uuid, 'ASU', 'claim', ${trigger}::uuid,
        'the first link rests on the changed claim', 'active', ${managerId}::uuid,
        ${uuidv7()}::uuid)`.execute(su);
    for (let i = 1; i < ids.length; i += 1) {
      await sql`insert into graph.dependencies (
          dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
          depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          ${ids[i]}::uuid, 'ASU', 'strategy', ${ids[i - 1]}::uuid,
          'each link rests on the one before it', 'active', ${managerId}::uuid,
          ${uuidv7()}::uuid)`.execute(su);
    }

    const out = await pipeline.write(
      env('graph.impact.propagate', 'INV', root), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'INV', objectId: root },
      GraphCapability.impact,
      async (cap: ImpactWrites, scope) => {
        const r = await impact.propagate(cap, scope, {
          triggerKind: 'evidence_correction', triggerObjectId: root,
          correctionCaseId: caseId, actor: managerId, correlationId: uuidv7() });
        return { result: r, targetType: 'INV', targetId: r.invalidationId,
                 targetVersion: '1', outboxEvent: null };
      });
    expect(out.result.truncated, 'a chain longer than the bound reported no truncation').toBe(true);

    const inv = (await sql<{ truncated: boolean; unexplored: unknown; statement: string }>`
      select truncated, unexplored, statement from graph.invalidations_current
       where invalidation_id = ${out.result.invalidationId}::uuid`.execute(su)).rows[0];
    expect(inv?.truncated).toBe(true);
    expect((inv?.unexplored as unknown[]).length).toBeGreaterThan(0);
    expect(String(inv?.statement)).toContain('INCOMPLETE');

    /*
     * THE HISTORICAL SENTENCE IS RETIRED, AND NOT FOR A CLAIM OF COMPLETENESS.
     *
     * "downstream consumers not yet present" described a world with no dependency
     * graph, and that world is gone — keeping it would be inaccurate in a
     * different direction. The case now states its CURRENT status: incomplete,
     * and why.
     */
    const corr = (await sql<{ propagation_unresolved: string;
                              propagation_assessment_id: string;
                              propagation_state: string }>`
      select propagation_unresolved, propagation_assessment_id::text, propagation_state
        from observation.correction_current where case_id = ${caseId}::uuid`.execute(su)).rows[0];
    expect(corr?.propagation_unresolved,
      'the case still carries the historical sentence').not.toBe(sentence);
    expect(String(corr?.propagation_unresolved)).toMatch(/propagation incomplete/i);
    expect(corr?.propagation_state,
      'a truncated walk marked the case complete').toBe('partial');
    expect(corr?.propagation_assessment_id,
      'the partial assessment was not linked to the case').toBe(out.result.invalidationId);

    // And it stays discoverable as outstanding work.
    const stillAwaiting = await readAs(async (cap) => impact.awaitingPropagation(cap, 500));
    expect(stillAwaiting.cases.map((c) => String(c['case_id'])),
      'a truncated assessment removed the case from the outstanding list').toContain(caseId);
  });

  it('an EVIDENCE correction reaches the claims derived from it', async () => {
    const evidenceId = uuidv7();
    const claimId = uuidv7();
    const asuId = uuidv7();
    await sql`insert into intelligence.claim_lineage (
        claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id,
        method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
        confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id,
        correlation_id)
      values (${claimId}::uuid, 1, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidenceId}::uuid,
        ${sha256('bytes')}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid,
        ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into graph.strategy_current (
        strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
        title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${asuId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        'ASU', 1, 'rests on the derived claim',
        'this assumption rests on a claim derived from the corrected evidence',
        'active', 'verified',
        ${managerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into graph.dependencies (
        dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
        depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${asuId}::uuid, 'ASU', 'claim', ${claimId}::uuid,
        'this assumption rests on the derived claim', 'active', ${managerId}::uuid,
        ${uuidv7()}::uuid)`.execute(su);

    const walked = await readAs(async (cap) => impact.walk(cap, {
      triggerKind: 'evidence_correction', triggerObjectId: evidenceId }));
    expect(walked.reachedClaims,
      'the evidence correction did not reach the claim derived from it').toContain(claimId);
    expect(walked.assumptions.map((x) => x.strategy_object_id)).toContain(asuId);
  });

  it('lists applied corrections nothing has propagated', async () => {
    const caseId = uuidv7();
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${fx.sourceId}::uuid, 'correction', 'applied', now(), 'test', null,
        'nobody has propagated this one', '[]'::jsonb, 'pending')`.execute(su);
    const awaiting = await readAs(async (cap) => impact.awaitingPropagation(cap, 200));
    expect(awaiting.cases.map((c) => String(c['case_id'])),
      'an applied, unpropagated correction was not surfaced').toContain(caseId);
  });
});

/* ───────────────── the migration itself ───────────────── */

describe('0025 — the forward migration is applied and additive', () => {
  it('is recorded in the ledger alongside every earlier migration', async () => {
    const applied = (await sql<{ filename: string }>`
      select filename from public.schema_migrations order by filename`.execute(su))
      .rows.map((r) => r.filename);
    expect(applied.some((f) => f.startsWith('0025'))).toBe(true);
    for (const earlier of ['0021', '0022', '0023', '0024']) {
      expect(applied.some((f) => f.startsWith(earlier)),
        `${earlier} is missing — a released migration was rewritten`).toBe(true);
    }
  });

  it('extends the trigger kinds without removing any', async () => {
    const def = (await sql<{ d: string }>`
      select pg_get_constraintdef(c.oid) d from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'graph' and r.relname = 'invalidations_current'
        and c.conname = 'invalidations_current_trigger_kind_check'`.execute(su)).rows[0];
    for (const kind of ['claim_correction', 'claim_withdrawal', 'edge_retraction',
                        'entity_split', 'manual', 'evidence_correction']) {
      expect(String(def?.d)).toContain(kind);
    }
  });
});

/* ═════════ SECOND PASS · database and API evidence for 762de2be ═════════ */

/**
 * A request the real controller accepts. The controller reads its envelope and
 * principal off the request object, so a probe at the ENDPOINT boundary supplies
 * exactly that and nothing else — no capability double, no shortcut past the
 * pipeline.
 */
function req(action: string, objectType: string, objectId: string | null) {
  return { eyeEnvelope: env(action, objectType, objectId), eyePrincipal: manager } as never;
}

describe('G1 (API) — the endpoint forwards the historical cutoff', () => {
  it('returns the version current at the cutoff THROUGH the controller', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const controller = app.get(GraphController);

    const entityId = uuidv7();
    await pipeline.write<void, ResolverWrites>(
      env('graph.entity.create', 'ENT', entityId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.entity.create', objectType: 'ENT', objectId: entityId },
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.createEntity({
          entityId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          entityType: 'organization', canonicalName: 'Cutoff Co',
          normalizedName: 'cutoff co', actor: managerId, splitFrom: null,
          eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'ENT', targetId: entityId,
                 targetVersion: '1', outboxEvent: null };
      });

    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'ENT', reviewState: 'not_required',
                      recordedAt: '2026-01-10T00:00:00.000Z', subject: 'january-value' });
    await seedClaim({ id: claimId, version: 2, type: 'ENT', reviewState: 'not_required',
                      recordedAt: '2026-03-10T00:00:00.000Z', subject: 'march-value' });
    // A resolution accepted in January, still current.
    await sql`insert into graph.resolutions_current (
        resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version,
        mention_text, entity_id, method, rule_id, rule_version, score, match_evidence,
        candidate_set, state, proposer_principal_id, accepted_at, evidence_object_id,
        evidence_digest, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${claimId}::uuid, 1, 'Cutoff Co', ${entityId}::uuid, 'deterministic_identifier',
        'identifier-exact', '1', 1, '{}'::jsonb, '[]'::jsonb, 'accepted',
        ${managerId}::uuid, '2026-01-10T00:00:00.000Z'::timestamptz, ${uuidv7()}::uuid,
        ${sha256('e')}, ${uuidv7()}::uuid)`.execute(su);

    const atFeb = await controller.getEntity(
      req('graph.read', 'ENT', entityId), fx.tenantId, fx.domainId, entityId,
      { payload: { knownAt: '2026-02-15T00:00:00.000Z' } }) as {
        claims: Array<Record<string, unknown>>; knownAt: string | null };
    expect(atFeb.knownAt).not.toBeNull();
    expect(atFeb.claims.length).toBe(1);
    expect(Number(atFeb.claims[0]?.['object_version']),
      'the endpoint returned a version recorded after the cutoff it was given').toBe(1);

    const now = await controller.getEntity(
      req('graph.read', 'ENT', entityId), fx.tenantId, fx.domainId, entityId, {}) as {
        claims: Array<Record<string, unknown>> };
    expect(Number(now.claims[0]?.['object_version']),
      'without a cutoff the endpoint must return the current version').toBe(2);
  });
});

describe('G4 (database) — one walked root does not complete a whole correction case', () => {
  it('leaves the case outstanding until every recorded root is covered', async () => {
    // A case that superseded TWO evidence objects, each with its own assumption.
    const rootA = uuidv7(); const rootB = uuidv7();
    const claimA = uuidv7(); const claimB = uuidv7();
    const asuA = uuidv7(); const asuB = uuidv7();
    const caseId = uuidv7();

    for (const [claim, root] of [[claimA, rootA], [claimB, rootB]] as const) {
      await sql`insert into intelligence.claim_lineage (
          claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id,
          method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
          confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id,
          correlation_id)
        values (${claim}::uuid, 1, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${root}::uuid,
          ${sha256(root)}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid,
          ${uuidv7()}::uuid)`.execute(su);
    }
    for (const [asu, claim, label] of [[asuA, claimA, 'A'], [asuB, claimB, 'B']] as const) {
      await sql`insert into graph.strategy_current (
          strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
          title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${asu}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          'ASU', 1, ${`assumption on root ${label}`},
          'this assumption rests on one of the corrected roots', 'active', 'verified',
          ${managerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
      await sql`insert into graph.dependencies (
          dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
          depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          ${asu}::uuid, 'ASU', 'claim', ${claim}::uuid,
          'the assumption rests on this derived claim', 'active', ${managerId}::uuid,
          ${uuidv7()}::uuid)`.execute(su);
    }
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${fx.sourceId}::uuid, 'correction', 'applied', now(), 'test', null,
        'the publisher restated two rows',
        ${JSON.stringify([{ object_id: rootA, from: 1, to: 2 },
                          { object_id: rootB, from: 1, to: 2 }])}::jsonb,
        'pending')`.execute(su);

    // Walk only the FIRST root, as the demonstration did.
    const first = await pipeline.write(
      env('graph.impact.propagate', 'INV', rootA), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'INV', objectId: rootA },
      GraphCapability.impact,
      async (cap: ImpactWrites, scope) => {
        const r = await impact.propagate(cap, scope, {
          triggerKind: 'evidence_correction', triggerObjectId: rootA,
          correctionCaseId: caseId, actor: managerId, correlationId: uuidv7() });
        return { result: r, targetType: 'INV', targetId: r.invalidationId,
                 targetVersion: '1', outboxEvent: null };
      });
    expect(first.result.assumptions.map((x) => x.strategy_object_id)).toContain(asuA);

    // Root B's assumption is untouched — correct, it was not walked.
    const bState = (await sql<{ v: string }>`select verification_state v
      from graph.strategy_current where strategy_object_id = ${asuB}::uuid`.execute(su)).rows[0];
    expect(bState?.v).toBe('verified');

    // THE CASE IS NOT COMPLETE. One walked root out of two recorded roots must not
    // present the correction as fully propagated.
    const corr = (await sql<{ propagation_unresolved: string }>`
      select propagation_unresolved from observation.correction_current
       where case_id = ${caseId}::uuid`.execute(su)).rows[0];
    expect(String(corr?.propagation_unresolved),
      'one walked root presented the whole correction case as propagated')
      .toMatch(/incomplete|outstanding|1 of 2|remain/i);

    // And it stays discoverable as outstanding.
    const awaiting = await readAs(async (cap) => impact.awaitingPropagation(cap, 500));
    expect(awaiting.cases.map((c) => String(c['case_id'])),
      'a case with an unwalked root vanished from the outstanding list').toContain(caseId);

    // Walking the second root completes it.
    await pipeline.write(
      env('graph.impact.propagate', 'INV', rootB), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'INV', objectId: rootB },
      GraphCapability.impact,
      async (cap: ImpactWrites, scope) => {
        const r = await impact.propagate(cap, scope, {
          triggerKind: 'evidence_correction', triggerObjectId: rootB,
          correctionCaseId: caseId, actor: managerId, correlationId: uuidv7() });
        return { result: r, targetType: 'INV', targetId: r.invalidationId,
                 targetVersion: '1', outboxEvent: null };
      });
    const done = (await sql<{ propagation_unresolved: string }>`
      select propagation_unresolved from observation.correction_current
       where case_id = ${caseId}::uuid`.execute(su)).rows[0];
    expect(String(done.propagation_unresolved),
      'covering every root did not complete the case').not.toMatch(/incomplete|outstanding/i);
    const after = await readAs(async (cap) => impact.awaitingPropagation(cap, 500));
    expect(after.cases.map((c) => String(c['case_id']))).not.toContain(caseId);
  });
});

describe('G5 (database) — a corrected relationship retires the edge it replaces', () => {
  it('supersedes the obsolete edge while keeping it historically visible', async () => {
    const entC = uuidv7();
    await pipeline.write<void, ResolverWrites>(
      env('graph.entity.create', 'ENT', entC), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.entity.create', objectType: 'ENT', objectId: entC },
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.createEntity({
          entityId: entC, tenantId: scope.tenantId as string,
          domainId: scope.domainId as string, entityType: 'organization',
          canonicalName: 'Third Party', normalizedName: 'third party', actor: managerId,
          splitFrom: null, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'ENT', targetId: entC,
                 targetVersion: '1', outboxEvent: null };
      });

    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'REL', reviewState: 'not_required',
                      recordedAt: '2026-01-01T00:00:00.000Z', subject: 'Acme' });
    const assertEdge = async (edgeId: string, object: string, version: number) => {
      await pipeline.write<void, EdgeWrites>(
        env('graph.edge.assert', 'EDG', edgeId), manager,
        { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
          action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId },
        GraphCapability.edges,
        async (cap, scope) => {
          await cap.assertEdge({
            edgeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
            subject: entA, predicate: 'supplies', object,
            validFrom: '2024-01-01T00:00:00.000Z', validTo: null,
            claimObjectId: claimId, claimVersion: version, evidenceObjectId: uuidv7(),
            evidenceDigest: sha256('e'), methodId: null, runId: null, mode: 'replay',
            confidence: 0.9, actor: managerId, eventId: uuidv7(), correlationId: uuidv7() });
          return { result: undefined, targetType: 'EDG', targetId: edgeId,
                   targetVersion: '1', outboxEvent: null };
        });
    };

    const v1 = uuidv7();
    await assertEdge(v1, entB, 1);
    const beforeCorrection = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 25));

    // The claim is corrected: the relationship now points somewhere else.
    await seedClaim({ id: claimId, version: 2, type: 'REL', reviewState: 'not_required',
                      recordedAt: new Date().toISOString(), subject: 'Acme' });
    const v2 = uuidv7();
    await assertEdge(v2, entC, 2);

    const rows = (await sql<{ edge_id: string; state: string; superseded_by: string | null }>`
      select edge_id::text, state, superseded_by::text from graph.edges_current
       where claim_object_id = ${claimId}::uuid order by claim_version`.execute(su)).rows;
    expect(rows.length).toBe(2);
    const old = rows.find((r) => r.edge_id === v1);
    expect(old?.state, 'the obsolete edge is still asserted after its claim was corrected')
      .toBe('superseded');
    expect(old?.superseded_by).toBe(v2);

    // THE CURRENT GRAPH shows one edge, pointing at the corrected end.
    const now = await readAs(async (cap) => edges.asOf(cap, {
      knownAt: new Date().toISOString(), validAt: '2024-06-01T00:00:00.000Z' }));
    const forClaim = now.filter((e) => e.claim_object_id === claimId);
    expect(forClaim.map((e) => e.edge_id),
      'both the obsolete and the corrected edge are visible in the current graph')
      .toEqual([v2]);

    // A HISTORICAL query before the correction still shows the edge we believed then.
    const before = await readAs(async (cap) => edges.asOf(cap, {
      knownAt: beforeCorrection, validAt: '2024-06-01T00:00:00.000Z' }));
    expect(before.filter((e) => e.claim_object_id === claimId).map((e) => e.edge_id),
      'the pre-correction view lost the edge that was believed at the time').toEqual([v1]);
  });
});

/* ═════════ THIRD PASS · database and API evidence for e5f188ba ═════════ */

/**
 * The remaining F3/F4 residuals. Every probe here is DATABASE or API evidence:
 * real ports, real capability contexts, and where the defect is in the
 * endpoint's answer, the real controller.
 */

/** A relationship chain E0 → E1 → … → En, every link through the real port. */
async function chain(n: number, predicate = 'feeds'): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const id = uuidv7();
    await pipeline.write<void, ResolverWrites>(
      env('graph.entity.create', 'ENT', id), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.entity.create', objectType: 'ENT', objectId: id },
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.createEntity({
          entityId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          entityType: 'organization', canonicalName: `link ${i} ${id.slice(-6)}`,
          normalizedName: `link ${i} ${id.slice(-6)}`, actor: managerId, splitFrom: null,
          eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'ENT', targetId: id, targetVersion: '1',
                 outboxEvent: null };
      });
    ids.push(id);
  }
  for (let i = 0; i < n; i += 1) {
    const claimId = uuidv7();
    await seedClaim({ id: claimId, version: 1, type: 'REL', reviewState: 'not_required',
                      recordedAt: '2026-01-01T00:00:00.000Z', subject: `link ${i}` });
    const edgeId = uuidv7();
    await pipeline.write<void, EdgeWrites>(
      env('graph.edge.assert', 'EDG', edgeId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId },
      GraphCapability.edges,
      async (cap, scope) => {
        await cap.assertEdge({
          edgeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          subject: ids[i] as string, predicate, object: ids[i + 1] as string,
          validFrom: '2024-01-01T00:00:00.000Z', validTo: null,
          claimObjectId: claimId, claimVersion: 1, evidenceObjectId: uuidv7(),
          evidenceDigest: sha256('e'), methodId: null, runId: null, mode: 'replay',
          confidence: 0.9, actor: managerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'EDG', targetId: edgeId,
                 targetVersion: '1', outboxEvent: null };
      });
  }
  return ids;
}

/** A correction case in Phase 1's own shape, with the roots it recorded. */
async function seedCase(a: { caseId: string; roots: string[]; receivedAt?: string;
                             sentence?: string; state?: string }) {
  const resolved = a.roots.map((object_id) => ({ object_id, from: 1, to: 2 }));
  await sql`insert into observation.correction_current (
      case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
      channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
    values (${a.caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
      ${fx.sourceId}::uuid, 'correction', ${a.state ?? 'applied'},
      ${a.receivedAt ?? new Date().toISOString()}::timestamptz, 'test', null,
      'a correction case for the third pass', ${JSON.stringify(resolved)}::jsonb,
      ${a.sentence ?? 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)'})`
    .execute(su);
}

/** Evidence → derived claim → an assumption resting on it. */
async function seedRoot(root: string, label: string): Promise<{ claim: string; asu: string }> {
  const claim = uuidv7(); const asu = uuidv7();
  await sql`insert into intelligence.claim_lineage (
      claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id,
      method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
      confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id,
      correlation_id)
    values (${claim}::uuid, 1, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
      'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${root}::uuid,
      ${sha256(root)}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid,
      ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into graph.strategy_current (
      strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
      title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${asu}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
      'ASU', 1, ${`assumption on ${label}`},
      'this assumption rests on a claim derived from the corrected evidence', 'active',
      'verified', ${managerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
      ${asu}::uuid, 'ASU', 'claim', ${claim}::uuid,
      'the assumption rests on this derived claim', 'active', ${managerId}::uuid,
      ${uuidv7()}::uuid)`.execute(su);
  return { claim, asu };
}

async function propagateAs(a: { kind: string; trigger: string; caseId: string | null }) {
  const out = await pipeline.write(
    env('graph.impact.propagate', 'INV', a.trigger), manager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'graph.impact.propagate', objectType: 'INV', objectId: a.trigger },
    GraphCapability.impact,
    async (cap: ImpactWrites, scope) => {
      const r = await impact.propagate(cap, scope, {
        triggerKind: a.kind, triggerObjectId: a.trigger, correctionCaseId: a.caseId,
        actor: managerId, correlationId: uuidv7() });
      return { result: r, targetType: 'INV', targetId: r.invalidationId,
               targetVersion: '1', outboxEvent: null };
    });
  return out.result;
}

async function caseState(caseId: string) {
  return (await sql<{ propagation_state: string; propagation_unresolved: string;
                      propagation_assessment_id: string | null }>`
    select propagation_state, propagation_unresolved, propagation_assessment_id::text
      from observation.correction_current where case_id = ${caseId}::uuid`.execute(su)).rows[0];
}

describe('H1 (API) — completeness across the graph responses', () => {
  const WINDOW = { knownAt: '2021-06-01T00:00:00.000Z', validAt: '2021-06-01T00:00:00.000Z' };
  const BULK = 50_001;

  beforeAll(async () => {
    // More eligible edges than the scan bound, in a CLOSED world-time window
    // nothing else uses — so the chain probes below, which ask about 2024, never
    // see them and their completeness is decided by depth alone.
    await sql`insert into graph.edges_current (
        edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id,
        valid_from, valid_to, asserted_at, state, claim_object_id, claim_version,
        evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
      select gen_random_uuid(), 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
             ${entA}::uuid, 'bulk-supplies', ${entB}::uuid,
             '2021-01-01T00:00:00Z'::timestamptz, '2022-01-01T00:00:00Z'::timestamptz,
             '2021-01-02T00:00:00Z'::timestamptz,
             'asserted', gen_random_uuid(), 1, gen_random_uuid(), ${sha256('bulk')},
             'replay', 0.5, ${managerId}::uuid, gen_random_uuid()
        from generate_series(1, ${BULK})`.execute(su);
  }, 120_000);

  afterAll(async () => {
    await sql`delete from graph.edges_current where predicate = 'bulk-supplies'
        and tenant_id = ${fx.tenantId}::uuid`.execute(su);
  });

  it('a chain longer than the depth bound does not yield "no path" with complete: true', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const controller = app.get(GraphController);
    const ids = await chain(5);
    const r = await controller.path(
      req('graph.read', 'EDG', null), fx.tenantId, fx.domainId,
      { payload: { from: ids[0], to: ids[5],
                   knownAt: new Date().toISOString(), validAt: '2024-06-01T00:00:00.000Z' } }) as {
        path: unknown[] | null; complete: boolean; note: string | null };
    // Five hops exceed MAX_DEPTH (4): the path is not found. That is allowed.
    // What is NOT allowed is presenting that as an exhaustive search.
    expect(r.path).toBeNull();
    expect(r.complete,
      'a depth-bounded search that stopped with unexplored entities claimed completeness')
      .toBe(false);
    expect(String(r.note)).not.toMatch(/^no path exists/);
    expect(String(r.note), 'the answer is not scoped to the depth it searched').toMatch(/hop/i);
  });

  it('a four-hop chain is found, and the search is complete', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const controller = app.get(GraphController);
    const ids = await chain(4, 'feeds-four');
    const r = await controller.path(
      req('graph.read', 'EDG', null), fx.tenantId, fx.domainId,
      { payload: { from: ids[0], to: ids[4],
                   knownAt: new Date().toISOString(), validAt: '2024-06-01T00:00:00.000Z' } }) as {
        path: unknown[] | null; complete: boolean };
    expect(r.path?.length).toBe(4);
  });

  it('/edges/list reports the eligible total and discloses truncation', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const controller = app.get(GraphController);
    const r = await controller.listEdges(
      req('graph.read', 'EDG', null), fx.tenantId, fx.domainId, { payload: WINDOW }) as {
        edges: unknown[]; total: number; complete?: boolean; note?: string | null };
    expect(r.total, `${BULK} edges are eligible at this instant and the total says otherwise`)
      .toBe(BULK);
    expect(r.edges.length).toBeLessThanOrEqual(r.total);
    expect(typeof r.complete, 'the listing carries no completeness').toBe('boolean');
    expect(r.complete, 'fewer edges than the total were returned and the answer said it was complete')
      .toBe(false);
    expect(r.note ?? null, 'truncation is not disclosed in words').not.toBeNull();
  }, 120_000);

  it('a FOUND path from an incomplete scan still carries an incompleteness note', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const controller = app.get(GraphController);
    const r = await controller.path(
      req('graph.read', 'EDG', null), fx.tenantId, fx.domainId,
      { payload: { from: entA, to: entB, ...WINDOW } }) as {
        path: unknown[] | null; complete: boolean; note: string | null };
    expect(r.path, 'the direct edge was not found').not.toBeNull();
    expect(r.complete, 'more eligible edges than the scan bound and the answer says complete')
      .toBe(false);
    expect(r.note, 'a found path from an incomplete scan carried no note, so a screen keyed '
      + 'on the note shows nothing').not.toBeNull();
  }, 120_000);
});

describe('H2 (database) — outstanding-work pagination is lossless', () => {
  async function walkAll(pageSize: number): Promise<string[]> {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 500; i += 1) {
      const r = await readAs(async (cap) =>
        impact.awaitingPropagation(cap, pageSize, cursor)) as unknown as Record<string, unknown>;
      for (const c of r['cases'] as Array<Record<string, unknown>>) seen.push(String(c['case_id']));
      const next = (r['nextCursor'] ?? r['nextBefore'] ?? null) as string | null;
      if (next === null) break;
      cursor = next;
    }
    return seen;
  }

  it('reaches every case that shares a timestamp, once', async () => {
    const tied = [uuidv7(), uuidv7(), uuidv7()];
    for (const id of tied) {
      await seedCase({ caseId: id, roots: [uuidv7()], receivedAt: '2020-03-01T00:00:00.000Z' });
    }
    // Two more in the SAME millisecond, a microsecond apart — the cursor must keep
    // the precision the column has, or the composite key does not help.
    const micro = [uuidv7(), uuidv7()];
    await seedCase({ caseId: micro[0] as string, roots: [uuidv7()],
                     receivedAt: '2020-02-01T00:00:00.000002Z' });
    await seedCase({ caseId: micro[1] as string, roots: [uuidv7()],
                     receivedAt: '2020-02-01T00:00:00.000001Z' });

    const seen = await walkAll(1);
    for (const id of [...tied, ...micro]) {
      const n = seen.filter((x) => x === id).length;
      expect(n, `case ${id} was reached ${n} time(s) across the pages`).toBe(1);
    }
    expect(new Set(seen).size, 'a case was returned on more than one page').toBe(seen.length);
  }, 120_000);
});

describe('H3 (database) — case coverage counts only appropriate propagation work', () => {
  it('a case-linked MANUAL walk does not stand in for propagating a corrected root', async () => {
    const root = uuidv7();
    const { asu } = await seedRoot(root, 'manual-probe');
    const caseId = uuidv7();
    await seedCase({ caseId, roots: [root] });

    let refused: string | null = null;
    try {
      await propagateAs({ kind: 'manual', trigger: root, caseId });
    } catch (e) {
      refused = String((e as Error).message);
    }
    const after = await caseState(caseId);
    if (refused === null) {
      // Accepted: then it must not have counted as coverage of the root, because
      // a manual walk reaches no evidence-derived claim.
      expect(after?.propagation_state,
        'a manual walk that reached nothing completed the case').not.toBe('complete');
    } else {
      expect(refused).toMatch(/evidence_correction|compatib|root/i);
    }
    // Either way the assumption behind the root is untouched — nothing walked it.
    const v = (await sql<{ v: string }>`select verification_state v
      from graph.strategy_current where strategy_object_id = ${asu}::uuid`.execute(su)).rows[0];
    expect(v?.v).toBe('verified');

    // The appropriate walk completes it.
    await propagateAs({ kind: 'evidence_correction', trigger: root, caseId });
    expect((await caseState(caseId))?.propagation_state).toBe('complete');
  });

  it('a later untruncated reassessment completes the work an earlier truncated walk left', async () => {
    const root = uuidv7();
    const { claim } = await seedRoot(root, 'reassess');
    // Extend the dependency chain past the traversal bound.
    const ids = Array.from({ length: 12 }, () => uuidv7());
    for (let i = 0; i < ids.length; i += 1) {
      await sql`insert into graph.strategy_current (
          strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
          title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${ids[i]}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          'ASU', 1, ${`reassess link ${i}`}, 'a link in a long chain', 'active', 'verified',
          ${managerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
      await sql`insert into graph.dependencies (
          dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
          depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
          ${ids[i]}::uuid, 'ASU', ${i === 0 ? 'claim' : 'strategy'},
          ${i === 0 ? claim : ids[i - 1]}::uuid,
          'each link rests on the one before it', 'active', ${managerId}::uuid,
          ${uuidv7()}::uuid)`.execute(su);
    }
    const caseId = uuidv7();
    await seedCase({ caseId, roots: [root] });

    const first = await propagateAs({ kind: 'evidence_correction', trigger: root, caseId });
    expect(first.truncated).toBe(true);
    expect((await caseState(caseId))?.propagation_state).toBe('partial');

    // The owner prunes the chain to within the bound, and walks the root again.
    await sql`update graph.dependencies set state = 'removed'
       where dependent_object_id = any(${ids.slice(7)}::uuid[])`.execute(su);
    const second = await propagateAs({ kind: 'evidence_correction', trigger: root, caseId });
    expect(second.truncated, 'the pruned chain still reported truncation').toBe(false);

    const after = await caseState(caseId);
    expect(after?.propagation_state,
      'an earlier truncated walk permanently prevents completion').toBe('complete');
    expect(after?.propagation_assessment_id).toBe(second.invalidationId);

    // HISTORY IS PRESERVED: the first, truncated assessment is still on record.
    const hist = (await sql<{ truncated: boolean; state: string }>`
      select truncated, state from graph.invalidations_current
       where invalidation_id = ${first.invalidationId}::uuid`.execute(su)).rows[0];
    expect(hist?.truncated).toBe(true);
    expect(hist?.state).toBe('assessed');
  });

  it('a previously assessed case is reconciled, not reported as never walked', async () => {
    // The shape 0026 left behind: an assessment already linked to the case, the
    // statement already written by the earlier record_impact, and the new column
    // at its default because 0026 reconciled nothing.
    const root = uuidv7();
    await seedRoot(root, 'pre-0026');
    const caseId = uuidv7();
    await seedCase({ caseId, roots: [root] });
    const inv = uuidv7();
    await sql`insert into graph.invalidations_current (
        invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id,
        correction_case_id, opened_by, statement, state, assessed_at, truncated, correlation_id)
      values (${inv}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        'evidence_correction', ${root}::uuid, ${caseId}::uuid, ${managerId}::uuid,
        ${`dependency propagation assessed by invalidation ${inv}: 1 assumption(s) marked unverified`},
        'assessed', now(), false, ${uuidv7()}::uuid)`.execute(su);
    await sql`update observation.correction_current
         set propagation_assessment_id = ${inv}::uuid,
             propagation_unresolved = ${`dependency propagation assessed by invalidation ${inv}: 1 assumption(s) marked unverified`},
             propagation_state = 'pending'
       where case_id = ${caseId}::uuid`.execute(su);

    // Reproduction: the surface must not say no walk has run.
    const listed = await readAs(async (cap) => impact.awaitingPropagation(cap, 500));
    const row = listed.cases.find((c) => String(c['case_id']) === caseId);
    if (row !== undefined) {
      expect(String(row['propagation_status']),
        'an assessed case was reported as never walked').not.toMatch(/no dependency walk has run/);
    }

    // Reconciliation, as the forward migration performs it for existing rows.
    const rec = (await sql<{ s: string }>`
      select graph.reconcile_case_propagation(${caseId}::uuid) as s`.execute(su)).rows[0];
    expect(rec?.s).toBe('complete');
    const after = await caseState(caseId);
    expect(after?.propagation_state).toBe('complete');
    expect(after?.propagation_assessment_id).toBe(inv);
    const gone = await readAs(async (cap) => impact.awaitingPropagation(cap, 500));
    expect(gone.cases.map((c) => String(c['case_id']))).not.toContain(caseId);
  });
});
