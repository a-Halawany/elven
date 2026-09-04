/**
 * THE GRAPH ORCHESTRATOR — governed reads, bounded writes, honest outcomes.
 *
 * The shape mirrors Phase 1's collection orchestrator and Phase 2's extraction
 * orchestrator, and for the same reasons: everything the operation will act on is
 * resolved in a PRIOR governed read, each write is its own governed operation with
 * its own policy decision, and the run's own record is what says what happened —
 * never a variable the handler set on the way past.
 *
 * TWO RUNS LIVE HERE.
 *
 *   * RESOLUTION resolves ENT mentions to entities. It writes proposals; the
 *     database decides which of them are allowed to be acceptances.
 *   * EDGE BUILDING turns REL claims into edges, and refuses any REL claim whose
 *     ends are not both resolved. A half-resolved edge is not a smaller edge.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { newId } from '../shared/ids.js';
import { IntelligenceCapability, type ExtractionWrites, type IntelligenceReads,
  type MethodPin } from '../intelligence/intelligence.capabilities.js';
import { ModelGatewayService, type RankRequest, type RankResult }
  from '../intelligence/gateway/model-gateway.service.js';
import { GraphCapability, type GraphReads, type ResolverWrites, type EdgeWrites }
  from './graph.capabilities.js';
import { ResolverService, RESOLVER_RULE_VERSION, mentionOf, normalizeName,
  type EntityCandidate, type Mention, type ResolverOutcome } from './entities/resolver.service.js';
import { EdgesService } from './edges/edges.service.js';

/** One run reads a bounded slice. An unbounded resolver run is a batch job. */
const MAX_MENTIONS = 500;
const MAX_REL_CLAIMS = 500;

export interface ResolutionRunOutcome {
  runId: string;
  /** 'replay' | 'local-live' when the gateway was used; null when it was not. */
  mode: 'replay' | 'local-live' | null;
  mentionsRead: number;
  autoResolved: number;
  proposed: number;
  modelAssisted: number;
  entitiesCreated: number;
  unresolved: Array<{ claimObjectId: string; mention: string; reason: string }>;
  gatewayCalls: number;
  resolutions: Array<{
    resolutionId: string; claimObjectId: string; mention: string; entityId: string;
    method: string; score: number; state: string;
    policyDecisionId: string; auditSeq: number;
  }>;
}

export interface EdgeRunOutcome {
  runId: string;
  relClaimsRead: number;
  edgesAsserted: number;
  skipped: Array<{ claimObjectId: string; reason: string }>;
  edges: Array<{ edgeId: string; subject: string; predicate: string; object: string;
                 policyDecisionId: string; auditSeq: number }>;
}

