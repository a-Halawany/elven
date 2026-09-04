/**
 * THE MODEL GATEWAY — the single egress for model calls, in two modes.
 *
 * `replay`     recorded responses. The deterministic default: CI, the acceptance
 *              criteria and the reproducible demonstration all run here, and the
 *              answer for a given request is the exact bytes that were recorded
 *              for exactly that request.
 * `local-live` a real local open-weights model through an Ollama/llama.cpp
 *              adapter. Model name, weights digest, runtime version, prompt
 *              version and decoding configuration are pinned by the method and
 *              recorded on every call.
 *
 * NO HOSTED MODEL API. There is no provider here that reaches a paid endpoint,
 * and none is configurable: the mode enum has two values and both run locally.
 *
 * REPLAY NEVER PRETENDS A MODEL RAN. `mode` is carried on the call record, the
 * run, the claim lineage and the receipt, and a replay miss is a FAILURE with a
 * named reason — never a silent fall-through to a live call. A demonstration that
 * quietly reached a model would be a demonstration of something else.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ExtractionWrites, MethodPin } from '../intelligence.capabilities.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Canonical object code → the kind word the extraction contract accepts. */
const TYPE_TO_KIND: Readonly<Record<string, string>> = Object.freeze({
  ENT: 'entity', EVT: 'event', CLM: 'claim', REL: 'relationship', ASM: 'assessment',
});

/** What the model is asked for, canonically. The digest of this IS the cache key. */
export interface GatewayRequest {
  promptRef: string;
  promptVersion: string;
  /** The instruction itself. Digested into the identity, and actually sent. */
  promptText: string;
  promptDigest: string;
  modelId: string;
  weightsDigest: string;
  runtimeVersion: string;
  decodingDigest: string;
  /** The decoding configuration itself, as the runtime takes it. */
  decodingOptions?: Record<string, unknown>;
  /** The evidence excerpt and everything the instruction refers to. */
  input: Record<string, unknown>;
}

export interface ExtractedClaim {
  claim_kind: 'entity' | 'event' | 'claim' | 'relationship' | 'assessment';
  subject: string;
  predicate: string;
  object_value: string;
  confidence: number;
  byte_start: number;
  byte_end: number;
  qualifiers?: Record<string, unknown>;
}

export interface GatewayResult {
  callId: string;
  mode: 'replay' | 'local-live';
  outcome: 'completed' | 'abstained' | 'refused' | 'failed';
  requestDigest: string;
  responseDigest: string | null;
  claims: ExtractedClaim[];
  abstainReason: string | null;
  failure: string | null;
  latencyMs: number;
}

export function requestDigestOf(req: GatewayRequest): string {
  return sha256(jcsCanonicalize({
    prompt_ref: req.promptRef,
    prompt_version: req.promptVersion,
    prompt_digest: req.promptDigest,
    model_id: req.modelId,
    weights_digest: req.weightsDigest,
    runtime_version: req.runtimeVersion,
    decoding_digest: req.decodingDigest,
    input: req.input,
  }));
}

/**
 * The extraction identity (B5): the evidence digest plus every digest that
 * describes HOW it was read. Changing the prompt, the model, the weights or the
 * decoding configuration is a different extraction, not a silent re-run of the
 * same one.
 */
export function extractionIdentityOf(a: {
  evidenceDigest: string; methodId: string; modelId: string; weightsDigest: string;
  promptDigest: string; decodingDigest: string;
}): string {
  return sha256(jcsCanonicalize({
    evidence_digest: a.evidenceDigest,
    method_id: a.methodId,
    model_id: a.modelId,
    weights_digest: a.weightsDigest,
    prompt_digest: a.promptDigest,
    decoding_digest: a.decodingDigest,
  }));
}

/** A response is well-formed or it is refused. Neither shape is inferred. */
function parseResponse(raw: unknown): { claims: ExtractedClaim[]; abstain: string | null } | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o['abstain'] === true) {
    const reason = typeof o['reason'] === 'string' && o['reason'].length > 0
      ? o['reason'] : 'the model abstained without giving a reason';
    return { claims: [], abstain: reason };
  }
  if (!Array.isArray(o['claims'])) return null;
  const claims: ExtractedClaim[] = [];
  for (const c of o['claims'] as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const x = c as Record<string, unknown>;
    const kind = x['claim_kind'];
    if (typeof kind !== 'string'
      || !['entity', 'event', 'claim', 'relationship', 'assessment'].includes(kind)) return null;
    if (typeof x['subject'] !== 'string' || typeof x['predicate'] !== 'string'
      || typeof x['object_value'] !== 'string') return null;
    const conf = x['confidence'];
    if (typeof conf !== 'number' || conf < 0 || conf > 1) return null;
    const bs = x['byte_start']; const be = x['byte_end'];
    if (typeof bs !== 'number' || typeof be !== 'number' || bs < 0 || be < bs) return null;
    const q = x['qualifiers'];
    claims.push({
      claim_kind: kind as ExtractedClaim['claim_kind'],
      subject: x['subject'], predicate: x['predicate'], object_value: x['object_value'],
      confidence: conf, byte_start: bs, byte_end: be,
      ...(q === null || q === undefined ? {} : { qualifiers: q as Record<string, unknown> }),
    });
  }
  return { claims, abstain: null };
}

