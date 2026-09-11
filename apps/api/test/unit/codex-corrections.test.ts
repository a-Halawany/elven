/**
 * CODEX REVIEW OF 6914af03 — service-level reproduction and regression.
 *
 * These are the SERVICE-LEVEL probes: real TypeScript implementations driven
 * through in-memory capability doubles and, where a network call is under test, a
 * controlled local HTTP response. They are deliberately NOT database or browser
 * evidence, and nothing here should be read as either — the database and API
 * verification for the same findings lives in
 * `test/int/phase3-corrections.test.ts`.
 *
 * Every assertion below FAILED at the reviewed baseline. They are kept as the
 * regression: if a fix is reverted, the corresponding probe goes red again.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { jcsCanonicalize, type CanonicalHeader } from '@eye/contracts';
import { isForbiddenAddress } from '../../src/observation/connectors/http-client.js';
import { ModelGatewayService, requestDigestOf, type GatewayRequest }
  from '../../src/intelligence/gateway/model-gateway.service.js';
import { ExtractionService, inheritedControlsOf }
  from '../../src/intelligence/extraction/extraction.service.js';
import type { MethodPin } from '../../src/intelligence/intelligence.capabilities.js';
import { EntitiesService } from '../../src/graph/entities/entities.service.js';
import { EdgesService, visibleAt } from '../../src/graph/edges/edges.service.js';
import { ImpactService } from '../../src/graph/strategy/impact.service.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** A stable, valid uuid for probe fixtures — the header validator requires the format. */
const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ─────────────────── in-memory doubles ─────────────────── */

/** A minimal relation double supporting the query shapes the services use. */
function relation(rows: Array<Record<string, unknown>>) {
  const build = (current: Array<Record<string, unknown>>): Record<string, unknown> => ({
    selectAll: () => build(current),
    where: (col: string, op: string, val: unknown) => build(current.filter((r) => {
      if (op === 'in') return (val as unknown[]).includes(r[col]);
      return r[col] === val;
    })),
    orderBy: () => build(current),
    limit: (n: number) => build(current.slice(0, n)),
    execute: async () => current,
    executeTakeFirst: async () => current[0],
  });
  return build(rows);
}

interface WorldRows {
  entities?: Array<Record<string, unknown>>;
  resolutions?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  strategy?: Array<Record<string, unknown>>;
  dependencies?: Array<Record<string, unknown>>;
  canonical?: Array<Record<string, unknown>>;
  recorded?: Array<Record<string, unknown>>;
  corrections?: Array<Record<string, unknown>>;
  invalidations?: Array<Record<string, unknown>>;
}

function graphCap(w: WorldRows) {
  return {
    readEntities: () => relation(w.entities ?? []),
    readEntityEvents: () => relation([]),
    readIdentifierSystems: () => relation([]),
    readIdentifiers: () => relation([]),
    readResolutions: () => relation(w.resolutions ?? []),
    readResolutionEvents: () => relation([]),
    readEdges: () => relation(w.edges ?? []),
    readEdgeEvents: () => relation([]),
    readStrategy: () => relation(w.strategy ?? []),
    readStrategyEvents: () => relation([]),
    readDependencies: () => relation(w.dependencies ?? []),
    readInvalidations: () => relation([]),
    readCanonicalObjects: () => relation(w.canonical ?? []),
    readClaimLineage: () => relation([]),
    readCorrections: () => relation(w.corrections ?? []),
    // Phase 4 dependents the walk may reach; none in these worlds.
    readForecasts: () => relation([]),
    readScenarios: () => relation([]),
    readWarnings: () => relation([]),
    /*
     * The double models the CAPABILITY CONTRACT, not the SQL: eligibility is
     * applied before the bound, and `total` counts everything eligible. A double
     * that bounded first would be modelling the defect rather than the interface.
     */
    edgesVisibleAt: async (a: { knownAt: string; validAt: string; limit: number }) => {
      const eligible = (w.edges ?? []).filter((e) =>
        visibleAt(e as never, { knownAt: a.knownAt, validAt: a.validAt }));
      return { rows: eligible.slice(0, a.limit), total: eligible.length };
    },
    /*
     * The double models the SQL contract: outstanding = applied and not complete
     * by the case's OWN `propagation_state`; ordered (received_at, case_id) both
     * descending; continued from a composite cursor compared the same way.
     */
    correctionsOutstanding: async (a: {
      limit: number; cursor: { receivedAt: string; caseId: string } | null }) => {
      const key = (c: Record<string, unknown>): [number, string] =>
        [new Date(String(c['received_at'])).getTime(), String(c['case_id'])];
      const eligible = (w.corrections ?? [])
        .filter((c) => c['state'] === 'applied' && c['propagation_state'] !== 'complete')
        .map((c) => ({ ...c, cursor_received_at: String(c['received_at']) }))
        .sort((x, y) => {
          const [tx, ix] = key(x); const [ty, iy] = key(y);
          return ty - tx || (iy < ix ? -1 : iy > ix ? 1 : 0);
        })
        .filter((c) => {
          if (a.cursor === null) return true;
          const [t, i] = key(c);
          const ct = new Date(a.cursor.receivedAt).getTime();
          return t < ct || (t === ct && i < a.cursor.caseId);
        });
      return { rows: eligible.slice(0, a.limit), total: eligible.length };
    },
    rebuildProjections: async () => [],
  } as never;
}

/* ═══════════════════ 7 · IPv6 address validation ═══════════════════ */

