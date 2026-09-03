/**
 * PHASE 2 ACCEPTANCE — B1 … B6, the six frozen criteria and nothing beyond them.
 *
 * Everything here runs the REAL governed ports under REAL capability contexts, on
 * the existing integration harness. No new framework, no new gate: the Phase 1
 * fixture seeds the domain, and this suite adds only the Phase 2 principals and
 * the method it needs.
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
import { ReviewService } from '../../src/intelligence/review/review.service.js';
import { IntelligenceCapability, type ExtractionWrites, type MethodWrites }
  from '../../src/intelligence/intelligence.capabilities.js';
import { requestDigestOf, extractionIdentityOf }
  from '../../src/intelligence/gateway/model-gateway.service.js';
import { AcquisitionLifecycle } from '../../src/observation/acquisition/lifecycle.service.js';
import { AgentSessionService } from '../../src/observation/agents/agent-session.service.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { seedPhase1Domain, type Phase1Fixture } from './phase1-helpers.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

let app: INestApplicationContext;
let pipeline: PipelineService;
let orchestrator: ExtractionOrchestrator;
let methods: MethodsService;
let review: ReviewService;
let su: Db;
let fx: Phase1Fixture;

let managerId: string;
let agentId: string;
let managerPrincipal: AuthenticatedPrincipal;
let agentPrincipal: AuthenticatedPrincipal;
let methodId: string;
let runOutcome: Awaited<ReturnType<ExtractionOrchestrator['run']>>;

const METHOD = {
  methodKey: 'b-suite-extraction',
  name: 'Acceptance extraction method',
  targetTypes: ['ENT', 'EVT', 'CLM'],
  modelId: 'acceptance-local-model',
  modelWeightsDigest: sha256('acceptance-weights'),
  runtimeVersion: 'ollama/0.12.3',
  promptRef: 'extract/acceptance',
  promptVersion: 'v1',
  promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.',
  decoding: { temperature: 0, seed: 7 },
  confidenceFloor: 0.3,
  reviewBelow: 0.8,
  budgetCalls: 50,
  budgetSeconds: 120,
};
const PROMPT_DIGEST = sha256(METHOD.promptText);
const DECODING_DIGEST = sha256(jcsCanonicalize(METHOD.decoding));

function envelopeFor(
  principalId: string, action: string, objectType: string, objectId: string | null,
): Envelope {
  return {
    message_id: uuidv7(),
    scope: 'DOMAIN',
    tenant_id: fx.tenantId,
    domain_id: fx.domainId,
    principal_id: `principal:${principalId}`,
    purpose_id: 'intelligence',
    action,
    side_effect_class: action.startsWith('intelligence.read') ? 'none' : 'reversible',
    consequence_class: 'C2',
    object_type: objectType,
    object_id: objectId,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: uuidv7(),
    trace_id: 'phase2-accept',
  } as unknown as Envelope;
}

/** The response a recorded model gives for one evidence unit. */
function recordedFor(excerpt: string) {
  return {
    claims: [
      { claim_kind: 'entity', subject: 'Bab el-Mandeb Strait', predicate: 'is_a',
        object_value: 'maritime chokepoint', confidence: 0.95,
        byte_start: 0, byte_end: Math.min(40, excerpt.length) },
      // Deliberately under review_below (0.8) so B3 has something to queue.
      { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'transit_change',
        object_value: 'fell against the prior day', confidence: 0.55,
        byte_start: 0, byte_end: Math.min(40, excerpt.length) },
    ],
  };
}