/**
 * WHAT A RANKING REQUEST IS.
 *
 * Phase 3's resolver reaches the gateway for exactly one thing: ordering
 * candidate entities for a mention it could not resolve deterministically. It is
 * a SEPARATE contract from extraction because it asks a different question, and
 * it lives here rather than in a second gateway because "the single egress for
 * model calls" is this file's whole reason to exist — a Phase 3 egress of its own
 * would have broken that invariant to avoid touching this file, which is the
 * wrong trade.
 *
 * Nothing about extraction changes: `call()` is untouched, and a ranking request
 * digests differently, so the two can never collide in the replay store.
 */
export interface RankRequest {
  promptRef: string;
  promptVersion: string;
  promptText: string;
  promptDigest: string;
  modelId: string;
  weightsDigest: string;
  runtimeVersion: string;
  decodingDigest: string;
  decodingOptions?: Record<string, unknown>;
  /** The mention, and every candidate it might be. */
  input: {
    mention: string;
    context: string;
    candidates: Array<{ entity_id: string; canonical_name: string; entity_type: string }>;
  };
}

export interface RankedCandidate {
  entity_id: string;
  score: number;
  reason: string;
}

export interface RankResult {
  callId: string;
  mode: 'replay' | 'local-live';
  outcome: 'completed' | 'abstained' | 'refused' | 'failed';
  requestDigest: string;
  responseDigest: string | null;
  ranking: RankedCandidate[];
  abstainReason: string | null;
  failure: string | null;
  latencyMs: number;
}

export function rankRequestDigestOf(req: RankRequest): string {
  return sha256(jcsCanonicalize({
    kind: 'entity-ranking',
    prompt_ref: req.promptRef,
    prompt_version: req.promptVersion,
    prompt_digest: req.promptDigest,
    model_id: req.modelId,
    weights_digest: req.weightsDigest,
    runtime_version: req.runtimeVersion,
    decoding_digest: req.decodingDigest,
    input: req.input,
  }));
}

/** A ranking is well-formed or it is refused. Neither shape is inferred. */
function parseRanking(
  raw: unknown, permitted: ReadonlySet<string>,
): { ranking: RankedCandidate[]; abstain: string | null } | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o['abstain'] === true) {
    const reason = typeof o['reason'] === 'string' && o['reason'].length > 0
      ? o['reason'] : 'the model abstained without giving a reason';
    return { ranking: [], abstain: reason };
  }
  if (!Array.isArray(o['ranking'])) return null;
  const ranking: RankedCandidate[] = [];
  for (const c of o['ranking'] as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const x = c as Record<string, unknown>;
    const id = x['entity_id'];
    // A ranking may only order the candidates it was GIVEN. A model naming an
    // entity that was not on the list is refused, not filtered: an answer to a
    // different question is not a partially correct answer to this one.
    if (typeof id !== 'string' || !permitted.has(id)) return null;
    const score = x['score'];
    if (typeof score !== 'number' || score < 0 || score > 1) return null;
    const reason = x['reason'];
    if (typeof reason !== 'string' || reason.length === 0) return null;
    ranking.push({ entity_id: id, score, reason });
  }
  return { ranking, abstain: null };
}

@Injectable()
export class ModelGatewayService {
  private readonly log = new Logger('ModelGateway');

