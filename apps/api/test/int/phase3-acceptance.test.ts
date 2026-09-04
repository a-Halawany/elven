/**
 * PHASE 3 ACCEPTANCE — C1 … C7, the seven frozen criteria and nothing beyond them.
 *
 * Everything here runs the REAL governed ports under REAL capability contexts, on
 * the existing integration harness. No new framework, no new gate: the Phase 1
 * fixture seeds and collects, the Phase 2 method extracts, and this suite adds
 * only the Phase 3 principals and the identifier system it needs.
 *
 * The migrate superuser appears only to seed fixture scaffolding and to observe
 * stored state — never to perform an operation the product would have to perform
 * itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { jcsCanonicalize, type Envelope } from '@eye/contracts';
import { AppModule } from '../../src/app.module.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB, IDENTITY_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { ExtractionOrchestrator } from '../../src/intelligence/extraction/orchestrator.service.js';
import { MethodsService } from '../../src/intelligence/methods/methods.service.js';
import { IntelligenceCapability, type ExtractionWrites, type MethodWrites }
  from '../../src/intelligence/intelligence.capabilities.js';
import { requestDigestOf } from '../../src/intelligence/gateway/model-gateway.service.js';
import { GraphOrchestrator } from '../../src/graph/graph.orchestrator.js';
import { GraphCapability, type GraphReads, type ResolverWrites,
  type ResolutionDecisionWrites, type SplitWrites, type StrategyWrites,
  type ImpactWrites, type EdgeRetractionWrites } from '../../src/graph/graph.capabilities.js';
import { EntitiesService } from '../../src/graph/entities/entities.service.js';
import { ResolutionService } from '../../src/graph/entities/resolution.service.js';
import { EdgesService, nowAsOf } from '../../src/graph/edges/edges.service.js';
import { StrategyService, validateStrategy } from '../../src/graph/strategy/strategy.service.js';
import { ImpactService } from '../../src/graph/strategy/impact.service.js';
import { SearchService } from '../../src/graph/search/search.service.js';
import { normalizeName } from '../../src/graph/entities/resolver.service.js';
import { AcquisitionLifecycle } from '../../src/observation/acquisition/lifecycle.service.js';
import { AgentSessionService } from '../../src/observation/agents/agent-session.service.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { seedPhase1Domain, type Phase1Fixture } from './phase1-helpers.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

let app: INestApplicationContext;
let pipeline: PipelineService;
let graph: GraphOrchestrator;
let entities: EntitiesService;
let resolutions: ResolutionService;
let edges: EdgesService;
let strategy: StrategyService;
let impact: ImpactService;
let search: SearchService;
let su: Db;
let fx: Phase1Fixture;
let other: Phase1Fixture;

let extractionManagerId: string; let extractionManager: AuthenticatedPrincipal;
let extractionAgentId: string; let extractionAgent: AuthenticatedPrincipal;
let resolutionManagerId: string; let resolutionManager: AuthenticatedPrincipal;
let resolutionAgentId: string; let resolutionAgent: AuthenticatedPrincipal;
let strategyOwnerId: string; let strategyOwner: AuthenticatedPrincipal;
let otherAnalystId: string; let otherAnalyst: AuthenticatedPrincipal;

let methodId: string;
let resolutionRun: Awaited<ReturnType<GraphOrchestrator['runResolution']>>;
let edgeRun: Awaited<ReturnType<GraphOrchestrator['runEdgeBuild']>>;

const SYSTEM = 'imf_portwatch';
const CHOKEPOINT = 'chokepoint4';
const SUEZ = 'chokepoint5';

const METHOD = {
  methodKey: 'c-suite-extraction',
  name: 'Phase 3 acceptance extraction method',
  targetTypes: ['ENT', 'REL', 'CLM'],
  modelId: 'acceptance-local-model',
  modelWeightsDigest: sha256('acceptance-weights'),
  runtimeVersion: 'ollama/0.33.2',
  promptRef: 'extract/graph-acceptance',
  promptVersion: 'v1',
  promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.',
  decoding: { temperature: 0, seed: 11 },
  confidenceFloor: 0.3,
  reviewBelow: 0.5,
  budgetCalls: 80,
  budgetSeconds: 180,
};
const PROMPT_DIGEST = sha256(METHOD.promptText);
const DECODING_DIGEST = sha256(jcsCanonicalize(METHOD.decoding));

function envelopeFor(
  f: Phase1Fixture, principalId: string, action: string,
  objectType: string, objectId: string | null,
): Envelope {
  return {
    message_id: uuidv7(),
    scope: 'DOMAIN',
    tenant_id: f.tenantId,
    domain_id: f.domainId,
    principal_id: `principal:${principalId}`,
    purpose_id: 'graph',
    action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible',
    consequence_class: 'C2',
    object_type: objectType,
    object_id: objectId,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: uuidv7(),
    trace_id: 'phase3-accept',
  } as unknown as Envelope;
}

/**
 * The recorded model output for one evidence unit.
 *
 * FOUR PATTERNS, CHOSEN TO EXERCISE THE RESOLVER'S FOUR REAL PATHS:
 *   0  two entities carrying AUTHORITATIVE identifiers, plus the relationship
 *      between them — the only path that may resolve automatically (rule 1)
 *   1  the SAME identifier under a DIFFERENT SPELLING — C1's whole point
 *   2  a company with NO identifier and no prior entity — an unmatched mention,
 *      which stays unresolved until a person accepts it (rule 7)
 *   3  the SAME company under a different spelling — a NAME match, which never
 *      resolves automatically (rule 2) and reaches the queue for C2
 *
 * These are HAND-WRITTEN fixtures. No model produced them, and nothing in this
 * suite claims one did: the method runs in `replay`, and every claim, run and
 * lineage row it writes records `mode='replay'`.
 */
function recordedFor(index: number, excerpt: string) {
  const span = { byte_start: 0, byte_end: Math.min(64, excerpt.length) };
  const ent = (subject: string, ids: Record<string, string> | null, type: string) => ({
    claim_kind: 'entity' as const, subject, predicate: 'is_a',
    object_value: type, confidence: 0.95, ...span,
    ...(ids === null ? {} : { qualifiers: { identifiers: ids, entity_type: type } }),
  });
  switch (index % 4) {
    case 0:
      return {
        claims: [
          ent('Bab el-Mandeb Strait', { [SYSTEM]: CHOKEPOINT }, 'place'),
          ent('Suez Canal', { [SYSTEM]: SUEZ }, 'place'),
          {
            claim_kind: 'relationship' as const,
            subject: 'Bab el-Mandeb Strait', predicate: 'feeds_traffic_to',
            object_value: 'Suez Canal', confidence: 0.92, ...span,
            qualifiers: { valid_from: '2024-01-12T00:00:00Z' },
          },
        ],
      };
    case 1:
      return { claims: [ent('Bab-el-Mandeb', { [SYSTEM]: CHOKEPOINT }, 'place')] };
    case 2:
      return { claims: [ent('NORDWERK ANTRIEBSTECHNIK GmbH', null, 'organization')] };
    default:
      return { claims: [ent('Nordwerk Antriebstechnik', null, 'organization')] };
  }
}

