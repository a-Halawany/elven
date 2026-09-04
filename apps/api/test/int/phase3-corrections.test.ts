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

    // Phase 1's sentence STANDS: a partial walk has not earned the claim of
    // completeness that replacing it would make.
    const corr = (await sql<{ propagation_unresolved: string; propagation_assessment_id: string }>`
      select propagation_unresolved, propagation_assessment_id::text
        from observation.correction_current where case_id = ${caseId}::uuid`.execute(su)).rows[0];
    expect(corr?.propagation_unresolved,
      'a truncated walk retired the unresolved sentence').toBe(sentence);
    expect(corr?.propagation_assessment_id,
      'the partial assessment was not linked to the case').toBe(out.result.invalidationId);
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
    expect(awaiting.map((c) => String(c['case_id'])),
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