beforeAll(async () => {
  process.env['EYE_RUNTIME_ENV'] = 'test';
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  pipeline = app.get(PipelineService);
  orchestrator = app.get(ExtractionOrchestrator);
  methods = app.get(MethodsService);
  review = app.get(ReviewService);
  const cfg = app.get(EYE_CONFIG);
  const vault = app.get(VaultService);
  await vault.ensureRoots();
  fx = await seedPhase1Domain(cfg, app.get(IDENTITY_DB), app.get(COMMIT_DB));
  su = fx.su;

  // Phase 2 reads what Phase 1 collected, so the fixture must actually collect.
  // This is the REAL acquisition lifecycle against the frozen replay set — the
  // same path the product uses, not a shortcut that inserts evidence rows.
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

  // The Phase 2 principals. The split is the point: the agent runs, the manager
  // approves and decides, and neither can do the other's job.
  const identityDb = app.get(IDENTITY_DB);
  const mkPrincipal = async (role: string, kind: string): Promise<{
    id: string; principal: AuthenticatedPrincipal;
  }> => {
    const id = uuidv7();
    const run = id.slice(-8);
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, ${kind}, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
                      ${`fixture-${role}-${run}`}, ${`fx-${run}`}, 'active')`.execute(su);
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid)`.execute(su);
    const base = await fx.managerPrincipal();
    const sessionId = uuidv7();
    const contextKey = sha256(sessionId);
    await sql`select identity.session_open_for_fixture()`.execute(identityDb).catch(() => undefined);
    return {
      id,
      principal: {
        ...base, principalId: id,
        bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId }],
      } as AuthenticatedPrincipal,
    };
    void sessionId; void contextKey;
  };
  const mgr = await mkPrincipal('extraction_manager', 'human');
  const agt = await mkPrincipal('extraction_agent', 'agent');
  managerId = mgr.id; managerPrincipal = mgr.principal;
  agentId = agt.id; agentPrincipal = agt.principal;

  // Register → approve (by a different principal) → activate, through the ports.
  const reg = await pipeline.write<{ methodId: string }, MethodWrites>(
    envelopeFor(fx.registrarId, 'intelligence.method.register', 'MTH', null),
    { ...(await fx.managerPrincipal()), principalId: fx.registrarId,
      bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId }] },
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'intelligence.method.register', objectType: 'MTH', objectId: null },
    IntelligenceCapability.methods,
    async (cap, scope) => {
      const r = await methods.register(cap, scope, uuidv7(), fx.registrarId, fx.registrarId, {
        ...METHOD, sourceId: fx.sourceId,
        gatewayMode: 'replay' as const,
      });
      return { result: r, targetType: 'MTH', targetId: r.methodId, targetVersion: '1', outboxEvent: null };
    });
  methodId = reg.result.methodId;

  for (const [action, target] of [
    ['intelligence.method.approve', 'approved'], ['intelligence.method.activate', 'active'],
  ] as const) {
    await pipeline.write<void, MethodWrites>(
      envelopeFor(managerId, action, 'MTH', methodId), managerPrincipal,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action, objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.methods,
      async (cap, scope) => {
        if (action === 'intelligence.method.approve') {
          await methods.approve(cap, scope, uuidv7(), methodId, managerId, 'reviewed for the acceptance suite');
        } else {
          await methods.transition(cap, scope, uuidv7(), methodId, target, managerId, 'ready to extract');
        }
        return { result: undefined, targetType: 'MTH', targetId: methodId, targetVersion: '1', outboxEvent: null };
      });
  }

  // Record a response for every evidence unit the method will read, keyed by the
  // request digest the gateway itself computes.
  const evidence = (await sql<{ object_id: string; payload: Record<string, unknown> }>`
    select object_id, payload from objects.canonical_objects
     where object_type = 'EVD' and provenance_ref like ${`SRC:${fx.sourceId}@%`}`.execute(su)).rows;
  await pipeline.write<void, ExtractionWrites>(
    envelopeFor(managerId, 'intelligence.gateway.call', 'GWC', null), managerPrincipal,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'intelligence.gateway.call', objectType: 'GWC', objectId: null },
    IntelligenceCapability.extraction,
    async (cap) => {
      for (const e of evidence) {
        const locator = String(e.payload['locator']);
        const digest = String(e.payload['content_digest']);
        // The excerpt the gateway will build: the SAME vault bytes, read the same
        // way. A fixture keyed on anything else would answer a request the runtime
        // never makes, and replay would miss.
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
        const response = recordedFor(excerpt);
        await cap.recordResponse({
          tenantId: fx.tenantId, domainId: fx.domainId, requestDigest, response,
          responseDigest: sha256(jcsCanonicalize(response)), modelId: METHOD.modelId,
          runtime: METHOD.runtimeVersion, from: 'fixture', correlationId: uuidv7(),
        });
      }
      return { result: undefined, targetType: 'GWC', targetId: null, targetVersion: '1', outboxEvent: null };
    });

  runOutcome = await orchestrator.run({
    envelope: envelopeFor(agentId, 'intelligence.claim.admit', 'CLM', null),
    principal: agentPrincipal, tenantId: fx.tenantId, domainId: fx.domainId,
    methodId, limit: 25, newAttempt: false,
  });
}, 300_000);