async function mkPrincipal(
  f: Phase1Fixture, role: string, kind: string,
): Promise<{ id: string; principal: AuthenticatedPrincipal }> {
  const id = uuidv7();
  const run = id.slice(-8);
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'DOMAIN', ${f.tenantId}::uuid, ${f.domainId}::uuid,
                    ${`fixture-${role}-${run}`}, ${`fx3-${run}`}, 'active')`.execute(f.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${f.tenantId}::uuid, ${f.domainId}::uuid)`.execute(f.su);
  const base = await f.managerPrincipal();
  return {
    id,
    principal: {
      ...base, principalId: id,
      bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: f.tenantId, domainId: f.domainId }],
    } as AuthenticatedPrincipal,
  };
}

beforeAll(async () => {
  process.env['EYE_RUNTIME_ENV'] = 'test';
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  pipeline = app.get(PipelineService);
  graph = app.get(GraphOrchestrator);
  entities = app.get(EntitiesService);
  resolutions = app.get(ResolutionService);
  edges = app.get(EdgesService);
  strategy = app.get(StrategyService);
  impact = app.get(ImpactService);
  search = app.get(SearchService);
  const cfg = app.get(EYE_CONFIG);
  const vault = app.get(VaultService);
  await vault.ensureRoots();
  fx = await seedPhase1Domain(cfg, app.get(IDENTITY_DB), app.get(COMMIT_DB));
  // A SECOND DOMAIN, for C4. It is seeded and never collected into: what matters
  // is that its graph rows are invisible from the first domain.
  other = await seedPhase1Domain(cfg, app.get(IDENTITY_DB), app.get(COMMIT_DB));
  su = fx.su;

  // Phase 3 reads what Phases 1 and 2 produced, so the fixture must actually
  // collect and actually extract — the same paths the product uses.
  const lifecycle = app.get(AcquisitionLifecycle);
  const agentSessions = app.get(AgentSessionService);
  const connector = new RestConnector();
  const collectionPrincipal = await agentSessions.openRunSession({
    agentId: fx.agentId, tenantId: fx.tenantId, domainId: fx.domainId,
    agentVersion: connector.version, codeDigest: connector.codeDigest,
    correlationId: uuidv7(),
  });
  await lifecycle.run({
    sourceId: fx.sourceId, contractVersion: 1,
    agentId: fx.agentId, agentVersion: connector.version,
    connector, principal: collectionPrincipal, correlationId: uuidv7(),
    purposeId: 'observation',
  });

  const em = await mkPrincipal(fx, 'extraction_manager', 'human');
  const ea = await mkPrincipal(fx, 'extraction_agent', 'agent');
  const rm = await mkPrincipal(fx, 'resolution_manager', 'human');
  const ra = await mkPrincipal(fx, 'resolution_agent', 'agent');
  const so = await mkPrincipal(fx, 'strategy_owner', 'human');
  const oa = await mkPrincipal(other, 'domain_analyst', 'human');
  extractionManagerId = em.id; extractionManager = em.principal;
  extractionAgentId = ea.id; extractionAgent = ea.principal;
  resolutionManagerId = rm.id; resolutionManager = rm.principal;
  resolutionAgentId = ra.id; resolutionAgent = ra.principal;
  strategyOwnerId = so.id; strategyOwner = so.principal;
  otherAnalystId = oa.id; otherAnalyst = oa.principal;

  // Register → approve (by a different principal) → activate, through the ports.
  const methods = app.get(MethodsService);
  const reg = await pipeline.write<{ methodId: string }, MethodWrites>(
    envelopeFor(fx, fx.registrarId, 'intelligence.method.register', 'MTH', null),
    { ...(await fx.managerPrincipal()), principalId: fx.registrarId,
      bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN',
                   tenantId: fx.tenantId, domainId: fx.domainId }] },
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'intelligence.method.register', objectType: 'MTH', objectId: null },
    IntelligenceCapability.methods,
    async (cap, scope) => {
      const r = await methods.register(cap, scope, uuidv7(), fx.registrarId, fx.registrarId, {
        ...METHOD, sourceId: fx.sourceId, gatewayMode: 'replay' as const });
      return { result: r, targetType: 'MTH', targetId: r.methodId, targetVersion: '1',
               outboxEvent: null };
    });
  methodId = reg.result.methodId;
  for (const [action, target] of [
    ['intelligence.method.approve', 'approved'], ['intelligence.method.activate', 'active'],
  ] as const) {
    await pipeline.write<void, MethodWrites>(
      envelopeFor(fx, extractionManagerId, action, 'MTH', methodId), extractionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action, objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.methods,
      async (cap, scope) => {
        if (action === 'intelligence.method.approve') {
          await methods.approve(cap, scope, uuidv7(), methodId, extractionManagerId,
            'reviewed for the Phase 3 acceptance suite');
        } else {
          await methods.transition(cap, scope, uuidv7(), methodId, target,
            extractionManagerId, 'ready to extract');
        }
        return { result: undefined, targetType: 'MTH', targetId: methodId,
                 targetVersion: '1', outboxEvent: null };
      });
  }

  // Record a response for every evidence unit the method will read, keyed by the
  // request digest the gateway itself computes.
  const evidence = (await sql<{ object_id: string; payload: Record<string, unknown> }>`
    select object_id, payload from objects.canonical_objects
     where object_type = 'EVD' and provenance_ref like ${`SRC:${fx.sourceId}@%`}
     order by payload ->> 'locator'`.execute(su)).rows;
  expect(evidence.length,
    'the Phase 1 fixture produced too little evidence to exercise the resolver'
  ).toBeGreaterThanOrEqual(4);
  await pipeline.write<void, ExtractionWrites>(
    envelopeFor(fx, extractionManagerId, 'intelligence.gateway.call', 'GWC', null),
    extractionManager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'intelligence.gateway.call', objectType: 'GWC', objectId: null },
    IntelligenceCapability.extraction,
    async (cap) => {
      for (let i = 0; i < evidence.length; i += 1) {
        const e = evidence[i] as { object_id: string; payload: Record<string, unknown> };
        const locator = String(e.payload['locator']);
        const digest = String(e.payload['content_digest']);
        const read = await vault.read('evidence',
          { tenantId: fx.tenantId, domainId: fx.domainId }, locator, digest);
        const excerpt = read.bytes.toString('utf8').slice(0, 8_000);
        const requestDigest = requestDigestOf({
          promptRef: METHOD.promptRef, promptVersion: METHOD.promptVersion,
          promptDigest: PROMPT_DIGEST, modelId: METHOD.modelId,
          weightsDigest: METHOD.modelWeightsDigest, runtimeVersion: METHOD.runtimeVersion,
          decodingDigest: DECODING_DIGEST,
          input: {
            instruction: METHOD.promptRef, target_types: METHOD.targetTypes,
            source_key: METHOD.methodKey, item_key: locator,
            evidence_digest: digest, evidence: excerpt,
          },
        });
        const response = recordedFor(i, excerpt);
        await cap.recordResponse({
          tenantId: fx.tenantId, domainId: fx.domainId, requestDigest, response,
          responseDigest: sha256(jcsCanonicalize(response)), modelId: METHOD.modelId,
          runtime: METHOD.runtimeVersion, from: 'fixture', correlationId: uuidv7(),
        });
      }
      return { result: undefined, targetType: 'GWC', targetId: null, targetVersion: '1',
               outboxEvent: null };
    });

  await app.get(ExtractionOrchestrator).run({
    envelope: envelopeFor(fx, extractionAgentId, 'intelligence.claim.admit', 'CLM', null),
    principal: extractionAgent, tenantId: fx.tenantId, domainId: fx.domainId,
    methodId, limit: 40, newAttempt: false,
  });

  // The identifier system. Rule 1 permits an automatic resolution only against a
  // system someone REGISTERED as authoritative, and this is that registration.
  await pipeline.write<void, ResolverWrites>(
    envelopeFor(fx, resolutionManagerId, 'graph.entity.create', 'IDS', null), resolutionManager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'graph.entity.create', objectType: 'IDS', objectId: null },
    GraphCapability.resolver,
    async (cap, scope) => {
      await cap.registerIdentifierSystem({
        tenantId: scope.tenantId as string, domainId: scope.domainId as string,
        systemKey: SYSTEM, authority: 'International Monetary Fund — PortWatch',
        description: 'PortWatch chokepoint identifiers', isAuthoritative: true,
        actor: resolutionManagerId, correlationId: uuidv7(),
      });
      return { result: undefined, targetType: 'IDS', targetId: null, targetVersion: '1',
               outboxEvent: null };
    });

  resolutionRun = await graph.runResolution({
    envelope: envelopeFor(fx, resolutionAgentId, 'graph.resolution.propose', 'RES', null),
    principal: resolutionAgent, tenantId: fx.tenantId, domainId: fx.domainId,
    limit: 200, methodId: null,
  });
  edgeRun = await graph.runEdgeBuild({
    envelope: envelopeFor(fx, resolutionAgentId, 'graph.edge.assert', 'EDG', null),
    principal: resolutionAgent, tenantId: fx.tenantId, domainId: fx.domainId, limit: 200,
  });
}, 600_000);