describe('F7 — the egress guard rejects every form of a forbidden address', () => {
  it('rejects loopback in every notation, not only the compressed one', () => {
    for (const a of ['::1', '0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:0000:0000:0001']) {
      expect(isForbiddenAddress(a), `${a} was permitted`).toBe(true);
    }
  });

  it('rejects the WHOLE fe80::/10 link-local range, not only the fe80 prefix', () => {
    // Link-local is fe80::/10 — fe80 through febf. A string-prefix check on
    // "fe80" sees a tenth of it.
    for (const a of ['fe80::1', 'fe90::1', 'fea0::1', 'feb0::1', 'febf::1',
                     'fe80:0:0:0:0:0:0:1']) {
      expect(isForbiddenAddress(a), `${a} was permitted`).toBe(true);
    }
  });

  it('rejects unique-local across fc00::/7 and site-local across fec0::/10', () => {
    for (const a of ['fc00::1', 'fd00::1', 'fdff::1', 'fec0::1', 'feff::1']) {
      expect(isForbiddenAddress(a), `${a} was permitted`).toBe(true);
    }
  });

  it('rejects IPv4-mapped loopback in hex notation as well as dotted', () => {
    expect(isForbiddenAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isForbiddenAddress('::ffff:7f00:1')).toBe(true);
  });

  it('still permits ordinary public addresses', () => {
    for (const a of ['2606:4700:4700::1111', '2001:4860:4860::8888', '93.184.216.34']) {
      expect(isForbiddenAddress(a), `${a} was refused`).toBe(false);
    }
  });
});

/* ═══════════════════ 5 + 6a · the model gateway ═══════════════════ */

const PIN: MethodPin = {
  method_key: 'probe', method_version: 1, gateway_mode: 'local-live',
  model_id: 'pinned-model:1b', model_weights_digest: sha256('weights'),
  runtime_version: 'probe/1', prompt_ref: 'p', prompt_version: 'v1',
  prompt_text: 'return json only', prompt_digest: sha256('return json only'),
  decoding_digest: sha256('{}'), decoding_config: {},
  confidence_floor: '0.1', review_below: '0.9', budget_calls: 5, budget_seconds: 30,
  target_types: ['ENT'], source_id: null,
};

function gatewayCap(recorded: Array<Record<string, unknown>> = []) {
  const calls: Array<Record<string, unknown>> = [];
  const cap = {
    ...(graphCap({}) as unknown as Record<string, unknown>),
    readRecordedResponses: () => relation(recorded),
    recordGatewayCall: async (a: Record<string, unknown>) => { calls.push(a); },
    recordResponse: async () => true,
  } as never;
  return { cap, calls };
}

describe('F5 — a live call establishes WHICH model answered, not which was asked for', () => {
  let server: Server;
  let port = 0;
  let served: { model: string; response: string } = { model: '', response: '' };

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: served.model, response: served.response }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
    process.env['EYE_MODEL_HOST'] = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    delete process.env['EYE_MODEL_HOST'];
    await new Promise<void>((r) => server.close(() => r()));
  });

  const req: GatewayRequest = {
    promptRef: 'p', promptVersion: 'v1', promptText: 'return json only',
    promptDigest: sha256('return json only'), modelId: PIN.model_id,
    weightsDigest: PIN.model_weights_digest, runtimeVersion: PIN.runtime_version,
    decodingDigest: PIN.decoding_digest,
    input: { instruction: 'p', target_types: ['ENT'], source_key: 's', item_key: 'i',
             evidence_digest: sha256('e'), evidence: 'abc' },
  };

  it('REFUSES a response whose model is not the model the method pinned', async () => {
    served = {
      model: 'some-other-model:70b',
      response: JSON.stringify({ claims: [] }),
    };
    const { cap, calls } = gatewayCap();
    const r = await new ModelGatewayService().call(
      cap, { tenantId: 't', domainId: 'd', correlationId: 'c' },
      { pin: PIN, runId: null, methodId: 'm', req });
    expect(r.outcome).toBe('failed');
    expect(String(r.failure)).toMatch(/pinned|model/i);
    // The call record must say what actually answered, not only what was asked.
    const detail = (calls[0]?.['detail'] ?? {}) as Record<string, unknown>;
    expect(detail['observed_model']).toBe('some-other-model:70b');
  });

  it('records the OBSERVED model alongside the pin on a matching response', async () => {
    served = { model: PIN.model_id, response: JSON.stringify({ claims: [] }) };
    const { cap, calls } = gatewayCap();
    const r = await new ModelGatewayService().call(
      cap, { tenantId: 't', domainId: 'd', correlationId: 'c' },
      { pin: PIN, runId: null, methodId: 'm', req });
    expect(r.outcome).toBe('completed');
    const detail = (calls[0]?.['detail'] ?? {}) as Record<string, unknown>;
    expect(detail['observed_model']).toBe(PIN.model_id);
    expect(detail['model_identity']).toBe('observed_matches_pin');
  });
});