  /**
   * The ONE place a model response is obtained. Every path through it writes a
   * gateway call record before returning, so a call that happened is a call that
   * is logged — including the ones that failed.
   */
  async call(
    cap: ExtractionWrites,
    ctx: { tenantId: string; domainId: string; correlationId: string },
    a: { pin: MethodPin; runId: string | null; methodId: string; req: GatewayRequest },
  ): Promise<GatewayResult> {
    const started = Date.now();
    const requestDigest = requestDigestOf(a.req);
    const callId = newId();
    const mode = a.pin.gateway_mode;

    let outcome: GatewayResult['outcome'] = 'failed';
    let responseDigest: string | null = null;
    let claims: ExtractedClaim[] = [];
    let abstainReason: string | null = null;
    let failure: string | null = null;
    let detail: Record<string, unknown> = {};

    try {
      const raw = mode === 'replay'
        ? await this.fromRecording(cap, ctx, requestDigest)
        : await this.fromLocalModel(a.req);

      if (raw === null) {
        failure = mode === 'replay'
          ? 'no recorded response exists for this request digest — replay does not fall through to a live call'
          : 'the local model returned nothing';
        detail = { request_digest: requestDigest };
      } else {
        responseDigest = sha256(jcsCanonicalize(raw));
        const parsed = parseResponse(raw);
        if (parsed === null) {
          outcome = 'refused';
          failure = 'the response did not match the extraction contract and was refused rather than coerced';
        } else if (parsed.abstain !== null) {
          outcome = 'abstained';
          abstainReason = parsed.abstain;
        } else {
          outcome = 'completed';
          claims = parsed.claims;
        }
        // A live response becomes replayable, so the same extraction can be
        // reproduced later without the model. This is how the demonstration stays
        // deterministic without pretending the model never ran.
        if (mode === 'local-live') {
          await cap.recordResponse({
            tenantId: ctx.tenantId, domainId: ctx.domainId, requestDigest, response: raw,
            responseDigest, modelId: a.req.modelId, runtime: a.req.runtimeVersion,
            from: 'local-live', correlationId: ctx.correlationId,
          });
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400);
    }

    const latencyMs = Date.now() - started;
    await cap.recordGatewayCall({
      callId, tenantId: ctx.tenantId, domainId: ctx.domainId, runId: a.runId,
      methodId: a.methodId, mode, requestDigest, responseDigest,
      modelId: a.req.modelId, weights: a.req.weightsDigest, runtime: a.req.runtimeVersion,
      promptVersion: a.req.promptVersion, decoding: a.req.decodingDigest,
      outcome, latencyMs,
      detail: { ...detail, ...(failure === null ? {} : { failure }),
                ...(abstainReason === null ? {} : { abstain_reason: abstainReason }) },
      correlationId: ctx.correlationId,
    });

    return { callId, mode, outcome, requestDigest, responseDigest, claims, abstainReason, failure, latencyMs };
  }

  /** REPLAY: an exact lookup. Not a cache, not a nearest match, no fall-through. */
  private async fromRecording(
    cap: ExtractionWrites, ctx: { tenantId: string; domainId: string }, requestDigest: string,
  ): Promise<unknown | null> {
    const rows = (await cap.readRecordedResponses()
      .selectAll()
      .where('request_digest' as never, '=', requestDigest as never)
      .limit(1)
      .execute()) as Array<{ response: unknown }>;
    void ctx;
    return rows[0]?.response ?? null;
  }

  /**
   * LOCAL-LIVE: a local open-weights model over the Ollama-compatible HTTP API,
   * which llama.cpp's server also speaks. Loopback only, no credential, no paid
   * endpoint. If nothing is listening the call FAILS and says so; it does not
   * quietly become a replay.
   */
  private async fromLocalModel(req: GatewayRequest): Promise<unknown | null> {
    const host = process.env['EYE_MODEL_HOST'] ?? 'http://127.0.0.1:11434';
    const url = new URL('/api/generate', host);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error(`local-live refused: ${url.hostname} is not loopback; Phase 2 uses no hosted model API`);
    }
    /*
     * THE INSTRUCTION FIRST, THEN THE EVIDENCE.
     *
     * The first version sent JSON.stringify(input) as the whole prompt — a blob
     * with no question in it — and a small instruct model did the only reasonable
     * thing with that: it echoed the blob back. The gateway refused the answer,
     * correctly, and the refusal was the only thing that was working.
     */
    const input = req.input as Record<string, unknown>;
    const prompt = [
      req.promptText,
      '',
      `SOURCE: ${String(input['source_key'] ?? '')}`,
      `ITEM: ${String(input['item_key'] ?? '')}`,
      // ASK IN THE VOCABULARY THE CONTRACT ACCEPTS. `target_types` are canonical
      // object codes (ENT, EVT, CLM); the response contract takes kind WORDS. The
      // first version put the codes in the prompt, the model dutifully answered
      // with "ENT", and the parser refused it — a refusal caused by the question,
      // not the answer.
      `PERMITTED CLAIM KINDS: ${((input['target_types'] as string[]) ?? [])
        .map((t) => TYPE_TO_KIND[t] ?? t).join(', ')}`,
      '',
      'EVIDENCE (byte offsets are into exactly this text):',
      String(input['evidence'] ?? ''),
      '',
      'JSON:',
    ].join('\n');
    const body = {
      model: req.modelId,
      prompt,
      stream: false,
      format: 'json',
      options: req.decodingOptions ?? {},
    };
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); }, 120_000);
    try {
      const r = await fetch(url, {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`local model responded ${r.status}`);
      const envelope = (await r.json()) as { response?: string };
      if (typeof envelope.response !== 'string') return null;
      try {
        return JSON.parse(envelope.response) as unknown;
      } catch {
        throw new Error('the local model did not return the JSON the extraction contract requires');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * RANK candidate entities for one ambiguous mention (resolver rule 3).
   *
   * The result is EVIDENCE, never a decision: the caller writes it onto a
   * resolution PROPOSAL with its full lineage, and rule 4 — enforced by migration
   * 0024's `res_auto_only_on_identifier` — means no proposal carrying it can
   * become an acceptance without a person.
   *
   * Same two modes, same discipline: a replay miss FAILS with a named reason and
   * never falls through to a live call.
   */
  async rank(
    cap: ExtractionWrites,
    ctx: { tenantId: string; domainId: string; correlationId: string },
    a: { pin: MethodPin; runId: string | null; methodId: string; req: RankRequest },
  ): Promise<RankResult> {
    const started = Date.now();
    const requestDigest = rankRequestDigestOf(a.req);
    const callId = newId();
    const mode = a.pin.gateway_mode;
    const permitted = new Set(a.req.input.candidates.map((c) => c.entity_id));

    let outcome: RankResult['outcome'] = 'failed';
    let responseDigest: string | null = null;
    let ranking: RankedCandidate[] = [];
    let abstainReason: string | null = null;
    let failure: string | null = null;

    try {
      const raw = mode === 'replay'
        ? await this.fromRecording(cap, ctx, requestDigest)
        : await this.rankFromLocalModel(a.req);
      if (raw === null) {
        failure = mode === 'replay'
          ? 'no recorded ranking exists for this request digest — replay does not fall through to a live call'
          : 'the local model returned nothing';
      } else {
        responseDigest = sha256(jcsCanonicalize(raw));
        const parsed = parseRanking(raw, permitted);
        if (parsed === null) {
          outcome = 'refused';
          failure = 'the ranking did not match the contract and was refused rather than coerced';
        } else if (parsed.abstain !== null) {
          outcome = 'abstained';
          abstainReason = parsed.abstain;
        } else {
          outcome = 'completed';
          ranking = [...parsed.ranking].sort((x, y) => y.score - x.score);
        }
        if (mode === 'local-live') {
          await cap.recordResponse({
            tenantId: ctx.tenantId, domainId: ctx.domainId, requestDigest, response: raw,
            responseDigest, modelId: a.req.modelId, runtime: a.req.runtimeVersion,
            from: 'local-live', correlationId: ctx.correlationId,
          });
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400);
    }

    const latencyMs = Date.now() - started;
    await cap.recordGatewayCall({
      callId, tenantId: ctx.tenantId, domainId: ctx.domainId, runId: a.runId,
      methodId: a.methodId, mode, requestDigest, responseDigest,
      modelId: a.req.modelId, weights: a.req.weightsDigest, runtime: a.req.runtimeVersion,
      promptVersion: a.req.promptVersion, decoding: a.req.decodingDigest,
      outcome, latencyMs,
      detail: { purpose: 'entity-ranking', candidates: a.req.input.candidates.length,
                ...(failure === null ? {} : { failure }),
                ...(abstainReason === null ? {} : { abstain_reason: abstainReason }) },
      correlationId: ctx.correlationId,
    });

    return { callId, mode, outcome, requestDigest, responseDigest, ranking,
             abstainReason, failure, latencyMs };
  }

  /** LOCAL-LIVE ranking. Same loopback-only rule; no hosted endpoint exists here. */
  private async rankFromLocalModel(req: RankRequest): Promise<unknown | null> {
    const host = process.env['EYE_MODEL_HOST'] ?? 'http://127.0.0.1:11434';
    const url = new URL('/api/generate', host);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error(`local-live refused: ${url.hostname} is not loopback; no hosted model API is used`);
    }
    const prompt = [
      req.promptText,
      '',
      `MENTION: ${req.input.mention}`,
      `CONTEXT: ${req.input.context}`,
      '',
      'CANDIDATES (rank only these; entity_id must be copied exactly):',
      ...req.input.candidates.map(
        (c) => `- entity_id=${c.entity_id} name="${c.canonical_name}" type=${c.entity_type}`),
      '',
      'JSON:',
    ].join('\n');
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); }, 120_000);
    try {
      const r = await fetch(url, {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.modelId, prompt, stream: false, format: 'json',
          options: req.decodingOptions ?? {},
        }),
      });
      if (!r.ok) throw new Error(`local model responded ${r.status}`);
      const envelope = (await r.json()) as { response?: string };
      if (typeof envelope.response !== 'string') return null;
      try {
        return JSON.parse(envelope.response) as unknown;
      } catch {
        throw new Error('the local model did not return the JSON the ranking contract requires');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