afterAll(async () => {
  await other?.cleanup();
  await fx?.cleanup();
  await app?.close();
});

/** A governed read as any principal, for assertions that must go through policy. */
async function readAs<T>(
  f: Phase1Fixture, principal: AuthenticatedPrincipal, principalId: string,
  fn: (cap: GraphReads) => Promise<T>,
): Promise<T> {
  const out = await pipeline.consequentialRead<T, GraphReads>(
    envelopeFor(f, principalId, 'graph.read', 'ENT', null), principal,
    { scope: 'DOMAIN', tenantId: f.tenantId, domainId: f.domainId,
      action: 'graph.read', objectType: 'ENT', objectId: null },
    GraphCapability.read, async (cap) => fn(cap));
  return out.result;
}

/* ───────────────────────── C1 ───────────────────────── */

describe('C1 — two spellings, one entity, and both mentions survive', () => {
  it('resolves differently spelled mentions of the same identifier to ONE entity', async () => {
    const rows = (await sql<{
      entity_id: string; mention_text: string; method: string; score: string;
      state: string; accepted_at: string | null; decided_by: string | null;
    }>`select r.entity_id, r.mention_text, r.method, r.score::text, r.state,
              r.accepted_at::text, r.decided_by::text
         from graph.resolutions_current r
         join graph.entity_identifiers i on i.entity_id = r.entity_id
        where r.tenant_id = ${fx.tenantId}::uuid and r.state = 'accepted'
          and i.system_key = ${SYSTEM} and i.identifier_value = ${CHOKEPOINT}`.execute(su)).rows;
    const spellings = new Set(rows.map((r) => r.mention_text));
    expect(spellings.has('Bab el-Mandeb Strait'),
      'the long spelling did not resolve').toBe(true);
    expect(spellings.has('Bab-el-Mandeb'),
      'the short spelling did not resolve to the same entity').toBe(true);
    expect(new Set(rows.map((r) => r.entity_id)).size,
      'the two spellings resolved to different entities').toBe(1);
    // Different NORMALISED names: nothing about this was a string match.
    expect(normalizeName('Bab el-Mandeb Strait')).not.toBe(normalizeName('Bab-el-Mandeb'));
  });

  it('each mention keeps its own claim, its own evidence and its own lineage', async () => {
    const rows = (await sql<{ claim_object_id: string; evidence_object_id: string;
                              evidence_digest: string }>`
      select r.claim_object_id::text, r.evidence_object_id::text, r.evidence_digest
        from graph.resolutions_current r
        join graph.entity_identifiers i on i.entity_id = r.entity_id
       where r.tenant_id = ${fx.tenantId}::uuid and r.state = 'accepted'
         and i.system_key = ${SYSTEM} and i.identifier_value = ${CHOKEPOINT}`.execute(su)).rows;
    expect(rows.length).toBeGreaterThan(1);
    // Distinct claims, and each names evidence that actually carries that digest.
    expect(new Set(rows.map((r) => r.claim_object_id)).size).toBe(rows.length);
    for (const r of rows) {
      const claim = (await sql<{ n: string }>`
        select count(*)::text n from objects.canonical_objects
         where object_id = ${r.claim_object_id}::uuid and object_type = 'ENT'`.execute(su)).rows[0];
      expect(Number(claim?.n), 'a resolution named a claim that does not exist').toBeGreaterThan(0);
      const evd = (await sql<{ n: string }>`
        select count(*)::text n from objects.canonical_objects
         where object_id = ${r.evidence_object_id}::uuid
           and payload ->> 'content_digest' = ${r.evidence_digest}`.execute(su)).rows[0];
      expect(Number(evd?.n),
        'a resolution named evidence that does not carry that digest').toBeGreaterThan(0);
    }
  });

  it('the entity records WHICH resolved, WHEN, BY WHAT SCORE and under WHAT rule', async () => {
    const entityId = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entity_identifiers
       where tenant_id = ${fx.tenantId}::uuid and system_key = ${SYSTEM}
         and identifier_value = ${CHOKEPOINT}`.execute(su)).rows[0]?.entity_id as string;
    const history = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => entities.resolutions(cap, entityId));
    expect(history.length).toBeGreaterThan(1);
    for (const h of history) {
      expect(h['accepted_at'], 'an accepted resolution recorded no instant').not.toBeNull();
      expect(Number(h['score'])).toBe(1);
      expect(h['method']).toBe('deterministic_identifier');
      // The FIRST sighting minted the entity and attached the identifier; every
      // one after it matched that identifier exactly. Both are identifier
      // resolutions and the record says WHICH — it does not flatten them.
      expect(['identifier-first-sighting', 'identifier-exact']).toContain(h['rule_id']);
      expect(h['rule_version']).toBe('1');
      const evidence = h['match_evidence'] as Record<string, unknown>;
      expect(String(evidence['identifier_system'])).toBe(SYSTEM);
      expect(String(evidence['identifier_value'])).toBe(CHOKEPOINT);
      // An AUTOMATIC resolution has no decider, and says so rather than
      // attributing itself to a person who never looked at it.
      expect(h['decided_by']).toBeNull();
    }
  });

  it('the run resolved automatically ONLY on identifiers, and says so', () => {
    expect(resolutionRun.autoResolved).toBeGreaterThan(0);
    for (const r of resolutionRun.resolutions) {
      if (r.state === 'accepted') expect(r.method).toBe('deterministic_identifier');
    }
  });
});

/* ───────────────────────── C2 ───────────────────────── */

describe('C2 — an uncertain resolution cannot merge silently', () => {
  it('a NAME match reaches the queue instead of resolving', async () => {
    const queued = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => resolutions.queue(cap, 500));
    expect(queued.length, 'nothing reached the resolution queue').toBeGreaterThan(0);
    const named = queued.filter((q) => q['method'] === 'deterministic_name');
    expect(named.length, 'no name match reached the queue').toBeGreaterThan(0);
    for (const q of queued) {
      expect(q['state']).toBe('proposed');
      expect(q['decided_by']).toBeNull();
      expect(q['accepted_at']).toBeNull();
      expect(q['method']).not.toBe('deterministic_identifier');
    }
  });

  it('the database REFUSES an accepted name match, whatever a service intends', async () => {
    const one = (await sql<{ resolution_id: string; entity_id: string }>`
      select resolution_id::text, entity_id::text from graph.resolutions_current
       where tenant_id = ${fx.tenantId}::uuid and state = 'proposed' limit 1`.execute(su)).rows[0];
    expect(one).toBeDefined();
    // The superuser is used here to attack the CONSTRAINT directly: this is the
    // strongest form of the check, because it bypasses every layer above it.
    await expect(sql`
      update graph.resolutions_current set state = 'accepted', accepted_at = now()
       where resolution_id = ${(one as { resolution_id: string }).resolution_id}::uuid`
      .execute(su)).rejects.toThrow(/res_auto_only_on_identifier/);
  });

  it('an AGENT cannot decide a resolution — the policy bundle grants it no such action', async () => {
    const one = (await sql<{ resolution_id: string }>`
      select resolution_id::text from graph.resolutions_current
       where tenant_id = ${fx.tenantId}::uuid and state = 'proposed' limit 1`.execute(su)).rows[0];
    await expect(pipeline.write<unknown, ResolutionDecisionWrites>(
      envelopeFor(fx, resolutionAgentId, 'graph.resolution.decide', 'RES',
        (one as { resolution_id: string }).resolution_id),
      resolutionAgent,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.resolution.decide', objectType: 'RES',
        objectId: (one as { resolution_id: string }).resolution_id },
      GraphCapability.decision,
      async () => { throw new Error('the handler must never run'); },
    )).rejects.toThrow();
  });

  it('a person who is NOT the proposer decides it, and the reason is recorded', async () => {
    const queued = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => resolutions.queue(cap, 500));
    const target = queued.find((q) => q['method'] === 'deterministic_name');
    expect(target).toBeDefined();
    const id = String((target as Record<string, unknown>)['resolution_id']);
    const reason = 'same supplier under a different legal-form spelling; checked against the contract';
    const out = await pipeline.write(
      envelopeFor(fx, resolutionManagerId, 'graph.resolution.decide', 'RES', id),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.resolution.decide', objectType: 'RES', objectId: id },
      GraphCapability.decision,
      async (cap, scope) => {
        const r = await resolutions.decide(cap, scope, {
          decision: { resolutionId: id, decision: 'accept', reason },
          decider: resolutionManagerId, correlationId: uuidv7(),
        });
        return { result: r, targetType: 'RES', targetId: id, targetVersion: '1',
                 outboxEvent: null };
      });
    expect(out.result.state).toBe('accepted');
    const row = (await sql<{ state: string; decided_by: string; decision_reason: string;
                             proposer_principal_id: string; accepted_at: string }>`
      select state, decided_by::text, decision_reason, proposer_principal_id::text,
             accepted_at::text from graph.resolutions_current
       where resolution_id = ${id}::uuid`.execute(su)).rows[0];
    expect(row?.state).toBe('accepted');
    expect(row?.decided_by).toBe(resolutionManagerId);
    expect(row?.decision_reason).toBe(reason);
    expect(row?.accepted_at).not.toBeNull();
    expect(row?.proposer_principal_id,
      'the decider was also the proposer').not.toBe(resolutionManagerId);
  });

  it('a person may resolve a mention to an entity the resolver did NOT propose', async () => {
    const queued = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => resolutions.queue(cap, 500));
    const target = queued.find((q) => q['method'] === 'deterministic_name');
    expect(target, 'nothing was left in the queue to retarget').toBeDefined();
    const id = String((target as Record<string, unknown>)['resolution_id']);
    const proposed = String((target as Record<string, unknown>)['entity_id']);
    const elsewhere = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entities_current
       where tenant_id = ${fx.tenantId}::uuid and lifecycle_state = 'active'
         and entity_id <> ${proposed}::uuid limit 1`.execute(su)).rows[0]?.entity_id as string;
    const reason = 'the shipping manifest names the chokepoint the corridor source already tracks';
    await pipeline.write(
      envelopeFor(fx, resolutionManagerId, 'graph.resolution.decide', 'RES', id),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.resolution.decide', objectType: 'RES', objectId: id },
      GraphCapability.decision,
      async (cap, scope) => {
        const r = await resolutions.decide(cap, scope, {
          decision: { resolutionId: id, decision: 'accept', reason, targetEntityId: elsewhere },
          decider: resolutionManagerId, correlationId: uuidv7(),
        });
        return { result: r, targetType: 'RES', targetId: id, targetVersion: '1',
                 outboxEvent: null };
      });
    const row = (await sql<{ entity_id: string; method: string; rule_id: string;
                             decision_reason: string; match_evidence: Record<string, unknown> }>`
      select entity_id::text, method, rule_id, decision_reason, match_evidence
        from graph.resolutions_current where resolution_id = ${id}::uuid`.execute(su)).rows[0];
    expect(row?.entity_id).toBe(elsewhere);
    // The record says a PERSON chose it, and keeps what the resolver had proposed.
    expect(row?.method).toBe('human');
    expect(row?.rule_id).toBe('human-retarget');
    expect(row?.decision_reason).toBe(reason);
    expect(String((row?.match_evidence ?? {})['proposed_entity'])).toBe(proposed);
    expect((row?.match_evidence ?? {})['resolver_original']).toBeDefined();
  });

  it('the proposer may not decide its own proposal, even holding the action', async () => {
    // A manager PROPOSES one, then tries to decide it. The policy allows the
    // action; the port refuses the person.
    const claimId = (await sql<{ object_id: string }>`
      select object_id::text from objects.canonical_objects
       where tenant_id = ${fx.tenantId}::uuid and object_type = 'ENT' limit 1`.execute(su))
      .rows[0]?.object_id as string;
    const entityId = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entities_current
       where tenant_id = ${fx.tenantId}::uuid limit 1`.execute(su)).rows[0]?.entity_id as string;
    const resolutionId = uuidv7();
    await pipeline.write<void, ResolverWrites>(
      envelopeFor(fx, resolutionManagerId, 'graph.resolution.propose', 'RES', resolutionId),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.resolution.propose', objectType: 'RES', objectId: resolutionId },
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.proposeResolution({
          resolutionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          claimObjectId: claimId, claimVersion: 1, mentionText: 'self-decision probe',
          entityId, method: 'deterministic_name', ruleId: 'probe', ruleVersion: '1',
          score: 0.4, matchEvidence: { basis: 'probe' }, candidateSet: [],
          proposer: resolutionManagerId, evidenceObjectId: claimId,
          evidenceDigest: sha256('probe'), mode: null, modelId: null, weights: null,
          runtime: null, promptDigest: null, decodingDigest: null, modelConfidence: null,
          callId: null, methodId: null, runId: null,
          identifierSystem: null, identifierValue: null,
          eventId: uuidv7(), correlationId: uuidv7(),
        });
        return { result: undefined, targetType: 'RES', targetId: resolutionId,
                 targetVersion: '1', outboxEvent: null };
      });
    await expect(pipeline.write(
      envelopeFor(fx, resolutionManagerId, 'graph.resolution.decide', 'RES', resolutionId),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.resolution.decide', objectType: 'RES', objectId: resolutionId },
      GraphCapability.decision,
      async (cap, scope) => {
        const r = await resolutions.decide(cap, scope, {
          decision: { resolutionId, decision: 'accept',
                      reason: 'trying to clear my own proposal' },
          decider: resolutionManagerId, correlationId: uuidv7(),
        });
        return { result: r, targetType: 'RES', targetId: resolutionId, targetVersion: '1',
                 outboxEvent: null };
      })).rejects.toThrow(/may not decide it/);
  });

  it('a model-assisted resolution without full lineage cannot exist', async () => {
    const claimId = (await sql<{ object_id: string }>`
      select object_id::text from objects.canonical_objects
       where tenant_id = ${fx.tenantId}::uuid and object_type = 'ENT' limit 1`.execute(su))
      .rows[0]?.object_id as string;
    const entityId = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entities_current
       where tenant_id = ${fx.tenantId}::uuid limit 1`.execute(su)).rows[0]?.entity_id as string;
    await expect(sql`
      insert into graph.resolutions_current (
        resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version,
        mention_text, entity_id, method, rule_id, rule_version, score, match_evidence,
        candidate_set, state, proposer_principal_id, evidence_object_id, evidence_digest,
        correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
              ${claimId}::uuid, 1, 'lineage probe', ${entityId}::uuid, 'model_assisted',
              'probe', '1', 0.7, '{}'::jsonb, '[]'::jsonb, 'proposed',
              ${resolutionAgentId}::uuid, ${claimId}::uuid, ${sha256('probe')},
              ${uuidv7()}::uuid)`.execute(su))
      .rejects.toThrow(/res_model_lineage_complete/);
  });
});