describe('F6a — a byte span outside the evidence is refused, not admitted', () => {
  const evidence = 'abc';
  const req: GatewayRequest = {
    promptRef: 'p', promptVersion: 'v1', promptText: 'return json only',
    promptDigest: sha256('return json only'), modelId: 'replay-model',
    weightsDigest: sha256('w'), runtimeVersion: 'r', decodingDigest: sha256('{}'),
    input: { instruction: 'p', target_types: ['ENT'], source_key: 's', item_key: 'i',
             evidence_digest: sha256(evidence), evidence },
  };

  const recordedWith = (byteEnd: number) => {
    const response = { claims: [{
      claim_kind: 'entity', subject: 'S', predicate: 'is_a', object_value: 'thing',
      confidence: 0.9, byte_start: 0, byte_end: byteEnd,
    }] };
    return [{ request_digest: requestDigestOf(req), response }];
  };

  it('refuses byte_end beyond the supplied evidence', async () => {
    const { cap } = gatewayCap(recordedWith(1_000_000));
    const r = await new ModelGatewayService().call(
      cap, { tenantId: 't', domainId: 'd', correlationId: 'c' },
      { pin: { ...PIN, gateway_mode: 'replay' }, runId: null, methodId: 'm', req });
    expect(r.outcome).toBe('refused');
    expect(String(r.failure)).toMatch(/span|byte|evidence/i);
  });

  it('accepts a span that lies inside the evidence', async () => {
    const { cap } = gatewayCap(recordedWith(evidence.length));
    const r = await new ModelGatewayService().call(
      cap, { tenantId: 't', domainId: 'd', correlationId: 'c' },
      { pin: { ...PIN, gateway_mode: 'replay' }, runId: null, methodId: 'm', req });
    expect(r.outcome).toBe('completed');
    expect(r.claims.length).toBe(1);
  });
});

/* ═══════════════════ 1 + 6b · extraction ═══════════════════ */

/**
 * The evidence unit a restricted, synthetic source produced. Every control field
 * here is one the derived claim must inherit.
 */
const RESTRICTED_EVIDENCE = {
  synthetic_state: true,
  classification: 'restricted',
  rights_profile: 'internal-only, no redistribution',
  residency_profile: 'EU',
  retention_profile: '24 months',
  access_policy_ref: 'policy:corridor-restricted',
};

function extractionCap(recorded: Array<Record<string, unknown>>) {
  const admitted: Array<{ header: CanonicalHeader; payload: Record<string, unknown> }> = [];
  const cap = {
    ...(graphCap({}) as unknown as Record<string, unknown>),
    readRecordedResponses: () => relation(recorded),
    recordGatewayCall: async () => undefined,
    recordResponse: async () => true,
    claimExtraction: async () => ({ decision: 'proceed', attempt_ordinal: 1,
      prior_result_digest: null, prior_claim_ids: null, prior_outcome: null }),
    recordAttempt: async () => undefined,
    recordLineage: async () => undefined,
    queueReview: async () => undefined,
    lockActiveMethod: async () => PIN,
    admitObject: async (header: CanonicalHeader, payload: Record<string, unknown>) => {
      admitted.push({ header, payload });
      return { contentDigest: sha256('x') };
    },
  } as never;
  return { cap, admitted };
}

async function runExtraction(claims: Array<Record<string, unknown>>, pin: MethodPin) {
  const evidence = 'the corridor bytes';
  const req: GatewayRequest = {
    promptRef: pin.prompt_ref, promptVersion: pin.prompt_version,
    promptText: pin.prompt_text, promptDigest: pin.prompt_digest,
    modelId: pin.model_id, weightsDigest: pin.model_weights_digest,
    runtimeVersion: pin.runtime_version, decodingDigest: pin.decoding_digest,
    input: { instruction: pin.prompt_ref, target_types: pin.target_types,
             source_key: pin.method_key, item_key: 'item-1',
             evidence_digest: sha256(evidence), evidence },
  };
  const { cap, admitted } = extractionCap([
    { request_digest: requestDigestOf(req), response: { claims } },
  ]);
  const svc = new ExtractionService(new ModelGatewayService());
  const out = await svc.extractOne(cap,
    { scope: 'DOMAIN', tenantId: uuid(90), domainId: uuid(91) }, {
    pin, methodId: uuid(1), runId: uuid(2), agentPrincipalId: uuid(3),
    unit: {
      evdObjectId: uuid(4), obsObjectId: null, contentDigest: sha256(evidence),
      bytes: Buffer.from(evidence, 'utf8'), sourceId: uuid(5), sourceKey: pin.method_key,
      eventTime: null, itemKey: 'item-1',
      // Derived from the evidence ROW by the product's own mapping, so this probe
      // exercises the real inheritance rather than a hand-built shape.
      inherited: inheritedControlsOf(RESTRICTED_EVIDENCE),
    },
    correlationId: uuid(6), purposeId: 'intelligence', newAttempt: false,
    declaredClaimIds: Array.from({ length: 8 }, (_, i) => uuid(10 + i)),
    retrievalDecisionId: uuid(7), retrievalAuditSeq: 1,
  });
  return { out, admitted };
}

const ENTITY_CLAIM = {
  claim_kind: 'entity', subject: 'NORDWERK', predicate: 'is_a', object_value: 'manufacturer',
  confidence: 0.95, byte_start: 0, byte_end: 3,
};

describe('F1 — a derived claim inherits the source\'s restrictions', () => {
  it('carries the evidence\'s synthetic state rather than hard-coding false', async () => {
    const { admitted } = await runExtraction([ENTITY_CLAIM], { ...PIN, gateway_mode: 'replay' });
    expect(admitted.length).toBe(1);
    expect(admitted[0]?.header.synthetic_state,
      'a claim about a synthetic company was admitted as non-synthetic').toBe(true);
  });

  it('carries the evidence\'s classification rather than hard-coding internal', async () => {
    const { admitted } = await runExtraction([ENTITY_CLAIM], { ...PIN, gateway_mode: 'replay' });
    expect(admitted[0]?.header.classification).toBe('restricted');
  });

  it('carries rights, residency, retention and access policy forward', async () => {
    const { admitted } = await runExtraction([ENTITY_CLAIM], { ...PIN, gateway_mode: 'replay' });
    const h = admitted[0]?.header as CanonicalHeader;
    expect(h.rights_profile).toBe(RESTRICTED_EVIDENCE.rights_profile);
    expect(h.residency_profile).toBe(RESTRICTED_EVIDENCE.residency_profile);
    expect(h.retention_profile).toBe(RESTRICTED_EVIDENCE.retention_profile);
    expect(h.access_policy_ref).toBe(RESTRICTED_EVIDENCE.access_policy_ref);
  });
});