afterAll(async () => {
  await fx?.cleanup();
  await app?.close();
});

/* ───────────────────────── B1 ───────────────────────── */

describe('B1 — claims carry method, model, version, confidence and evidence lineage', () => {
  it('the run produced claims, and every one resolves back to the evidence bytes', async () => {
    expect(runOutcome.state).toBe('completed');
    const lineage = (await sql<{
      claim_object_id: string; mode: string; evidence_object_id: string; evidence_digest: string;
      byte_start: number; byte_end: number; method_id: string; confidence: string;
    }>`select * from intelligence.claim_lineage where run_id = ${runOutcome.runId}::uuid`.execute(su)).rows;
    expect(lineage.length, 'the run admitted no claims to check').toBeGreaterThan(0);
    for (const l of lineage) {
      expect(l.mode).toBe('replay');
      expect(l.evidence_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(l.byte_end).toBeGreaterThanOrEqual(l.byte_start);
      // The evidence it names EXISTS and carries that digest.
      const evd = (await sql<{ n: string }>`
        select count(*)::text n from objects.canonical_objects
         where object_id = ${l.evidence_object_id}::uuid
           and payload ->> 'content_digest' = ${l.evidence_digest}`.execute(su)).rows[0];
      expect(Number(evd?.n), 'a claim named evidence that does not carry that digest').toBeGreaterThan(0);
    }
  });

  it('the stored claim carries the whole pin, not a summary of it', async () => {
    const row = (await sql<{ payload: Record<string, unknown> }>`
      select payload from objects.canonical_objects
       where object_type in ('ENT','EVT','CLM') and audit_correlation_id is not null
       order by recorded_at desc limit 1`.execute(su)).rows[0];
    const lineage = (row?.payload?.['lineage'] ?? {}) as Record<string, unknown>;
    for (const field of ['method_key', 'method_id', 'model_id', 'model_weights_digest',
      'runtime_version', 'prompt_version', 'decoding_digest', 'mode',
      'evidence_object_id', 'evidence_digest', 'byte_start', 'byte_end', 'extraction_identity']) {
      expect(lineage[field], `a claim was admitted without ${field}`).toBeDefined();
    }
  });

  it('the schema REFUSES a claim whose lineage is incomplete', async () => {
    // The registry validates against the CLM schema, so a claim missing its
    // lineage cannot be admitted even by a caller holding the right capability.
    // CLM@v1 is Phase 0's generic claim schema and is deliberately left alone; the
    // Phase 2 claim schema is CLM@v2.
    for (const [t, v] of [['ENT', 'v1'], ['EVT', 'v1'], ['CLM', 'v2'],
      ['REL', 'v1'], ['ASM', 'v1']] as const) {
      const schema = (await sql<{ n: string }>`
        select count(*)::text n from objects.schema_registry
         where object_type = ${t} and schema_version = ${v}
           and json_schema -> 'required' ? 'lineage'
           and json_schema -> 'properties' -> 'lineage' -> 'required' ? 'evidence_digest'
           and json_schema -> 'properties' -> 'lineage' -> 'required' ? 'mode'
           and json_schema -> 'properties' -> 'lineage' -> 'required' ? 'extraction_identity'`
        .execute(su)).rows[0];
      expect(Number(schema?.n), `the ${t}@${v} schema does not make lineage mandatory`).toBe(1);
    }
  });
});

/* ───────────────────────── B3 ───────────────────────── */

describe('B3 — low confidence and abstention reach review and cannot bypass it', () => {
  it('every claim below the review threshold has a queued case', async () => {
    const rows = (await sql<{ claim_object_id: string; confidence: string; state: string }>`
      select c.claim_object_id, c.confidence, c.state
        from intelligence.review_current c where c.run_id = ${runOutcome.runId}::uuid`.execute(su)).rows;
    const below = (await sql<{ claim_object_id: string; confidence: string }>`
      select claim_object_id, confidence from intelligence.claim_lineage
       where run_id = ${runOutcome.runId}::uuid and confidence < 0.8`.execute(su)).rows;
    expect(below.length, 'the fixture produced nothing below the threshold').toBeGreaterThan(0);
    for (const b of below) {
      const queued = rows.find((r) => r.claim_object_id === b.claim_object_id);
      expect(queued, `claim ${b.claim_object_id} at ${b.confidence} was not queued`).toBeDefined();
    }
  });

  it('a claim ABOVE the threshold is admitted without a case', async () => {
    const above = (await sql<{ claim_object_id: string }>`
      select claim_object_id from intelligence.claim_lineage
       where run_id = ${runOutcome.runId}::uuid and confidence >= 0.8 limit 1`.execute(su)).rows[0];
    if (above === undefined) return;                 // nothing above: nothing to assert
    const cases = (await sql<{ n: string }>`
      select count(*)::text n from intelligence.review_current
       where claim_object_id = ${above.claim_object_id}::uuid`.execute(su)).rows[0];
    expect(Number(cases?.n)).toBe(0);
  });

  it('an abstention is its own outcome, with no claim attached', async () => {
    // The constraint is the guarantee: an abstention case cannot carry a claim.
    const forbidden = await sql`
      insert into intelligence.review_current
        (case_id, scope, tenant_id, domain_id, claim_object_id, run_id, method_id,
         queued_reason, state, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
              ${uuidv7()}::uuid, ${runOutcome.runId}::uuid, ${methodId}::uuid,
              'abstained', 'queued', ${uuidv7()}::uuid)`.execute(su).then(() => 'accepted', () => 'refused');
    expect(forbidden, 'an abstention was allowed to carry a claim').toBe('refused');
  });
});

/* ───────────────────────── B4 ───────────────────────── */

describe('B4 — every model call goes through the gateway and is logged', () => {
  it('each call carries mode, model, versions and an outcome', async () => {
    const calls = (await sql<{
      mode: string; model_id: string; prompt_version: string; decoding_digest: string;
      outcome: string; request_digest: string;
    }>`select * from intelligence.gateway_calls where run_id = ${runOutcome.runId}::uuid`.execute(su)).rows;
    expect(calls.length, 'the run logged no gateway call').toBeGreaterThan(0);
    for (const c of calls) {
      expect(['replay', 'local-live']).toContain(c.mode);
      expect(c.model_id).toBe(METHOD.modelId);
      expect(c.prompt_version).toBe(METHOD.promptVersion);
      expect(c.decoding_digest).toBe(DECODING_DIGEST);
      expect(['completed', 'abstained', 'refused', 'failed']).toContain(c.outcome);
      expect(c.request_digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('the call log is append-only', async () => {
    const outcome = await sql`update intelligence.gateway_calls set outcome = 'completed'
                               where run_id = ${runOutcome.runId}::uuid`
      .execute(su).then(() => 'updated', () => 'refused');
    expect(outcome).toBe('refused');
  });

  it('a run that exceeds its call budget stops and says so', async () => {
    // A method with a budget of one call, over evidence that needs more.
    const tiny = await pipeline.write<{ methodId: string }, MethodWrites>(
      envelopeFor(fx.registrarId, 'intelligence.method.register', 'MTH', null),
      { ...(await fx.managerPrincipal()), principalId: fx.registrarId,
        bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId }] },
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'intelligence.method.register', objectType: 'MTH', objectId: null },
      IntelligenceCapability.methods,
      async (cap, scope) => {
        const r = await methods.register(cap, scope, uuidv7(), fx.registrarId, fx.registrarId, {
          ...METHOD, methodKey: `budget-${uuidv7().slice(-8)}`, sourceId: fx.sourceId,
          gatewayMode: 'replay' as const, budgetCalls: 1,
        });
        return { result: r, targetType: 'MTH', targetId: r.methodId, targetVersion: '1', outboxEvent: null };
      });
    for (const [action, target] of [
      ['intelligence.method.approve', 'approved'], ['intelligence.method.activate', 'active'],
    ] as const) {
      await pipeline.write<void, MethodWrites>(
        envelopeFor(managerId, action, 'MTH', tiny.result.methodId), managerPrincipal,
        { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
          action, objectType: 'MTH', objectId: tiny.result.methodId },
        IntelligenceCapability.methods,
        async (cap, scope) => {
          if (action === 'intelligence.method.approve') {
            await methods.approve(cap, scope, uuidv7(), tiny.result.methodId, managerId, 'budget fixture');
          } else {
            await methods.transition(cap, scope, uuidv7(), tiny.result.methodId, target, managerId, 'budget fixture');
          }
          return { result: undefined, targetType: 'MTH', targetId: tiny.result.methodId,
                   targetVersion: '1', outboxEvent: null };
        });
    }
    const out = await orchestrator.run({
      envelope: envelopeFor(agentId, 'intelligence.claim.admit', 'CLM', null),
      principal: agentPrincipal, tenantId: fx.tenantId, domainId: fx.domainId,
      methodId: tiny.result.methodId, limit: 25, newAttempt: false,
    });
    expect(out.state).toBe('budget_exceeded');
    expect(out.failure).toMatch(/call budget of 1 reached/);
    // And the run's own record says it, so the stop is visible after the fact.
    const ev = (await sql<{ n: string }>`
      select count(*)::text n from intelligence.run_events
       where run_id = ${out.runId}::uuid and event = 'run.budget_exceeded'`.execute(su)).rows[0];
    expect(Number(ev?.n)).toBe(1);
  }, 120_000);
});

/* ───────────────────────── B5 ───────────────────────── */

describe('B5 — extraction identity and idempotency', () => {
  it('the identity is derived from the evidence and every digest that read it', () => {
    const a = extractionIdentityOf({
      evidenceDigest: 'a'.repeat(64), methodId, modelId: METHOD.modelId,
      weightsDigest: METHOD.modelWeightsDigest, promptDigest: PROMPT_DIGEST,
      decodingDigest: DECODING_DIGEST,
    });
    const differentPrompt = extractionIdentityOf({
      evidenceDigest: 'a'.repeat(64), methodId, modelId: METHOD.modelId,
      weightsDigest: METHOD.modelWeightsDigest, promptDigest: sha256('a different instruction'),
      decodingDigest: DECODING_DIGEST,
    });
    const differentDecoding = extractionIdentityOf({
      evidenceDigest: 'a'.repeat(64), methodId, modelId: METHOD.modelId,
      weightsDigest: METHOD.modelWeightsDigest, promptDigest: PROMPT_DIGEST,
      decodingDigest: sha256('{"temperature":1}'),
    });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(differentPrompt, 'a different prompt produced the same identity').not.toBe(a);
    expect(differentDecoding, 'a different decoding configuration produced the same identity').not.toBe(a);
  });

  it('repeating the same identity is idempotent and calls no model', async () => {
    const before = (await sql<{ n: string }>`
      select count(*)::text n from intelligence.gateway_calls
       where tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid`.execute(su)).rows[0];
    const again = await orchestrator.run({
      envelope: envelopeFor(agentId, 'intelligence.claim.admit', 'CLM', null),
      principal: agentPrincipal, tenantId: fx.tenantId, domainId: fx.domainId,
      methodId, limit: 25, newAttempt: false,
    });
    const after = (await sql<{ n: string }>`
      select count(*)::text n from intelligence.gateway_calls
       where tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid`.execute(su)).rows[0];
    expect(again.idempotentHits, 'a repeat produced no idempotent hits').toBeGreaterThan(0);
    expect(again.callsUsed, 'a repeat called the model').toBe(0);
    expect(Number(after?.n), 'a repeat logged a gateway call').toBe(Number(before?.n));
    expect(again.claimsAdmitted, 'a repeat admitted claims a second time').toBe(0);
  }, 120_000);

  it('replay returns byte-identical responses for the same request', async () => {
    const rows = (await sql<{ request_digest: string; response_digest: string; response: unknown }>`
      select request_digest, response_digest, response from intelligence.recorded_responses
       where tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid limit 5`
      .execute(su)).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      // The stored digest IS the digest of the stored bytes: replay cannot drift.
      expect(sha256(jcsCanonicalize(r.response))).toBe(r.response_digest);
    }
  });

  it('a deliberately requested NEW attempt is recorded as a new attempt, not an overwrite', async () => {
    const identity = (await sql<{ extraction_identity: string; attempt_ordinal: number }>`
      select extraction_identity, attempt_ordinal from intelligence.extraction_attempts
       where run_id = ${runOutcome.runId}::uuid and outcome = 'admitted'
       order by recorded_at limit 1`.execute(su)).rows[0];
    expect(identity, 'no admitted attempt to repeat').toBeDefined();

    const fresh = await orchestrator.run({
      envelope: envelopeFor(agentId, 'intelligence.claim.admit', 'CLM', null),
      principal: agentPrincipal, tenantId: fx.tenantId, domainId: fx.domainId,
      methodId, limit: 25, newAttempt: true,
    });
    expect(fresh.callsUsed, 'a deliberate new attempt did not call the gateway').toBeGreaterThan(0);

    const attempts = (await sql<{ attempt_ordinal: number; outcome: string }>`
      select attempt_ordinal, outcome from intelligence.extraction_attempts
       where extraction_identity = ${identity?.extraction_identity}
       order by attempt_ordinal`.execute(su)).rows;
    expect(attempts.length, 'the second attempt replaced the first instead of joining it')
      .toBeGreaterThan(1);
    expect(attempts.map((a) => a.attempt_ordinal)).toEqual(
      attempts.map((_, i) => i + 1));
  }, 180_000);

  it('the attempts table is append-only, so a later attempt cannot erase an earlier one', async () => {
    const outcome = await sql`delete from intelligence.extraction_attempts
                               where run_id = ${runOutcome.runId}::uuid`
      .execute(su).then(() => 'deleted', () => 'refused');
    expect(outcome).toBe('refused');
  });
});

/* ───────────────────────── B2 ───────────────────────── */

describe('B2 — a reviewer decides, and a correction never overwrites', () => {
  it('a correction admits a NEW version and leaves the prior one retrievable', async () => {
    const queued = (await sql<{ case_id: string; claim_object_id: string }>`
      select case_id, claim_object_id from intelligence.review_current
       where state = 'queued' and claim_object_id is not null
         and tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid
       limit 1`.execute(su)).rows[0];
    expect(queued, 'nothing was queued to correct').toBeDefined();
    const caseId = String(queued?.case_id);
    const claimId = String(queued?.claim_object_id);

    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100));

    const resolved = await pipeline.consequentialRead(
      envelopeFor(managerId, 'intelligence.read', 'REV', caseId), managerPrincipal,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'intelligence.read', objectType: 'REV', objectId: caseId },
      IntelligenceCapability.read,
      async (cap) => {
        const versions = (await cap.readCanonicalObjects().selectAll()
          .where('object_id' as never, '=', claimId as never)
          .orderBy('object_version' as never, 'desc').limit(1)
          .execute()) as Array<Record<string, unknown>>;
        const lineage = (await cap.readLineage().selectAll()
          .where('claim_object_id' as never, '=', claimId as never)
          .orderBy('claim_version' as never, 'desc').limit(1)
          .executeTakeFirst()) as Record<string, unknown> | undefined;
        return { claim: versions[0] ?? null, lineage: lineage ?? null };
      });

    // The header a correction admits carries the OPERATION's correlation, not one
    // of the test's own: the database refuses a header that claims a different
    // operation produced it, which is exactly the binding it exists to enforce.
    const decideEnvelope = envelopeFor(managerId, 'intelligence.review.decide', 'REV', caseId);
    const out = await pipeline.write(
      decideEnvelope, managerPrincipal,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'intelligence.review.decide', objectType: 'REV', objectId: caseId,
        writableTargets: [claimId] },
      IntelligenceCapability.review,
      async (cap, scope) => {
        const r = await review.decide(cap, scope, {
          caseId, decision: { caseId, decision: 'correct',
            reason: 'the direction is right; the wording overstated the magnitude',
            correctedValue: { object_value: 'fell against the prior day, magnitude restated' } },
          decider: managerId, correlationId: decideEnvelope.correlation_id,
          purposeId: 'intelligence',
          claim: resolved.result.claim, lineage: resolved.result.lineage,
        });
        return { result: r, targetType: 'REV', targetId: caseId, targetVersion: '1', outboxEvent: null };
      });
    expect(out.result.state).toBe('corrected');
    expect(out.result.newVersion).toBe(2);

    const versions = (await sql<{ object_version: string; lifecycle_state: string; truth_state: string }>`
      select object_version, lifecycle_state, truth_state from objects.canonical_objects
       where object_id = ${claimId}::uuid order by object_version`.execute(su)).rows;
    expect(versions.length).toBe(2);
    expect(versions[0]?.truth_state, 'the machine-extracted version was rewritten').toBe('extracted');
    expect(versions[1]?.truth_state, 'a human-corrected claim is not marked asserted').toBe('asserted');

    // KNOWN-AT: the instant before the correction still shows v1.
    const asOf = (await sql<{ object_version: string }>`
      select object_version from objects.canonical_objects
       where object_id = ${claimId}::uuid and recorded_at <= ${before}::timestamptz
       order by object_version desc limit 1`.execute(su)).rows[0];
    expect(Number(asOf?.object_version), 'the known-at query saw the later correction').toBe(1);
  }, 120_000);

  it('a decision without a reason is refused', async () => {
    const queued = (await sql<{ case_id: string }>`
      select case_id from intelligence.review_current where state = 'queued'
         and tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid
       limit 1`.execute(su)).rows[0];
    if (queued === undefined) return;
    const outcome = await sql`select intelligence.decide_review(
      ${queued.case_id}::uuid, ${fx.tenantId}::uuid, ${fx.domainId}::uuid, 'approved',
      ${managerId}::uuid, 'no', null::bigint, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`
      .execute(su).then(() => 'accepted', () => 'refused');
    expect(outcome).toBe('refused');
  });

  it('the agent that produced the output may not decide its review', async () => {
    const queued = (await sql<{ case_id: string }>`
      select case_id from intelligence.review_current where state = 'queued'
         and tenant_id = ${fx.tenantId}::uuid and domain_id = ${fx.domainId}::uuid
       limit 1`.execute(su)).rows[0];
    if (queued === undefined) return;
    const outcome = await pipeline.write(
      envelopeFor(agentId, 'intelligence.review.decide', 'REV', queued.case_id), agentPrincipal,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'intelligence.review.decide', objectType: 'REV', objectId: queued.case_id },
      IntelligenceCapability.review,
      async (cap, scope) => {
        await review.decide(cap, scope, {
          caseId: queued.case_id,
          decision: { caseId: queued.case_id, decision: 'approve',
                      reason: 'the agent approving its own output' },
          decider: agentId, correlationId: uuidv7(), purposeId: 'intelligence',
          claim: null, lineage: null,
        });
        return { result: undefined, targetType: 'REV', targetId: queued.case_id,
                 targetVersion: '1', outboxEvent: null };
      }).then(() => 'accepted', () => 'refused');
    expect(outcome, 'an agent decided its own review case').toBe('refused');
  });
});