@Injectable()
export class GraphOrchestrator {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly resolver: ResolverService,
    private readonly gateway: ModelGatewayService,
    private readonly edges: EdgesService,
  ) {}

  private envelope(
    a: { tenantId: string; domainId: string; correlationId: string; purposeId: string;
         principal: AuthenticatedPrincipal },
    action: string, objectType: string, objectId: string | null,
  ): Envelope {
    return {
      message_id: newId(),
      scope: 'DOMAIN',
      tenant_id: a.tenantId,
      domain_id: a.domainId,
      principal_id: `principal:${a.principal.principalId}`,
      purpose_id: a.purposeId,
      action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible',
      consequence_class: 'C2',
      object_type: objectType,
      object_id: objectId,
      schema_version: 'v1',
      issued_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: a.correlationId,
      trace_id: 'graph',
    } as unknown as Envelope;
  }

  /** A governed read under the graph read action. */
  private async read<T>(
    a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string;
         correlationId: string; purposeId: string },
    objectType: string, objectId: string | null,
    fn: (cap: GraphReads) => Promise<T>,
  ): Promise<T> {
    const out = await this.pipeline.consequentialRead<T, GraphReads>(
      this.envelope(a, 'graph.read', objectType, objectId),
      a.principal,
      { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'graph.read', objectType, objectId },
      GraphCapability.read,
      async (cap) => fn(cap));
    return out.result;
  }

  // ───────────────────────── resolution ─────────────────────────

  /**
   * Resolve unresolved ENT mentions.
   *
   * `methodId` names an ACTIVE Phase 2 extraction method whose pin the ranking
   * call runs under. Omitting it means the gateway is never reached and the
   * ambiguous tail goes to the queue on deterministic evidence alone — which is
   * the deterministic-only posture, available without a code change.
   */
  async runResolution(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; limit: number; methodId: string | null;
  }): Promise<ResolutionRunOutcome> {
    const correlationId = a.envelope.correlation_id;
    const purposeId = a.envelope.purpose_id ?? 'graph';
    const read = { principal: a.principal, tenantId: a.tenantId, domainId: a.domainId,
                   correlationId, purposeId };
    const runId = newId();

    const world = await this.read(read, 'ENT', null, async (cap) => {
      const entities = (await cap.readEntities().selectAll().limit(5_000).execute()) as EntityCandidate[];
      const systems = (await cap.readIdentifierSystems().selectAll().execute()) as Array<Record<string, unknown>>;
      const identifiers = (await cap.readIdentifiers().selectAll().limit(20_000).execute()) as Array<Record<string, unknown>>;
      const resolved = (await cap.readResolutions().selectAll()
        .where('state' as never, '=', 'accepted' as never).execute()) as Array<Record<string, unknown>>;
      const pending = (await cap.readResolutions().selectAll()
        .where('state' as never, '=', 'proposed' as never).execute()) as Array<Record<string, unknown>>;
      const rows = (await cap.readCanonicalObjects().selectAll()
        .where('object_type' as never, '=', 'ENT' as never)
        .orderBy('recorded_at' as never, 'desc')
        .limit(2_000).execute()) as Array<Record<string, unknown>>;
      return { entities, systems, identifiers, resolved, pending, rows };
    });

    // Current version of each ENT claim, minus anything already resolved or
    // already sitting in the queue: a run must not queue the same mention twice.
    const current = new Map<string, Record<string, unknown>>();
    for (const r of world.rows) {
      const id = String(r['object_id']);
      const prev = current.get(id);
      if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
        current.set(id, r);
      }
    }
    const settled = new Set<string>([
      ...world.resolved.map((r) => String(r['claim_object_id'])),
      ...world.pending.map((r) => String(r['claim_object_id'])),
    ]);
    const mentions: Mention[] = [];
    for (const claim of current.values()) {
      if (settled.has(String(claim['object_id']))) continue;
      const m = mentionOf(claim);
      if (m !== null) mentions.push(m);
      if (mentions.length >= Math.min(a.limit, MAX_MENTIONS)) break;
    }

    // Working copies: the resolver must see the entities THIS RUN created, or a
    // second mention of a brand-new identifier would mint a duplicate entity.
    const entities: EntityCandidate[] = [...world.entities];
    const identifierIndex = new Map<string, string>(
      world.identifiers.map((i) => [`${String(i['system_key'])} ${String(i['identifier_value'])}`,
                                    String(i['entity_id'])]));
    const authoritative = new Set<string>(
      world.systems.filter((s) => s['is_authoritative'] === true)
        .map((s) => String(s['system_key'])));

    const pin = a.methodId === null ? null
      : await this.loadPin(read, a.methodId, correlationId);

    const outcome: ResolutionRunOutcome = {
      runId, mode: pin === null ? null : pin.gateway_mode,
      mentionsRead: mentions.length, autoResolved: 0, proposed: 0, modelAssisted: 0,
      entitiesCreated: 0, unresolved: [], gatewayCalls: 0, resolutions: [],
    };

    for (const mention of mentions) {
      const scored = this.resolver.score(mention, entities, identifierIndex, authoritative);

      if (scored.kind === 'conflict') {
        outcome.unresolved.push({
          claimObjectId: mention.claimObjectId, mention: mention.text, reason: scored.reason });
        continue;
      }

      let ranking: RankResult | null = null;
      if (scored.kind === 'ambiguous' && pin !== null && a.methodId !== null) {
        ranking = await this.rank(read, a.methodId, pin, runId, mention, scored.candidates);
        outcome.gatewayCalls += 1;
        if (ranking.outcome !== 'completed' || ranking.ranking.length === 0) {
          /*
           * THE MODEL DID NOT ANSWER, SO NEITHER DOES THE RESOLVER.
           *
           * Rule 7: an abstention stays unresolved. Falling back to "the first
           * candidate" here would be forcing a best match under cover of a failed
           * model call, which is the exact failure the rule names.
           */
          outcome.unresolved.push({
            claimObjectId: mention.claimObjectId, mention: mention.text,
            reason: ranking.outcome === 'abstained'
              ? `the model abstained: ${ranking.abstainReason ?? 'no reason given'}`
              : `the ranking call ${ranking.outcome}: ${ranking.failure ?? 'no detail'}`,
          });
          continue;
        }
      }

      const written = await this.writeResolution({
        read, runId, mention, scored, ranking, methodId: a.methodId, pin,
        entities, identifierIndex, correlationId, outcome,
      });
      if (written !== null) outcome.resolutions.push(written);
    }

    return outcome;
  }

  /** The Phase 2 method pin the ranking call runs under. */
  private async loadPin(
    read: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string;
            correlationId: string; purposeId: string },
    methodId: string, correlationId: string,
  ): Promise<MethodPin> {
    /*
     * THE METHOD REGISTRY BELONGS TO PHASE 2.
     *
     * It is read through Phase 2's OWN action and Phase 2's OWN capability, not
     * through the graph read — consuming a published interface means going through
     * its front door, and a Phase 3 action must not become a second way to see
     * Phase 2 state.
     */
    const row = await this.pipeline.consequentialRead<
      Record<string, unknown> | undefined, IntelligenceReads>(
      this.envelope(read, 'intelligence.read', 'MTH', methodId),
      read.principal,
      { scope: 'DOMAIN', tenantId: read.tenantId, domainId: read.domainId,
        action: 'intelligence.read', objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.read,
      async (cap) => (await cap.readMethods().selectAll()
        .where('method_id' as never, '=', methodId as never)
        .executeTakeFirst()) as Record<string, unknown> | undefined);
    const m = row.result;
    if (m === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId,
          'no extraction method matches; the resolver cannot rank without a pinned model'), 404);
    }
    if (String(m['lifecycle_state']) !== 'active') {
      throw new HttpException(
        errorBody('EYE_STA_002', correlationId,
          `ranking refused: the method is ${String(m['lifecycle_state'])}, not active`), 409);
    }
    return {
      method_key: String(m['method_key']), method_version: Number(m['method_version']),
      gateway_mode: String(m['gateway_mode']) as 'replay' | 'local-live',
      model_id: String(m['model_id']),
      model_weights_digest: String(m['model_weights_digest']),
      runtime_version: String(m['runtime_version']),
      prompt_ref: String(m['prompt_ref']), prompt_version: String(m['prompt_version']),
      prompt_text: String(m['prompt_text']), prompt_digest: String(m['prompt_digest']),
      decoding_digest: String(m['decoding_digest']),
      decoding_config: (m['decoding_config'] ?? {}) as Record<string, unknown>,
      confidence_floor: String(m['confidence_floor']), review_below: String(m['review_below']),
      budget_calls: Number(m['budget_calls']), budget_seconds: Number(m['budget_seconds']),
      target_types: m['target_types'] as string[],
      source_id: m['source_id'] === null ? null : String(m['source_id']),
    };
  }

  /**
   * The ranking call, as its own governed operation under Phase 2's OWN action.
   *
   * `intelligence.gateway.call` is the action that authorises reaching the model.
   * `graph.resolution.propose` authorises writing a proposal and must not be
   * allowed to stand in for it — the same separation Phase 2 keeps between reading
   * evidence and admitting a claim.
   */
  private async rank(
    read: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string;
            correlationId: string; purposeId: string },
    methodId: string, pin: MethodPin, runId: string,
    mention: Mention, candidates: readonly EntityCandidate[],
  ): Promise<RankResult> {
    const req: RankRequest = {
      promptRef: pin.prompt_ref, promptVersion: pin.prompt_version,
      promptText: pin.prompt_text, promptDigest: pin.prompt_digest,
      modelId: pin.model_id, weightsDigest: pin.model_weights_digest,
      runtimeVersion: pin.runtime_version, decodingDigest: pin.decoding_digest,
      ...(pin.decoding_config === undefined ? {} : { decodingOptions: pin.decoding_config }),
      input: {
        mention: mention.text,
        context: `entity_type=${mention.entityType} normalized=${normalizeName(mention.text)}`,
        candidates: candidates.map((c) => ({
          entity_id: c.entity_id, canonical_name: c.canonical_name, entity_type: c.entity_type })),
      },
    };
    const out = await this.pipeline.write<RankResult, ExtractionWrites>(
      this.envelope(read, 'intelligence.gateway.call', 'GWC', null),
      read.principal,
      { scope: 'DOMAIN', tenantId: read.tenantId, domainId: read.domainId,
        action: 'intelligence.gateway.call', objectType: 'GWC', objectId: null },
      IntelligenceCapability.extraction,
      async (cap) => {
        const r = await this.gateway.rank(cap,
          { tenantId: read.tenantId, domainId: read.domainId,
            correlationId: read.correlationId },
          { pin, runId, methodId, req });
        return { result: r, targetType: 'GWC', targetId: null, targetVersion: '1',
                 outboxEvent: null };
      });
    return out.result;
  }

  /** One mention, one governed write. */
  private async writeResolution(a: {
    read: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string;
            correlationId: string; purposeId: string };
    runId: string; mention: Mention; scored: ResolverOutcome; ranking: RankResult | null;
    methodId: string | null; pin: MethodPin | null;
    entities: EntityCandidate[]; identifierIndex: Map<string, string>;
    correlationId: string; outcome: ResolutionRunOutcome;
  }): Promise<ResolutionRunOutcome['resolutions'][number] | null> {
    const { mention, scored } = a;
    const resolutionId = newId();
    const normalized = normalizeName(mention.text);

    const out = await this.pipeline.write<
      { entityId: string; method: string; score: number; state: string; created: boolean } | null,
      ResolverWrites>(
      this.envelope(a.read, 'graph.resolution.propose', 'RES', resolutionId),
      a.read.principal,
      { scope: 'DOMAIN', tenantId: a.read.tenantId, domainId: a.read.domainId,
        action: 'graph.resolution.propose', objectType: 'RES', objectId: resolutionId },
      GraphCapability.resolver,
      async (cap, ctx) => {
        const tenantId = ctx.tenantId as string;
        const domainId = ctx.domainId as string;
        const base = {
          resolutionId, tenantId, domainId,
          claimObjectId: mention.claimObjectId, claimVersion: mention.claimVersion,
          mentionText: mention.text,
          ruleVersion: RESOLVER_RULE_VERSION,
          proposer: a.read.principal.principalId,
          evidenceObjectId: mention.evidenceObjectId, evidenceDigest: mention.evidenceDigest,
          eventId: newId(), correlationId: a.correlationId,
        };
        /*
         * MODEL LINEAGE, OR NONE OF IT.
         *
         * Rule 5 requires mode, model, weights, runtime, prompt and decoding
         * digests, confidence and the candidate set on any model-assisted
         * resolution — and migration 0024's `res_model_lineage_complete` refuses
         * a row that carries only some of them. This shape is all-present or
         * all-null for exactly that reason.
         */
        type ModelLineage = {
          mode: string | null; modelId: string | null; weights: string | null;
          runtime: string | null; promptDigest: string | null; decodingDigest: string | null;
          modelConfidence: number | null; callId: string | null;
          methodId: string | null; runId: string | null;
        };
        const noModel: ModelLineage = {
          mode: null, modelId: null, weights: null, runtime: null, promptDigest: null,
          decodingDigest: null, modelConfidence: null, callId: null,
          methodId: null, runId: null,
        };
        type Method = 'deterministic_identifier' | 'deterministic_name' | 'model_assisted' | 'human';
        let created = false;
        let entityId: string;
        let method: Method;
        let score: number;
        let matchEvidence: Record<string, unknown>;
        let candidateSet: Array<Record<string, unknown>> = [];
        let identifierSystem: string | null = null;
        let identifierValue: string | null = null;
        let model: ModelLineage = noModel;

        if (scored.kind === 'identifier') {
          entityId = scored.entityId; method = 'deterministic_identifier'; score = 1;
          matchEvidence = scored.evidence;
          identifierSystem = scored.systemKey; identifierValue = scored.value;
          candidateSet = scored.candidates.map((c) => ({ entity_id: c.entity_id, score: 1 }));
        } else if (scored.kind === 'new_identifier') {
          /*
           * FIRST SIGHTING. The entity is created and the identifier attached in
           * this SAME transaction, so the resolution that follows is a genuine
           * exact match against the registry rather than a promise about one.
           */
          entityId = newId();
          await cap.createEntity({
            entityId, tenantId, domainId, entityType: mention.entityType,
            canonicalName: mention.text, normalizedName: normalized,
            actor: a.read.principal.principalId, splitFrom: null,
            eventId: newId(), correlationId: a.correlationId,
          });
          await cap.attachIdentifier({
            identifierId: newId(), tenantId, domainId, entityId,
            systemKey: scored.systemKey, value: scored.value,
            claimObjectId: mention.claimObjectId, evidenceObjectId: mention.evidenceObjectId,
            actor: a.read.principal.principalId, eventId: newId(), correlationId: a.correlationId,
          });
          created = true;
          method = 'deterministic_identifier'; score = 1;
          matchEvidence = scored.evidence;
          identifierSystem = scored.systemKey; identifierValue = scored.value;
        } else if (scored.kind === 'single_name') {
          entityId = scored.entityId; method = 'deterministic_name'; score = scored.score;
          matchEvidence = scored.evidence;
          candidateSet = scored.candidates.map((c) => ({
            entity_id: c.entity_id, canonical_name: c.canonical_name, score: scored.score }));
        } else if (scored.kind === 'ambiguous') {
          const ranked = a.ranking;
          if (ranked !== null && a.pin !== null && a.methodId !== null) {
            const top = ranked.ranking[0] as { entity_id: string; score: number; reason: string };
            entityId = top.entity_id; method = 'model_assisted'; score = top.score;
            matchEvidence = {
              ...scored.evidence,
              model_reason: top.reason,
              note: 'a model proposal is evidence for the queue, not an identity decision (resolver rule 4)',
            };
            candidateSet = ranked.ranking.map((r) => ({
              entity_id: r.entity_id, score: r.score, reason: r.reason }));
            model = {
              mode: ranked.mode, modelId: a.pin.model_id,
              weights: a.pin.model_weights_digest, runtime: a.pin.runtime_version,
              promptDigest: a.pin.prompt_digest, decodingDigest: a.pin.decoding_digest,
              modelConfidence: top.score, callId: ranked.callId,
              methodId: a.methodId, runId: a.runId,
            };
          } else {
            /*
             * DETERMINISTIC-ONLY AMBIGUITY. With no gateway there is nothing to
             * rank with, so the proposal names the LOWEST-ORDERED candidate purely
             * to have a target and says so in its evidence — the candidate set
             * carries them all, and a person chooses. Nothing about this is a
             * ranking, and the evidence must not read like one.
             */
            const sorted = [...scored.candidates].sort(
              (x, y) => x.entity_id.localeCompare(y.entity_id));
            entityId = (sorted[0] as EntityCandidate).entity_id;
            method = 'deterministic_name'; score = 0.5;
            matchEvidence = {
              ...scored.evidence,
              note: 'ambiguous and no gateway was configured; the named entity is the '
                + 'lowest-ordered candidate and carries no preference. Every candidate is listed.',
            };
            candidateSet = sorted.map((c) => ({
              entity_id: c.entity_id, canonical_name: c.canonical_name, score: null }));
          }
        } else {
          // unmatched: a new entity is PROPOSED, and stays unresolved until a
          // person accepts it (rule 7). Nothing is forced onto an existing entity.
          entityId = newId();
          await cap.createEntity({
            entityId, tenantId, domainId, entityType: mention.entityType,
            canonicalName: mention.text, normalizedName: normalized,
            actor: a.read.principal.principalId, splitFrom: null,
            eventId: newId(), correlationId: a.correlationId,
          });
          created = true;
          method = 'deterministic_name'; score = 0.5;
          matchEvidence = {
            ...scored.evidence,
            note: 'a new entity is proposed for this mention; it resolves only when a person accepts it',
          };
        }

        const r = await cap.proposeResolution({
          ...base, entityId, method,
          ruleId: String(matchEvidence['rule'] ?? 'resolver'), score,
          matchEvidence, candidateSet, identifierSystem, identifierValue,
          ...model,
        });
        return {
          result: { entityId, method, score, state: r.state, created },
          targetType: 'RES', targetId: resolutionId, targetVersion: '1',
          outboxEvent: r.auto_accepted ? {
            eventType: 'EntityResolved',
            payload: { resolution_id: resolutionId, entity_id: entityId,
                       claim_object_id: mention.claimObjectId, method },
          } : null,
        };
      });

    const res = out.result;
    if (res === null) return null;
    if (res.created) {
      a.outcome.entitiesCreated += 1;
      a.entities.push({
        entity_id: res.entityId, entity_type: mention.entityType,
        canonical_name: mention.text, normalized_name: normalized, lifecycle_state: 'active',
      });
      if (scored.kind === 'new_identifier') {
        a.identifierIndex.set(`${scored.systemKey} ${scored.value}`, res.entityId);
      }
    }
    if (res.state === 'accepted') a.outcome.autoResolved += 1; else a.outcome.proposed += 1;
    if (res.method === 'model_assisted') a.outcome.modelAssisted += 1;
    return {
      resolutionId, claimObjectId: mention.claimObjectId, mention: mention.text,
      entityId: res.entityId, method: res.method, score: res.score, state: res.state,
      policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq,
    };
  }

  // ───────────────────────── edges ─────────────────────────

  /**
   * Turn REL claims into edges.
   *
   * BOTH ENDS MUST BE RESOLVED. A REL claim whose subject or object has no
   * accepted resolution is SKIPPED with a named reason rather than being turned
   * into an edge with a string on one end — which would put an unresolved node in
   * the graph and make every traversal past it meaningless.
   */
  async runEdgeBuild(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; limit: number;
  }): Promise<EdgeRunOutcome> {
    const correlationId = a.envelope.correlation_id;
    const purposeId = a.envelope.purpose_id ?? 'graph';
    const read = { principal: a.principal, tenantId: a.tenantId, domainId: a.domainId,
                   correlationId, purposeId };
    const runId = newId();

    const world = await this.read(read, 'REL', null, async (cap) => {
      const accepted = (await cap.readResolutions().selectAll()
        .where('state' as never, '=', 'accepted' as never).execute()) as Array<Record<string, unknown>>;
      const existing = (await cap.readEdges().selectAll().limit(5_000).execute()) as Array<Record<string, unknown>>;
      const rows = (await cap.readCanonicalObjects().selectAll()
        .where('object_type' as never, '=', 'REL' as never)
        .orderBy('recorded_at' as never, 'desc')
        .limit(MAX_REL_CLAIMS).execute()) as Array<Record<string, unknown>>;
      return { accepted, existing, rows };
    });

    // Resolved mention text (normalised) to entity. Built from ACCEPTED
    // resolutions only: a proposal is not an identity.
    const byName = new Map<string, string>();
    for (const r of world.accepted) {
      byName.set(normalizeName(String(r['mention_text'])), String(r['entity_id']));
    }
    const alreadyBuilt = new Set(world.existing.map((e) => String(e['claim_object_id'])));

    const current = new Map<string, Record<string, unknown>>();
    for (const r of world.rows) {
      const id = String(r['object_id']);
      const prev = current.get(id);
      if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
        current.set(id, r);
      }
    }

    const outcome: EdgeRunOutcome = {
      runId, relClaimsRead: 0, edgesAsserted: 0, skipped: [], edges: [],
    };

    for (const claim of current.values()) {
      if (outcome.edgesAsserted >= a.limit) break;
      const claimId = String(claim['object_id']);
      if (alreadyBuilt.has(claimId)) continue;
      outcome.relClaimsRead += 1;

      const payload = (claim['payload'] ?? {}) as Record<string, unknown>;
      const lineage = (payload['lineage'] ?? {}) as Record<string, unknown>;
      const subjectName = normalizeName(String(payload['subject'] ?? ''));
      const objectName = normalizeName(String(payload['object_value'] ?? ''));
      const subject = byName.get(subjectName);
      const object = byName.get(objectName);
      if (subject === undefined || object === undefined) {
        outcome.skipped.push({
          claimObjectId: claimId,
          reason: subject === undefined && object === undefined
            ? 'neither end of this relationship resolves to an entity yet'
            : subject === undefined
              ? `the subject "${String(payload['subject'] ?? '')}" does not resolve to an entity yet`
              : `the object "${String(payload['object_value'] ?? '')}" does not resolve to an entity yet`,
        });
        continue;
      }
      if (subject === object) {
        outcome.skipped.push({
          claimObjectId: claimId,
          reason: 'both ends resolve to the same entity; a self-edge is not a relationship',
        });
        continue;
      }

      const q = (payload['qualifiers'] ?? {}) as Record<string, unknown>;
      const validFrom = isoOr(q['valid_from'])
        ?? isoOr(claim['event_time']) ?? String(claim['recorded_at']);
      const validTo = isoOr(q['valid_to']);
      const evidenceObjectId = String(lineage['evidence_object_id'] ?? '');
      const evidenceDigest = String(lineage['evidence_digest'] ?? '');
      if (evidenceObjectId === '' || !/^[0-9a-f]{64}$/.test(evidenceDigest)) {
        outcome.skipped.push({
          claimObjectId: claimId,
          reason: 'the claim carries no evidence lineage; an edge without provenance is not admissible',
        });
        continue;
      }

      const edgeId = newId();
      const out = await this.pipeline.write<{ edgeId: string }, EdgeWrites>(
        this.envelope(read, 'graph.edge.assert', 'EDG', edgeId),
        a.principal,
        { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
          action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId },
        GraphCapability.edges,
        async (cap, ctx) => {
          await cap.assertEdge({
            edgeId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
            subject, predicate: String(payload['predicate'] ?? 'related_to'), object,
            validFrom, validTo,
            claimObjectId: claimId, claimVersion: Number(claim['object_version']),
            evidenceObjectId, evidenceDigest,
            methodId: null,
            runId: typeof lineage['run_id'] === 'string' ? (lineage['run_id'] as string) : null,
            mode: typeof lineage['mode'] === 'string' ? (lineage['mode'] as string) : 'replay',
            confidence: Number(payload['confidence'] ?? 0),
            actor: a.principal.principalId, eventId: newId(), correlationId,
          });
          return { result: { edgeId }, targetType: 'EDG', targetId: edgeId,
                   targetVersion: '1', outboxEvent: null };
        });
      outcome.edgesAsserted += 1;
      outcome.edges.push({
        edgeId: out.result.edgeId, subject, object,
        predicate: String(payload['predicate'] ?? 'related_to'),
        policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq,
      });
      void this.edges;
    }

    return outcome;
  }
}

function isoOr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