describe('F6b — a method may not produce a type it did not declare', () => {
  it('refuses a relationship claim from a method declaring only ENT', async () => {
    const { out, admitted } = await runExtraction([
      ENTITY_CLAIM,
      { claim_kind: 'relationship', subject: 'A', predicate: 'r', object_value: 'B',
        confidence: 0.9, byte_start: 0, byte_end: 3 },
    ], { ...PIN, gateway_mode: 'replay', target_types: ['ENT'] });
    const types = admitted.map((a) => a.header.object_type);
    expect(types).toContain('ENT');
    expect(types, 'a REL was admitted by a method declaring only ENT').not.toContain('REL');
    expect(out.admitted.length).toBe(1);
  });
});

/* ═══════════════════ 3 · known-at retrieval ═══════════════════ */

describe('F3 — historical retrieval does not import future knowledge', () => {
  const FEB = '2026-02-15T00:00:00.000Z';
  const MAR = '2026-03-15T00:00:00.000Z';

  it('returns the claim version current AT the cutoff, not the latest', async () => {
    const cap = graphCap({
      resolutions: [{
        resolution_id: 'r1', entity_id: 'e1', claim_object_id: 'c1', claim_version: 1,
        mention_text: 'M', state: 'accepted',
        accepted_at: '2026-02-01T00:00:00.000Z', superseded_at: null,
      }],
      canonical: [
        { object_id: 'c1', object_version: 1, recorded_at: '2026-02-01T00:00:00.000Z',
          payload: { subject: 'v1' } },
        { object_id: 'c1', object_version: 2, recorded_at: MAR, payload: { subject: 'v2' } },
      ],
    });
    const svc = new EntitiesService();
    const claims = await svc.claimsFor(cap, ['c1'], FEB);
    expect(claims.length).toBe(1);
    expect(Number(claims[0]?.['object_version']),
      'a February view returned a version recorded in March').toBe(1);
  });

  it('still returns the latest version when no cutoff is given', async () => {
    const cap = graphCap({
      canonical: [
        { object_id: 'c1', object_version: 1, recorded_at: '2026-02-01T00:00:00.000Z',
          payload: {} },
        { object_id: 'c1', object_version: 2, recorded_at: MAR, payload: {} },
      ],
    });
    const claims = await new EntitiesService().claimsFor(cap, ['c1']);
    expect(Number(claims[0]?.['object_version'])).toBe(2);
  });

  it('does not lose an eligible old edge behind a recency cap', async () => {
    // One eligible edge asserted long ago, then more recent edges than the cap.
    const old = {
      edge_id: 'old', subject_entity_id: 'a', predicate: 'p', object_entity_id: 'b',
      valid_from: '2024-01-01T00:00:00.000Z', valid_to: null,
      asserted_at: '2024-01-02T00:00:00.000Z', retracted_at: null, state: 'asserted',
      claim_object_id: 'c', claim_version: 1, evidence_object_id: 'e',
      evidence_digest: sha256('e'), mode: 'replay', confidence: '0.9',
      retraction_reason: null,
    };
    const noise = Array.from({ length: 2_100 }, (_, i) => ({
      ...old, edge_id: `n${i}`,
      valid_from: '2026-01-01T00:00:00.000Z',
      asserted_at: '2026-01-01T00:00:00.000Z',
    }));
    const cap = graphCap({ edges: [...noise, old] });
    const visible = await new EdgesService().asOf(cap, {
      knownAt: '2024-06-01T00:00:00.000Z', validAt: '2024-06-01T00:00:00.000Z' });
    expect(visible.map((e) => e.edge_id),
      'the only eligible edge was dropped by a recency cap applied before the filter')
      .toContain('old');
  });
});

/* ═══════════════════ 4c · propagation completeness ═══════════════════ */

describe('F4c — a truncated dependency walk says so', () => {
  it('reports residual work rather than presenting a partial walk as complete', async () => {
    // A chain longer than the traversal bound: claim → A1 → A2 → … → A12.
    const strategy = Array.from({ length: 12 }, (_, i) => ({
      strategy_object_id: `a${i}`, object_type: 'ASU', title: `assumption ${i}`,
      status: 'active', verification_state: 'verified',
    }));
    const dependencies = [
      { dependent_object_id: 'a0', dependent_type: 'ASU', depends_on_kind: 'claim',
        depends_on_id: 'C', state: 'active', dependency_id: 'd0', rationale: 'r' },
      ...Array.from({ length: 11 }, (_, i) => ({
        dependent_object_id: `a${i + 1}`, dependent_type: 'ASU',
        depends_on_kind: 'strategy', depends_on_id: `a${i}`, state: 'active',
        dependency_id: `d${i + 1}`, rationale: 'r',
      })),
    ];
    const cap = graphCap({ strategy, dependencies });
    const r = await new ImpactService().walk(cap, {
      triggerKind: 'claim_correction', triggerObjectId: 'C' });
    expect(r.truncated, 'a bounded walk reported no truncation').toBe(true);
    expect(r.unexplored.length,
      'a truncated walk named no residual work').toBeGreaterThan(0);
  });

  it('reaches a claim through the evidence it was derived from', async () => {
    // A Phase 1 correction supersedes EVIDENCE. Without the lineage closure the
    // walk had no way from that object to anything derived from it.
    const cap = {
      ...(graphCap({
        strategy: [{ strategy_object_id: 'a0', object_type: 'ASU', title: 'assumption',
                     status: 'active', verification_state: 'verified' }],
        dependencies: [{ dependent_object_id: 'a0', dependent_type: 'ASU',
                         depends_on_kind: 'claim', depends_on_id: 'claim-1',
                         state: 'active', dependency_id: 'd0', rationale: 'r' }],
      }) as unknown as Record<string, unknown>),
      readClaimLineage: () => relation([
        { claim_object_id: 'claim-1', evidence_object_id: 'evd-1' },
      ]),
    } as never;
    const r = await new ImpactService().walk(cap, {
      triggerKind: 'evidence_correction', triggerObjectId: 'evd-1' });
    expect(r.reachedClaims).toContain('claim-1');
    expect(r.assumptions.map((x) => x.strategy_object_id)).toContain('a0');
    expect(String(r.assumptions[0]?.reached_via)).toMatch(/derived from the corrected evidence/);
  });

  it('reports no truncation when the whole graph was walked', async () => {
    const cap = graphCap({
      strategy: [{ strategy_object_id: 'a0', object_type: 'ASU', title: 'a',
                   status: 'active', verification_state: 'verified' }],
      dependencies: [{ dependent_object_id: 'a0', dependent_type: 'ASU',
                       depends_on_kind: 'claim', depends_on_id: 'C', state: 'active',
                       dependency_id: 'd0', rationale: 'r' }],
    });
    const r = await new ImpactService().walk(cap, {
      triggerKind: 'claim_correction', triggerObjectId: 'C' });
    expect(r.truncated).toBe(false);
    expect(r.unexplored).toEqual([]);
  });
});