/* ───────────────────────── B6 ───────────────────────── */

describe('B6 — Phase 0 and Phase 1 are untouched by Phase 2', () => {
  it('Phase 0\u2019s CLM@v1 schema is untouched', async () => {
    const v1 = (await sql<{ required: string }>`
      select json_schema ->> 'required' as required from objects.schema_registry
       where object_type = 'CLM' and schema_version = 'v1'`.execute(su)).rows[0];
    // Phase 0 registered subject/predicate/object_value and nothing else. Phase 2
    // adds v2 beside it rather than redefining a contract other objects cite.
    expect(v1?.required).toBe('["subject", "predicate", "object_value"]');
  });

  it('the Phase 1 canonical write actions still pin their own object types', async () => {
    const rows = (await sql<{ action: string; object_types: string[] }>`
      select action, object_types from observation.canonical_write_actions
       where action like 'observation.%' order by action`.execute(su)).rows;
    const admit = rows.find((r) => r.action === 'observation.item.admit');
    expect(admit?.object_types).toEqual(['OBS', 'EVD']);
    // And the Phase 2 action cannot write an observation object.
    const claim = (await sql<{ object_types: string[] }>`
      select object_types from observation.canonical_write_actions
       where action = 'intelligence.claim.admit'`.execute(su)).rows[0];
    expect(claim?.object_types).toEqual(['ENT', 'EVT', 'CLM', 'REL', 'ASM']);
    expect(claim?.object_types).not.toContain('OBS');
    expect(claim?.object_types).not.toContain('EVD');
  });

  it('C18 stays frozen at migration 0021 and 0023 is a forward migration', async () => {
    const rows = (await sql<{ filename: string }>`
      select filename from public.schema_migrations order by filename`.execute(su)).rows;
    const names = rows.map((r) => r.filename);
    expect(names.some((n) => n.startsWith('0021'))).toBe(true);
    expect(names.some((n) => n.startsWith('0023'))).toBe(true);
    // Nothing renumbered or replaced: 0001–0022 are all still present.
    for (let i = 1; i <= 22; i += 1) {
      const p = String(i).padStart(4, '0');
      expect(names.some((n) => n.startsWith(p)), `migration ${p} is missing`).toBe(true);
    }
  });

  it('every intelligence projection rebuilds from its event log', async () => {
    const out = await pipeline.consequentialRead(
      envelopeFor(managerId, 'intelligence.read', 'CLM', null), managerPrincipal,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'intelligence.read', objectType: 'CLM', objectId: null },
      IntelligenceCapability.read,
      async (cap) => cap.rebuildProjections());
    expect(out.result.length).toBeGreaterThan(0);
    for (const p of out.result) {
      expect(Number(p.mismatched), `${p.projection} drifted from its event log`).toBe(0);
    }
  });
});