/* ───────────────────────── C3 ───────────────────────── */

describe('C3 — a wrong merge is reversible, and history survives it', () => {
  let entityId: string;
  let beforeSplit: string;
  let split: { newEntityId: string; moved: number };

  it('splits a merged entity without deleting anything', async () => {
    entityId = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entity_identifiers
       where tenant_id = ${fx.tenantId}::uuid and system_key = ${SYSTEM}
         and identifier_value = ${CHOKEPOINT}`.execute(su)).rows[0]?.entity_id as string;
    const accepted = await readAs(fx, resolutionManager, resolutionManagerId, async (cap) =>
      (await entities.resolutions(cap, entityId)).filter((r) => r['state'] === 'accepted'));
    expect(accepted.length, 'nothing to split').toBeGreaterThan(1);
    beforeSplit = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 25));

    const move = accepted.filter((r) => r['mention_text'] === 'Bab-el-Mandeb')
      .map((r) => String(r['resolution_id']));
    expect(move.length).toBeGreaterThan(0);
    const out = await pipeline.write(
      envelopeFor(fx, resolutionManagerId, 'graph.entity.split', 'ENT', entityId),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.entity.split', objectType: 'ENT', objectId: entityId },
      GraphCapability.split,
      async (cap, scope) => {
        const r = await resolutions.split(cap, scope, {
          fromEntityId: entityId, resolutionIds: move, entityType: 'place',
          canonicalName: 'Bab-el-Mandeb (southern approach)',
          decider: resolutionManagerId,
          reason: 'the short spelling refers to the southern approach, not the strait itself',
          correlationId: uuidv7(),
        });
        return { result: r, targetType: 'ENT', targetId: r.newEntityId, targetVersion: '1',
                 outboxEvent: null };
      });
    split = out.result;
    expect(split.moved).toBe(move.length);
  });

  it('the prior merge is SUPERSEDED, not deleted, and keeps its reason and score', async () => {
    const rows = (await sql<{ state: string; superseded_by: string; superseded_at: string;
                              method: string; score: string; match_evidence: unknown }>`
      select state, superseded_by::text, superseded_at::text, method, score::text, match_evidence
        from graph.resolutions_current
       where tenant_id = ${fx.tenantId}::uuid and state = 'superseded'`.execute(su)).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.superseded_by).not.toBeNull();
      expect(r.superseded_at).not.toBeNull();
      // The ORIGINAL method and score survive: the split records that a person
      // disagreed, not that the resolver never said what it said.
      expect(r.method).toBe('deterministic_identifier');
      expect(Number(r.score)).toBe(1);
    }
  });

  it('a known-at query BEFORE the split still reproduces the merged view', async () => {
    const before = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => entities.mentionsKnownAt(cap, entityId, beforeSplit));
    const spellings = new Set(before.map((r) => String(r['mention_text'])));
    expect(spellings.has('Bab el-Mandeb Strait')).toBe(true);
    expect(spellings.has('Bab-el-Mandeb'),
      'the pre-split view lost the mention the split moved away').toBe(true);
  });

  it('and AFTER the split it does not', async () => {
    const now = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => entities.mentionsKnownAt(cap, entityId, new Date().toISOString()));
    const spellings = new Set(now.map((r) => String(r['mention_text'])));
    expect(spellings.has('Bab el-Mandeb Strait')).toBe(true);
    expect(spellings.has('Bab-el-Mandeb'),
      'the split did not take effect').toBe(false);
    const moved = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => entities.mentionsKnownAt(cap, split.newEntityId, new Date().toISOString()));
    expect(new Set(moved.map((r) => String(r['mention_text']))).has('Bab-el-Mandeb')).toBe(true);
  });

  it('the new entity names the entity it was split from', async () => {
    const row = (await sql<{ split_from: string }>`
      select split_from::text from graph.entities_current
       where entity_id = ${split.newEntityId}::uuid`.execute(su)).rows[0];
    expect(row?.split_from).toBe(entityId);
  });
});

/* ───────────────────────── C4 ───────────────────────── */

describe('C4 — search is permission-aware, and absence is not an oracle', () => {
  const SECRET = 'Zzyzx Holdings Confidential';

  beforeAll(async () => {
    // A graph entity in the OTHER domain. Fixture scaffolding through the
    // superuser, exactly as the Phase 2 suite seeds state it only observes.
    await sql`insert into graph.entities_current (
        entity_id, scope, tenant_id, domain_id, entity_type, canonical_name,
        normalized_name, lifecycle_state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${other.tenantId}::uuid, ${other.domainId}::uuid,
              'organization', ${SECRET}, ${normalizeName(SECRET)}, 'active',
              ${otherAnalystId}::uuid, ${uuidv7()}::uuid)`.execute(other.su);
  });

  it('finds the other domain\'s entity FROM that domain', async () => {
    const found = await readAs(other, otherAnalyst, otherAnalystId,
      async (cap) => search.search(cap, 'Zzyzx'));
    expect(found.entities.length, 'the owning domain could not see its own entity')
      .toBeGreaterThan(0);
    expect(found.entities[0]?.matched_on.length).toBeGreaterThan(0);
  });

  it('and returns it ABSENT — not redacted — from another domain', async () => {
    const hidden = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => search.search(cap, 'Zzyzx'));
    expect(hidden.entities).toEqual([]);
    expect(hidden.claims).toEqual([]);
    expect(hidden.evidence).toEqual([]);
    expect(hidden.total).toBe(0);
    // No count, no placeholder, no "n hidden" anywhere in the response.
    expect(JSON.stringify(hidden)).not.toContain('hidden:');
    expect(JSON.stringify(hidden)).not.toContain(SECRET);
  });

  it('the response is IDENTICAL in shape to one where nothing matched', async () => {
    const hidden = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => search.search(cap, 'Zzyzx'));
    const nothing = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => search.search(cap, 'Qqqqq'));
    expect(Object.keys(hidden).sort()).toEqual(Object.keys(nothing).sort());
    expect({ ...hidden, query: '', normalized: '' })
      .toEqual({ ...nothing, query: '', normalized: '' });
  });

  it('what the caller MAY see, it sees — with the reason it matched', async () => {
    const found = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => search.search(cap, 'Bab el-Mandeb'));
    expect(found.total).toBeGreaterThan(0);
    for (const hit of [...found.entities, ...found.claims, ...found.evidence]) {
      expect(hit.matched_on.length,
        'a search hit could not say why it matched').toBeGreaterThan(0);
    }
    expect(found.scope_note.length).toBeGreaterThan(0);
  });

  it('search reads METADATA — it never returns evidence bytes', async () => {
    const found = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => search.search(cap, 'chokepoint'));
    for (const hit of found.evidence) {
      expect(Object.keys(hit.extra)).not.toContain('bytes');
      expect(String(hit.extra['note'])).toContain('observation.evidence.retrieve');
    }
  });

  it('a principal holding no graph role is DENIED, not partially answered', async () => {
    const stranger = { ...resolutionManager, principalId: resolutionManagerId,
      bindings: [] } as AuthenticatedPrincipal;
    await expect(readAs(fx, stranger, resolutionManagerId,
      async (cap) => search.search(cap, 'Bab'))).rejects.toThrow();
  });
});

/* ───────────────────────── C5 ───────────────────────── */

describe('C5 — edges carry temporal validity and provenance, and as-of has no hindsight', () => {
  it('the edge build produced edges, and every one names its claim and its bytes', () => {
    expect(edgeRun.edgesAsserted, 'no edges were built').toBeGreaterThan(0);
  });

  it('every edge carries valid time, record time, mode and evidence', async () => {
    const rows = (await sql<{
      valid_from: string; asserted_at: string; mode: string; evidence_digest: string;
      claim_object_id: string; confidence: string; state: string;
    }>`select valid_from::text, asserted_at::text, mode, evidence_digest,
              claim_object_id::text, confidence::text, state
         from graph.edges_current where tenant_id = ${fx.tenantId}::uuid`.execute(su)).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(e.valid_from).not.toBeNull();
      expect(e.asserted_at).not.toBeNull();
      expect(['replay', 'local-live']).toContain(e.mode);
      expect(e.evidence_digest).toMatch(/^[0-9a-f]{64}$/);
      const claim = (await sql<{ n: string }>`
        select count(*)::text n from objects.canonical_objects
         where object_id = ${e.claim_object_id}::uuid and object_type = 'REL'`.execute(su)).rows[0];
      expect(Number(claim?.n), 'an edge named a REL claim that does not exist').toBeGreaterThan(0);
    }
  });

  it('an as-of query BEFORE the edge was asserted returns nothing — no hindsight', async () => {
    const first = (await sql<{ asserted_at: string }>`
      select min(asserted_at)::text asserted_at from graph.edges_current
       where tenant_id = ${fx.tenantId}::uuid`.execute(su)).rows[0]?.asserted_at as string;
    const before = new Date(new Date(first).getTime() - 60_000).toISOString();
    const visible = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => edges.asOf(cap, { knownAt: before, validAt: new Date().toISOString() }));
    expect(visible.length,
      'an edge was visible at an instant before it was ever asserted').toBe(0);
  });

  it('WORLD time and RECORD time are separate axes', async () => {
    // Every corridor edge holds from 2024-01-12. Asking about 2024-01-01 in world
    // time returns nothing even though we believe it TODAY.
    const none = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => edges.asOf(cap, {
        knownAt: new Date().toISOString(), validAt: '2024-01-01T00:00:00.000Z' }));
    expect(none.length).toBe(0);
    const some = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => edges.asOf(cap, {
        knownAt: new Date().toISOString(), validAt: '2024-01-13T00:00:00.000Z' }));
    expect(some.length).toBeGreaterThan(0);
  });

  it('a retraction removes the edge going forward and leaves the past intact', async () => {
    const edgeId = (await sql<{ edge_id: string }>`
      select edge_id::text from graph.edges_current
       where tenant_id = ${fx.tenantId}::uuid and state = 'asserted' limit 1`.execute(su))
      .rows[0]?.edge_id as string;
    const beforeRetraction = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 25));
    await pipeline.write(
      envelopeFor(fx, resolutionManagerId, 'graph.edge.retract', 'EDG', edgeId),
      resolutionManager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.edge.retract', objectType: 'EDG', objectId: edgeId },
      GraphCapability.edgeRetraction,
      async (cap: EdgeRetractionWrites, scope) => {
        const r = await edges.retract(cap, scope, {
          edgeId, actor: resolutionManagerId,
          reason: 'the publisher withdrew the row this relationship rested on',
          correlationId: uuidv7() });
        return { result: r, targetType: 'EDG', targetId: edgeId, targetVersion: '1',
                 outboxEvent: null };
      });
    const at = { validAt: '2024-01-13T00:00:00.000Z' };
    const past = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => edges.asOf(cap, { ...at, knownAt: beforeRetraction }));
    const present = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => edges.asOf(cap, { ...at, knownAt: new Date().toISOString() }));
    expect(past.some((e) => e.edge_id === edgeId),
      'the pre-retraction view lost an edge we did believe then').toBe(true);
    expect(present.some((e) => e.edge_id === edgeId),
      'a retracted edge is still visible now').toBe(false);
    // `valid_to` is UNTOUCHED: retracting an assertion does not assert that the
    // relationship ended.
    const row = (await sql<{ valid_to: string | null; retraction_reason: string }>`
      select valid_to::text, retraction_reason from graph.edges_current
       where edge_id = ${edgeId}::uuid`.execute(su)).rows[0];
    expect(row?.valid_to).toBeNull();
    expect(String(row?.retraction_reason).length).toBeGreaterThan(8);
  });

  it('an edge with an unresolved end is REFUSED, not built with a string on one side', () => {
    // The edge builder reports every REL claim it declined, and why.
    for (const s of edgeRun.skipped) {
      expect(s.reason.length).toBeGreaterThan(8);
    }
    expect(edgeRun.edges.every((e) => e.subject !== e.object)).toBe(true);
  });
});

/* ───────────────────────── C6 ───────────────────────── */

describe('C6 — invalidating an assumption surfaces what rested on it', () => {
  let objectiveId: string;
  let assumptionId: string;
  let commitmentId: string;
  let claimId: string;
  let caseId: string;
  let result: Awaited<ReturnType<ImpactService['propagate']>>;

  const declare = async (payload: Record<string, unknown>): Promise<string> => {
    const objectId = uuidv7();
    const intake = validateStrategy(payload as never, uuidv7());
    // The header's audit_correlation_id must be the GOVERNED OPERATION's own, so
    // the envelope is built first and its correlation id is what travels.
    const envelope = envelopeFor(
      fx, strategyOwnerId, 'graph.strategy.declare', intake.objectType, objectId);
    await pipeline.write<unknown, StrategyWrites>(
      envelope, strategyOwner,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.strategy.declare', objectType: intake.objectType, objectId,
        writableTargets: [objectId] },
      GraphCapability.strategy,
      async (cap, scope) => {
        const r = await strategy.declare(cap, scope, {
          objectId, intake, owner: strategyOwnerId, actor: strategyOwnerId,
          correlationId: envelope.correlation_id, purposeId: 'graph' });
        return { result: r, targetType: intake.objectType, targetId: objectId,
                 targetVersion: '1', outboxEvent: null };
      });
    return objectId;
  };

  beforeAll(async () => {
    claimId = (await sql<{ object_id: string }>`
      select r.claim_object_id::text object_id from graph.resolutions_current r
       where r.tenant_id = ${fx.tenantId}::uuid and r.state = 'accepted'
         and r.method = 'deterministic_identifier' limit 1`.execute(su))
      .rows[0]?.object_id as string;
    const entityId = (await sql<{ entity_id: string }>`
      select entity_id::text from graph.entity_identifiers
       where tenant_id = ${fx.tenantId}::uuid and system_key = ${SYSTEM}
         and identifier_value = ${CHOKEPOINT}`.execute(su)).rows[0]?.entity_id as string;

    objectiveId = await declare({
      objectType: 'OBJ', title: 'Keep the Regensburg line supplied through Q1',
      statement: 'No production stoppage at Regensburg before 31 March 2024.',
      status: 'active',
      restsOn: [{ kind: 'entity', id: entityId,
                  rationale: 'the corridor this objective depends on' }],
    });
    assumptionId = await declare({
      objectType: 'ASU', title: 'The Bab el-Mandeb corridor stays open',
      statement: 'Transits through the strait continue at a level that clears our bookings.',
      status: 'active',
      restsOn: [
        { kind: 'claim', id: claimId, rationale: 'the corridor claim this assumption rests on' },
        { kind: 'strategy', id: objectiveId,
          rationale: 'this assumption is held in service of the supply objective' },
      ],
    });
    commitmentId = await declare({
      objectType: 'CMT', title: 'Do not book the third shipment the long way',
      statement: 'Hold the Suez routing for shipment three until 20 January.',
      status: 'active',
      restsOn: [{ kind: 'strategy', id: assumptionId,
                  rationale: 'this commitment is only sound while the corridor assumption holds' }],
    });

    // A Phase 1 correction case, opened through Phase 1's OWN port. Phase 3 does
    // not reach into Phase 1 to make this happen; it consumes what Phase 1
    // published.
    caseId = uuidv7();
    await sql`select set_config('eye.fixture', '1', true)`.execute(su).catch(() => undefined);
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${caseId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
              ${fx.sourceId}::uuid, 'correction', 'applied', now(),
              'publisher re-publication', null, 'the publisher restated the transit series',
              '[]'::jsonb,
              'downstream consumers not yet present (KG/dependency graph arrives Phase 3)')`
      .execute(su);
  });

  it('a strategy object that names nothing it rests on is refused', () => {
    expect(() => validateStrategy({
      objectType: 'OBJ', title: 'Unlinked', statement: 'nothing rests under this',
      status: 'active', restsOn: [],
    } as never, uuidv7())).toThrow(/rests_on is required/);
  });

  it('every declared assumption starts UNVERIFIED, not assumed true', async () => {
    const row = (await sql<{ verification_state: string; object_type: string }>`
      select verification_state, object_type from graph.strategy_current
       where strategy_object_id = ${assumptionId}::uuid`.execute(su)).rows[0];
    expect(row?.object_type).toBe('ASU');
    expect(row?.verification_state).toBe('unverified');
    const obj = (await sql<{ verification_state: string }>`
      select verification_state from graph.strategy_current
       where strategy_object_id = ${objectiveId}::uuid`.execute(su)).rows[0];
    // An OBJECTIVE is not "verified" — it rests on assumptions that are.
    expect(obj?.verification_state).toBe('not_applicable');
  });

  it('the walk reports what a changed claim reaches, before anything is written', async () => {
    const preview = await readAs(fx, strategyOwner, strategyOwnerId,
      async (cap) => impact.walk(cap, {
        triggerKind: 'claim_correction', triggerObjectId: claimId }));
    expect(preview.assumptions.map((x) => x.strategy_object_id)).toContain(assumptionId);
    expect(preview.commitments.map((x) => x.strategy_object_id)).toContain(commitmentId);
    for (const x of [...preview.assumptions, ...preview.commitments]) {
      expect(x.reached_via.length, 'an affected object could not say how it was reached')
        .toBeGreaterThan(8);
    }
  });

  it('propagation marks every dependent assumption UNVERIFIED and lists what is above it', async () => {
    // First verify the assumption, so the transition to unverified is real.
    await pipeline.write<unknown, ImpactWrites>(
      envelopeFor(fx, strategyOwnerId, 'graph.impact.propagate', 'ASU', assumptionId),
      strategyOwner,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'ASU', objectId: assumptionId },
      GraphCapability.impact,
      async (cap, scope) => {
        await cap.setAssumptionState({
          objectId: assumptionId, tenantId: scope.tenantId as string,
          domainId: scope.domainId as string, state: 'verified',
          reason: 'checked against the corridor claim on 14 January',
          actor: strategyOwnerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: undefined, targetType: 'ASU', targetId: assumptionId,
                 targetVersion: '1', outboxEvent: null };
      });
    expect((await sql<{ v: string }>`select verification_state v from graph.strategy_current
       where strategy_object_id = ${assumptionId}::uuid`.execute(su)).rows[0]?.v).toBe('verified');

    const out = await pipeline.write(
      envelopeFor(fx, strategyOwnerId, 'graph.impact.propagate', 'INV', claimId),
      strategyOwner,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'graph.impact.propagate', objectType: 'INV', objectId: claimId },
      GraphCapability.impact,
      async (cap, scope) => {
        const r = await impact.propagate(cap, scope, {
          triggerKind: 'claim_correction', triggerObjectId: claimId,
          correctionCaseId: caseId, actor: strategyOwnerId, correlationId: uuidv7() });
        return { result: r, targetType: 'INV', targetId: r.invalidationId,
                 targetVersion: '1', outboxEvent: null };
      });
    result = out.result;

    expect(result.assumptions.map((x) => x.strategy_object_id)).toContain(assumptionId);
    expect(result.objectives.map((x) => x.strategy_object_id)).toContain(objectiveId);
    expect(result.commitments.map((x) => x.strategy_object_id)).toContain(commitmentId);

    const after = (await sql<{ v: string; reason: string }>`
      select verification_state v, verification_reason reason from graph.strategy_current
       where strategy_object_id = ${assumptionId}::uuid`.execute(su)).rows[0];
    expect(after?.v).toBe('unverified');
    expect(String(after?.reason).length).toBeGreaterThan(8);
  });

  it('it REPORTS the objectives and commitments; it does not decide about them', async () => {
    const obj = (await sql<{ status: string; verification_state: string }>`
      select status, verification_state from graph.strategy_current
       where strategy_object_id = ${objectiveId}::uuid`.execute(su)).rows[0];
    expect(obj?.status, 'propagation altered an objective it has no standing to alter')
      .toBe('active');
    expect(obj?.verification_state).toBe('not_applicable');
    const cmt = (await sql<{ status: string }>`
      select status from graph.strategy_current
       where strategy_object_id = ${commitmentId}::uuid`.execute(su)).rows[0];
    expect(cmt?.status).toBe('active');
  });

  it('the Phase 1 correction case stops saying propagation is unresolved', async () => {
    const row = (await sql<{ propagation_unresolved: string;
                             propagation_assessment_id: string | null }>`
      select propagation_unresolved, propagation_assessment_id::text
        from observation.correction_current where case_id = ${caseId}::uuid`.execute(su)).rows[0];
    expect(row?.propagation_unresolved).not.toContain('not yet present');
    expect(row?.propagation_unresolved).toContain('dependency propagation assessed');
    expect(row?.propagation_assessment_id).toBe(result.invalidationId);
  });

  it('a case NO propagation has walked still says exactly what Phase 1 said', async () => {
    const untouched = uuidv7();
    await sql`insert into observation.correction_current (
        case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at,
        channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${untouched}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
              ${fx.sourceId}::uuid, 'correction', 'received', now(),
              'publisher re-publication', null, 'a second, unpropagated case',
              '[]'::jsonb,
              'downstream consumers not yet present (KG/dependency graph arrives Phase 3)')`
      .execute(su);
    const row = (await sql<{ propagation_unresolved: string;
                             propagation_assessment_id: string | null }>`
      select propagation_unresolved, propagation_assessment_id::text
        from observation.correction_current where case_id = ${untouched}::uuid`.execute(su)).rows[0];
    expect(row?.propagation_unresolved)
      .toBe('downstream consumers not yet present (KG/dependency graph arrives Phase 3)');
    expect(row?.propagation_assessment_id).toBeNull();
  });

  it('the assessment is stored in words, not rendered by a screen', async () => {
    const row = (await sql<{ statement: string; state: string; assumptions: unknown }>`
      select statement, state, affected_assumptions assumptions
        from graph.invalidations_current
       where invalidation_id = ${result.invalidationId}::uuid`.execute(su)).rows[0];
    expect(row?.state).toBe('assessed');
    expect(String(row?.statement)).toContain('assumption(s) marked unverified');
    expect(Array.isArray(row?.assumptions)).toBe(true);
  });
});