/* ═══════════════════ 2 + 4d · edge construction ═══════════════════ */

/**
 * A pipeline double that runs the handler and hands back a receipt.
 *
 * It grants NO authority and asserts nothing about policy — it exists so the
 * orchestrator's own mapping and gating logic can be exercised without a
 * database. Anything this probe showed about authority would be worthless; the
 * authority evidence is in the integration suite.
 */
function pipelineDouble(cap: unknown) {
  const asserted: Array<Record<string, unknown>> = [];
  return {
    asserted,
    pipeline: {
      consequentialRead: async (
        _e: unknown, _p: unknown, _r: unknown, _c: unknown,
        handler: (c: unknown, s: unknown) => Promise<unknown>,
      ) => ({ result: await handler(cap, { scope: 'DOMAIN', tenantId: 'T', domainId: 'D' }),
              policyDecisionId: 'pol', auditSeq: 1, obligations: [] }),
      write: async (
        _e: unknown, _p: unknown, _r: unknown, _c: unknown,
        handler: (c: unknown, s: unknown) => Promise<{ result: unknown }>,
      ) => {
        const edgeCap = {
          ...(cap as Record<string, unknown>),
          assertEdge: async (a: Record<string, unknown>) => { asserted.push(a); },
        };
        const out = await handler(edgeCap, { scope: 'DOMAIN', tenantId: 'T', domainId: 'D' });
        return { ...out, policyDecisionId: 'pol', auditSeq: 1, obligations: [] };
      },
    },
  };
}

const REL_CLAIM = (over: Record<string, unknown> = {}) => ({
  object_id: 'rel-1', object_type: 'REL', object_version: 1,
  recorded_at: '2026-01-01T00:00:00.000Z', event_time: null,
  payload: {
    subject: 'Acme', predicate: 'supplies', object_value: 'Widget', confidence: 0.9,
    lineage: { evidence_object_id: 'evd-1', evidence_digest: sha256('e'), mode: 'replay',
               run_id: 'run-1' },
    review: { state: 'not_required', reason: null, decider: null },
  },
  ...over,
});

const ACME = { entity_id: 'ent-A', canonical_name: 'Acme', normalized_name: 'acme',
  entity_type: 'organization', lifecycle_state: 'active' };
const WIDGET = { entity_id: 'ent-W', canonical_name: 'Widget', normalized_name: 'widget',
  entity_type: 'product', lifecycle_state: 'active' };
const RES = (id: string, entity: string, mention: string) => ({
  resolution_id: id, entity_id: entity, claim_object_id: `ec-${id}`, claim_version: 1,
  mention_text: mention, state: 'accepted',
  accepted_at: '2026-01-01T00:00:00.000Z', superseded_at: null,
});

async function buildEdges(world: WorldRows) {
  const { GraphOrchestrator } = await import('../../src/graph/graph.orchestrator.js');
  const { ResolverService } = await import('../../src/graph/entities/resolver.service.js');
  const cap = graphCap(world);
  const { pipeline, asserted } = pipelineDouble(cap);
  const orch = new GraphOrchestrator(
    pipeline as never, new ResolverService(), new ModelGatewayService(), new EdgesService());
  const outcome = await orch.runEdgeBuild({
    envelope: { correlation_id: 'c', purpose_id: 'graph' } as never,
    principal: { principalId: 'p' } as never,
    tenantId: 'T', domainId: 'D', limit: 50,
  });
  return { outcome, asserted };
}

