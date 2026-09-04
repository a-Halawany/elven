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
    // A correction case in Phase 1's own shape, carrying Phase 1's sentence.
    const caseId = uuidv7();
    const sentence = 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)';
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        ${fx.sourceId}::uuid, 'correction', 'applied', now(), 'test', null,
        'a correction whose walk will be truncated', '[]'::jsonb, ${sentence})`.execute(su);

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
    const trigger = uuidv7();
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
      env('graph.impact.propagate', 'INV', trigger), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'INV', objectId: trigger },
      GraphCapability.impact,
      async (cap: ImpactWrites, scope) => {
        const r = await impact.propagate(cap, scope, {
          triggerKind: 'claim_correction', triggerObjectId: trigger,
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