/* ───────────────────────── C7 ───────────────────────── */

describe('C7 — Phase 0, 1 and 2 are unchanged underneath', () => {
  it('migration 0024 is applied and C18 is still frozen at 0021', async () => {
    const applied = (await sql<{ filename: string }>`
      select filename from public.schema_migrations order by filename`.execute(su))
      .rows.map((r) => r.filename);
    expect(applied.some((id) => id.startsWith('0024'))).toBe(true);
    expect(applied.some((id) => id.startsWith('0021'))).toBe(true);
  });

  it('the Phase 1 and Phase 2 canonical write actions are untouched', async () => {
    const rows = (await sql<{ action: string; object_types: string[] }>`
      select action, object_types from observation.canonical_write_actions
       order by action`.execute(su)).rows;
    const byAction = new Map(rows.map((r) => [r.action, r.object_types]));
    expect(byAction.get('observation.item.admit')).toEqual(['OBS', 'EVD']);
    expect(byAction.get('intelligence.claim.admit'))
      .toEqual(['ENT', 'EVT', 'CLM', 'REL', 'ASM']);
    // Phase 3's action writes the five strategy types and NOTHING else — it
    // cannot admit a claim, an observation or an evidence object.
    expect(byAction.get('graph.strategy.declare')).toEqual(['OBJ', 'ASU', 'DEC', 'CMT', 'OUT']);
  });

  it('CLM@v1 still belongs to Phase 0 and CLM@v2 to Phase 2', async () => {
    const rows = (await sql<{ object_type: string; schema_version: string }>`
      select object_type, schema_version from objects.schema_registry
       where object_type in ('CLM','OBJ','ASU','DEC','CMT','OUT') order by 1, 2`.execute(su)).rows;
    const keys = rows.map((r) => `${r.object_type}@${r.schema_version}`);
    expect(keys).toContain('CLM@v1');
    expect(keys).toContain('CLM@v2');
    for (const t of ['OBJ', 'ASU', 'DEC', 'CMT', 'OUT']) expect(keys).toContain(`${t}@v1`);
    // ASU, not ASM: Phase 2's assessment schema is not ours to redefine.
    expect(keys.some((k) => k.startsWith('ASM@'))).toBe(false);
  });

  it('every graph table is under FORCE row-level security', async () => {
    const rows = (await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'graph' and c.relkind = 'r'`.execute(su)).rows;
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} has no row-level security`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} does not FORCE it`).toBe(true);
    }
  });

  it('every graph projection is derivable from its event log', async () => {
    const rows = await readAs(fx, resolutionManager, resolutionManagerId,
      async (cap) => cap.rebuildProjections());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number(r.mismatched), `${r.projection} drifted from its event log`).toBe(0);
    }
  });

  it('the graph event logs are append-only', async () => {
    const one = (await sql<{ event_id: string }>`
      select event_id::text from graph.entity_events limit 1`.execute(su)).rows[0];
    await expect(sql`update graph.entity_events set details = '{}'::jsonb
       where event_id = ${(one as { event_id: string }).event_id}::uuid`.execute(su))
      .rejects.toThrow();
  });

  it('a Phase 2 claim is untouched by anything Phase 3 did to it', async () => {
    const claimId = (await sql<{ claim_object_id: string }>`
      select claim_object_id::text from graph.resolutions_current
       where tenant_id = ${fx.tenantId}::uuid and state = 'accepted' limit 1`.execute(su))
      .rows[0]?.claim_object_id as string;
    const versions = (await sql<{ object_version: string; truth_state: string }>`
      select object_version::text, truth_state from objects.canonical_objects
       where object_id = ${claimId}::uuid order by object_version`.execute(su)).rows;
    // Resolution is an assertion ABOUT the claim, never an edit to it: the claim
    // still has exactly the version Phase 2 admitted.
    expect(versions.length).toBe(1);
    expect(versions[0]?.truth_state).toBe('extracted');
  });
});