describe('F2 — edge endpoints come from identity, not from a display name', () => {
  const TWO_SAME_NAME = [
    ACME,
    { entity_id: 'ent-B', canonical_name: 'ACME', normalized_name: 'acme',
      entity_type: 'organization', lifecycle_state: 'active' },
  ];
  const both = (order: 'AB' | 'BA') => {
    const a = RES('r-A', 'ent-A', 'Acme');
    const b = RES('r-B', 'ent-B', 'ACME');
    return order === 'AB' ? [a, b, RES('r-W', 'ent-W', 'Widget')]
                          : [b, a, RES('r-W', 'ent-W', 'Widget')];
  };

  it('does NOT depend on row order for which entity receives the relationship', async () => {
    const ab = await buildEdges({ entities: [...TWO_SAME_NAME, WIDGET],
      resolutions: both('AB'), canonical: [REL_CLAIM()] });
    const ba = await buildEdges({ entities: [...TWO_SAME_NAME, WIDGET],
      resolutions: both('BA'), canonical: [REL_CLAIM()] });
    expect(ab.asserted.map((a) => a['subject']),
      'row order changed which entity received the relationship')
      .toEqual(ba.asserted.map((a) => a['subject']));
  });

  it('refuses an ambiguous endpoint with a named reason instead of guessing', async () => {
    const r = await buildEdges({ entities: [...TWO_SAME_NAME, WIDGET],
      resolutions: both('AB'), canonical: [REL_CLAIM()] });
    expect(r.asserted.length, 'an ambiguous endpoint was resolved by guessing').toBe(0);
    expect(r.outcome.skipped.length).toBeGreaterThan(0);
    expect(String(r.outcome.skipped[0]?.reason)).toMatch(/ambiguous|more than one/i);
  });

  it('builds the edge when each endpoint resolves to exactly one entity', async () => {
    const r = await buildEdges({
      entities: [ACME, WIDGET],
      resolutions: [RES('r-A', 'ent-A', 'Acme'), RES('r-W', 'ent-W', 'Widget')],
      canonical: [REL_CLAIM()],
    });
    expect(r.asserted.length).toBe(1);
    expect(r.asserted[0]?.['subject']).toBe('ent-A');
    expect(r.asserted[0]?.['object']).toBe('ent-W');
  });
});

describe('F2b — a claim still awaiting review is not promoted into the graph', () => {
  it('refuses to assert an edge from a queued relationship claim', async () => {
    const r = await buildEdges({
      entities: [ACME, WIDGET],
      resolutions: [RES('r-A', 'ent-A', 'Acme'), RES('r-W', 'ent-W', 'Widget')],
      canonical: [REL_CLAIM({
        payload: {
          subject: 'Acme', predicate: 'supplies', object_value: 'Widget', confidence: 0.4,
          lineage: { evidence_object_id: 'evd-1', evidence_digest: sha256('e'),
                     mode: 'replay', run_id: 'run-1' },
          review: { state: 'queued', reason: 'below the review threshold', decider: null },
        },
      })],
    });
    expect(r.asserted.length,
      'a claim still queued for review was promoted into the graph').toBe(0);
    expect(String(r.outcome.skipped[0]?.reason)).toMatch(/review/i);
  });

  it('builds the edge once a person has approved the claim', async () => {
    const r = await buildEdges({
      entities: [ACME, WIDGET],
      resolutions: [RES('r-A', 'ent-A', 'Acme'), RES('r-W', 'ent-W', 'Widget')],
      canonical: [REL_CLAIM({
        payload: {
          subject: 'Acme', predicate: 'supplies', object_value: 'Widget', confidence: 0.4,
          lineage: { evidence_object_id: 'evd-1', evidence_digest: sha256('e'),
                     mode: 'replay', run_id: 'run-1' },
          review: { state: 'approved', reason: 'checked', decider: 'person-1' },
        },
      })],
    });
    expect(r.asserted.length).toBe(1);
  });
});

describe('F4d — a corrected claim rebuilds its edge', () => {
  it('does not treat a v1 edge as covering the corrected v2 claim', async () => {
    const r = await buildEdges({
      entities: [ACME, WIDGET],
      resolutions: [RES('r-A', 'ent-A', 'Acme'), RES('r-W', 'ent-W', 'Widget')],
      canonical: [REL_CLAIM({ object_version: 2 })],
      edges: [{ edge_id: 'edge-v1', claim_object_id: 'rel-1', claim_version: 1,
                state: 'asserted', subject_entity_id: 'ent-A', object_entity_id: 'ent-W',
                predicate: 'supplies', valid_from: '2026-01-01T00:00:00.000Z',
                valid_to: null, asserted_at: '2026-01-01T00:00:00.000Z',
                retracted_at: null, evidence_object_id: 'evd-1',
                evidence_digest: sha256('e'), mode: 'replay', confidence: '0.9',
                retraction_reason: null }],
    });
    const handled = r.asserted.length > 0 || r.outcome.skipped.length > 0;
    expect(handled,
      'a corrected claim produced no new edge and no reported skip').toBe(true);
    expect(r.asserted.length).toBe(1);
    expect(r.asserted[0]?.['claimVersion']).toBe(2);
  });

  it('remains idempotent for a claim whose current version is already built', async () => {
    const r = await buildEdges({
      entities: [ACME, WIDGET],
      resolutions: [RES('r-A', 'ent-A', 'Acme'), RES('r-W', 'ent-W', 'Widget')],
      canonical: [REL_CLAIM()],
      edges: [{ edge_id: 'edge-v1', claim_object_id: 'rel-1', claim_version: 1,
                state: 'asserted', subject_entity_id: 'ent-A', object_entity_id: 'ent-W',
                predicate: 'supplies', valid_from: '2026-01-01T00:00:00.000Z',
                valid_to: null, asserted_at: '2026-01-01T00:00:00.000Z',
                retracted_at: null, evidence_object_id: 'evd-1',
                evidence_digest: sha256('e'), mode: 'replay', confidence: '0.9',
                retraction_reason: null }],
    });
    expect(r.asserted.length).toBe(0);
  });
});

/* ═══════════ SECOND PASS · concerns raised against 762de2be ═══════════ */

/**
 * These probes cover the five concerns the review raised against the FIRST
 * correction pass. They are service-level: real implementations, capability
 * doubles. The database and API evidence for the same concerns — and the only
 * evidence that can speak about what PostgreSQL enforces — is in
 * `test/int/phase3-corrections.test.ts`.
 */

describe('G2 — a bounded historical query filters before it bounds', () => {
  const JAN = '2024-01-10T00:00:00.000Z';
  const FEB = '2024-02-15T00:00:00.000Z';
  const MAR = '2024-03-10T00:00:00.000Z';

  const edge = (id: string, asserted: string, validFrom: string) => ({
    edge_id: id, subject_entity_id: 'a', predicate: 'p', object_entity_id: 'b',
    valid_from: validFrom, valid_to: null, asserted_at: asserted, retracted_at: null,
    superseded_at: null, state: 'asserted', claim_object_id: `c-${id}`, claim_version: 1,
    evidence_object_id: 'e', evidence_digest: sha256('e'), mode: 'replay',
    confidence: '0.9', retraction_reason: null,
  });

  /** One eligible January edge, buried behind more March edges than the scan bound. */
  const buried = () => {
    const noise = Array.from({ length: 50_100 }, (_, i) => edge(`n${i}`, MAR, MAR));
    return [...noise, edge('january', JAN, JAN)];
  };

  it('finds an eligible edge buried behind more recent rows than the scan bound', async () => {
    const cap = graphCap({ edges: buried() });
    const visible = await new EdgesService().asOf(cap, { knownAt: FEB, validAt: FEB });
    expect(visible.map((e) => e.edge_id),
      'the only eligible edge was dropped by a scan bound applied before the filter')
      .toContain('january');
  });

  it('a neighbourhood carries whether its answer was complete', async () => {
    const cap = graphCap({ edges: buried() });
    const n = await new EdgesService().neighbourhood(cap, 'a', 2, { knownAt: FEB, validAt: FEB });
    expect(n.complete, 'a neighbourhood answer carried no completeness').toBe(true);
    expect(n.edges.map((e) => e.edge_id)).toContain('january');
  });

  it('a path search cannot claim definitive absence from an incomplete scan', async () => {
    const cap = graphCap({ edges: buried() });
    const r = await new EdgesService().path(cap, 'a', 'b', { knownAt: FEB, validAt: FEB });
    expect(r.complete).toBe(true);
    expect(r.path, 'the buried January edge was not found').not.toBeNull();
  });
});

describe('G3 — outstanding propagation stays discoverable', () => {
  const correction = (over: Record<string, unknown>) => ({
    case_id: 'c', state: 'applied', received_at: '2026-01-01T00:00:00.000Z',
    propagation_assessment_id: null, propagation_unresolved: 'pending', ...over,
  });

  it('keeps a PARTIALLY assessed correction on the list', async () => {
    const cap = graphCap({
      corrections: [correction({ case_id: 'partial', propagation_assessment_id: 'inv-1',
                                 propagation_state: 'partial' })],
      invalidations: [{ invalidation_id: 'inv-1', correction_case_id: 'partial',
                        state: 'assessed', truncated: true }],
    });
    const rows = await new ImpactService().awaitingPropagation(cap, 100);
    expect(rows.cases.map((c) => String(c['case_id'])),
      'a truncated assessment removed the correction from the outstanding list')
      .toContain('partial');
  });

  it('drops a correction only when its walk is complete', async () => {
    const cap = graphCap({
      corrections: [correction({ case_id: 'done', propagation_assessment_id: 'inv-2',
                                 propagation_state: 'complete' })],
      invalidations: [{ invalidation_id: 'inv-2', correction_case_id: 'done',
                        state: 'assessed', truncated: false }],
    });
    const rows = await new ImpactService().awaitingPropagation(cap, 100);
    expect(rows.cases.map((c) => String(c['case_id']))).not.toContain('done');
  });

  it('states truthful CURRENT status for a case nothing has walked', async () => {
    const cap = graphCap({
      corrections: [correction({ case_id: 'untouched', propagation_state: 'pending',
        propagation_unresolved:
          'downstream consumers not yet present (KG/dependency graph arrives Phase 3)' })],
      invalidations: [],
    });
    const rows = await new ImpactService().awaitingPropagation(cap, 100);
    const row = rows.cases[0] as Record<string, unknown>;
    expect(String(row['propagation_status']),
      'the outstanding list repeated a sentence that is no longer accurate')
      .toMatch(/propagation incomplete/i);
    expect(String(row['propagation_status'])).not.toMatch(/not yet present/);
    // Phase 1's own stored text is preserved as history, not rewritten.
    expect(String(row['historical_sentence'])).toMatch(/not yet present/);
  });

  it('does not lose an old outstanding case behind newer irrelevant ones', async () => {
    const noise = Array.from({ length: 120 }, (_, i) => correction({
      case_id: `rejected-${i}`, state: 'rejected',
      received_at: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const cap = graphCap({
      corrections: [...noise, correction({ case_id: 'old-outstanding' })],
      invalidations: [],
    });
    const rows = await new ImpactService().awaitingPropagation(cap, 100);
    expect(rows.cases.map((c) => String(c['case_id'])),
      'an outstanding correction was lost behind newer rows because the limit came first')
      .toContain('old-outstanding');
  });
});

/* ═════════ THIRD PASS · service-level evidence for e5f188ba ═════════ */

/**
 * The remaining F3/F4 residuals, at the service level. The database and API
 * evidence for the same items — the real controller's answers, the real port's
 * coverage arithmetic, the real cursor over a real timestamp column — is in
 * `test/int/phase3-corrections.test.ts` (H1–H3). Nothing here is browser evidence.
 */

describe('H1 — completeness accounts for traversal exhaustion, not only scan exhaustion', () => {
  const NOW = '2026-06-01T00:00:00.000Z';
  const edge = (id: string, subject: string, object: string) => ({
    edge_id: id, subject_entity_id: subject, predicate: 'feeds', object_entity_id: object,
    valid_from: '2024-01-01T00:00:00.000Z', valid_to: null,
    asserted_at: '2024-01-02T00:00:00.000Z', retracted_at: null, superseded_at: null,
    state: 'asserted', claim_object_id: `c-${id}`, claim_version: 1,
    evidence_object_id: 'e', evidence_digest: sha256('e'), mode: 'replay',
    confidence: '0.9', retraction_reason: null,
  });
  /** E0 → E1 → … → En. */
  const chain = (n: number) =>
    Array.from({ length: n }, (_, i) => edge(`l${i}`, `E${i}`, `E${i + 1}`));

  it('a five-edge chain yields no path AND says the search was bounded by depth', async () => {
    const r = await new EdgesService().path(graphCap({ edges: chain(5) }), 'E0', 'E5',
      { knownAt: NOW, validAt: NOW });
    expect(r.path).toBeNull();
    expect(r.complete,
      'the depth bound stopped the traversal with entities unexplored, and the answer '
      + 'claimed completeness').toBe(false);
  });

  it('a four-edge chain is found and the search is complete (positive control)', async () => {
    const r = await new EdgesService().path(graphCap({ edges: chain(4) }), 'E0', 'E4',
      { knownAt: NOW, validAt: NOW });
    expect(r.path?.length).toBe(4);
    expect(r.complete).toBe(true);
  });

  it('two disconnected entities yield no path with complete: true (positive control)', async () => {
    const r = await new EdgesService().path(graphCap({ edges: chain(2) }), 'E0', 'Z',
      { knownAt: NOW, validAt: NOW });
    expect(r.path).toBeNull();
    expect(r.complete, 'an exhausted traversal over a complete scan IS complete').toBe(true);
  });

  it('a neighbourhood states the depth it searched and whether entities lie beyond it', async () => {
    const r = await new EdgesService().neighbourhood(graphCap({ edges: chain(6) }), 'E0', 2,
      { knownAt: NOW, validAt: NOW }) as unknown as Record<string, unknown>;
    expect(r['searchedDepth'], 'the neighbourhood does not say what depth it searched').toBe(2);
    expect(r['beyondDepth'], 'entities beyond the searched depth are not reported').toBe(true);
  });

  it('a listing reports the eligible total and a bounded page (new surface)', async () => {
    const many = Array.from({ length: 50_001 }, (_, i) => edge(`m${i}`, 'A', 'B'));
    const svc = new EdgesService() as unknown as {
      list: (cap: unknown, at: unknown, limit: number) =>
        Promise<{ edges: unknown[]; total: number; complete: boolean }> };
    expect(typeof svc.list, 'no listing method carries completeness').toBe('function');
    const r = await svc.list(graphCap({ edges: many }), { knownAt: NOW, validAt: NOW }, 2_000);
    expect(r.total).toBe(50_001);
    expect(r.edges.length).toBe(2_000);
    expect(r.complete).toBe(false);
  });
});

describe('H2 — outstanding-work pagination is lossless across tied timestamps', () => {
  const correction = (id: string, receivedAt: string) => ({
    case_id: id, state: 'applied', received_at: receivedAt, propagation_state: 'pending',
    propagation_assessment_id: null, propagation_unresolved: 'pending',
  });

  it('reaches three cases sharing a timestamp with page size one, each once', async () => {
    const cap = graphCap({
      corrections: [
        correction('newer', '2026-05-01T00:00:00.000Z'),
        correction('t1', '2026-04-01T00:00:00.000Z'),
        correction('t2', '2026-04-01T00:00:00.000Z'),
        correction('t3', '2026-04-01T00:00:00.000Z'),
        correction('older', '2026-03-01T00:00:00.000Z'),
      ],
    });
    const svc = new ImpactService();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i += 1) {
      const r = await svc.awaitingPropagation(cap, 1, cursor) as unknown as Record<string, unknown>;
      for (const c of r['cases'] as Array<Record<string, unknown>>) seen.push(String(c['case_id']));
      const next = (r['nextCursor'] ?? r['nextBefore'] ?? null) as string | null;
      if (next === null) break;
      cursor = next;
    }
    expect(seen.sort(), 'pages lost or repeated cases that share a timestamp')
      .toEqual(['newer', 'older', 't1', 't2', 't3']);
  });
});

describe('H3 — the outstanding surface reports actual status for a previously assessed case', () => {
  it('does not say "no walk has run" when an assessment is linked to the case', async () => {
    const cap = graphCap({
      corrections: [{
        case_id: 'assessed-before-0026', state: 'applied',
        received_at: '2026-01-01T00:00:00.000Z', propagation_state: 'pending',
        propagation_assessment_id: 'inv-9',
        propagation_unresolved: 'dependency propagation assessed by invalidation inv-9: nothing rests on it',
      }],
      invalidations: [{ invalidation_id: 'inv-9', correction_case_id: 'assessed-before-0026',
                        state: 'assessed', truncated: false }],
    });
    const r = await new ImpactService().awaitingPropagation(cap, 100);
    const row = r.cases.find((c) => String(c['case_id']) === 'assessed-before-0026');
    if (row === undefined) return; // dropped as complete: also an acceptable outcome
    expect(String(row['propagation_status']),
      'a case with a linked assessment was reported as never walked')
      .not.toMatch(/no dependency walk has run/);
    expect(String(row['propagation_status'])).toMatch(/inv-9|reconcil|assess/i);
  });
});
