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

/**
 * A response is well-formed or it is refused. Neither shape is inferred.
 *
 * `evidenceBytes` is the length of the evidence the request actually carried, and
 * every claim's span must lie inside it. Without that bound the parser accepted
 * `byte_end: 1000000` against three bytes of evidence — a lineage row pointing at
 * an offset that cannot be read back is not provenance, it is a number.
 */
function parseResponse(
  raw: unknown, evidenceBytes: number,
): { claims: ExtractedClaim[]; abstain: string | null } | null {
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
    if (!Number.isInteger(bs) || !Number.isInteger(be)) return null;
    // THE SPAN MUST BE READABLE. A claim whose offsets fall outside the evidence
    // it was given cannot be checked against the bytes, so it is refused rather
    // than admitted with an unusable lineage row.
    if (be > evidenceBytes) return null;
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
    let observedModel: string | null = null;

    /*
     * The evidence the request actually carried, in bytes. Every claim's span is
     * checked against this, so a lineage row can always be read back.
     */
    const evidenceBytes = Buffer.byteLength(
      String((a.req.input as Record<string, unknown>)['evidence'] ?? ''), 'utf8');

    try {
      const got = mode === 'replay'
        ? { raw: await this.fromRecording(cap, ctx, requestDigest), model: null }
        : await this.fromLocalModel(a.req);
      const raw = got.raw;
      observedModel = got.model;

      /*
       * WHICH MODEL ANSWERED — not which one was asked for.
       *
       * The pin says what the method requires; the runtime's own response says
       * what served it. Recording only the pin makes the lineage claim an
       * execution fact it never established. When the two disagree the call
       * FAILS: a claim attributed to a model that did not produce it is worse
       * than no claim.
       */
      if (observedModel !== null && observedModel !== a.req.modelId) {
        outcome = 'failed';
        failure = `model mismatch: the method pinned ${a.req.modelId} and the runtime answered `
          + `as ${observedModel}; the response is refused rather than attributed to the pin`;
        detail = { request_digest: requestDigest, observed_model: observedModel,
                   pinned_model: a.req.modelId, model_identity: 'observed_differs_from_pin' };
      } else if (raw === null) {
        failure = mode === 'replay'
          ? 'no recorded response exists for this request digest — replay does not fall through to a live call'
          : 'the local model returned nothing';
        detail = { request_digest: requestDigest };
      } else {
        responseDigest = sha256(jcsCanonicalize(raw));
        const parsed = parseResponse(raw, evidenceBytes);
        if (parsed === null) {
          outcome = 'refused';
          failure = 'the response did not match the extraction contract — its shape, or a byte '
            + 'span that falls outside the evidence supplied — and was refused rather than coerced';
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
      detail: {
        /*
         * WHAT WAS ASKED FOR AND WHAT ANSWERED, always both.
         *
         * `model_identity` states the strength of the evidence rather than
         * leaving a reader to assume it: a replayed response observes no runtime
         * at all, and saying so is the difference between recorded configuration
         * and verified execution.
         */
        pinned_model: a.req.modelId,
        observed_model: observedModel,
        model_identity: mode === 'replay' ? 'not_observed_replay'
          : observedModel === null ? 'not_reported_by_runtime'
          : observedModel === a.req.modelId ? 'observed_matches_pin'
          : 'observed_differs_from_pin',
        ...detail,
        ...(failure === null ? {} : { failure }),
        ...(abstainReason === null ? {} : { abstain_reason: abstainReason }),
      },
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
  private async fromLocalModel(
    req: GatewayRequest,
  ): Promise<{ raw: unknown | null; model: string | null }> {
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
      // The runtime names the model that served the request in its own envelope.
      // That name is the only execution evidence this call has, and it travels
      // back so the caller can compare it against the pin rather than assume.
      const envelope = (await r.json()) as { response?: string; model?: string };
      const model = typeof envelope.model === 'string' && envelope.model.length > 0
        ? envelope.model : null;
      if (typeof envelope.response !== 'string') return { raw: null, model };
      try {
        return { raw: JSON.parse(envelope.response) as unknown, model };
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
    let observedModel: string | null = null;

    try {
      const got = mode === 'replay'
        ? { raw: await this.fromRecording(cap, ctx, requestDigest), model: null }
        : await this.rankFromLocalModel(a.req);
      const raw = got.raw;
      observedModel = got.model;
      if (observedModel !== null && observedModel !== a.req.modelId) {
        outcome = 'failed';
        failure = `model mismatch: the method pinned ${a.req.modelId} and the runtime answered `
          + `as ${observedModel}; the ranking is refused rather than attributed to the pin`;
      } else if (raw === null) {
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
                pinned_model: a.req.modelId, observed_model: observedModel,
                model_identity: mode === 'replay' ? 'not_observed_replay'
                  : observedModel === null ? 'not_reported_by_runtime'
                  : observedModel === a.req.modelId ? 'observed_matches_pin'
                  : 'observed_differs_from_pin',
                ...(failure === null ? {} : { failure }),
                ...(abstainReason === null ? {} : { abstain_reason: abstainReason }) },
      correlationId: ctx.correlationId,
    });

    return { callId, mode, outcome, requestDigest, responseDigest, ranking,
             abstainReason, failure, latencyMs };
  }

  /** LOCAL-LIVE ranking. Same loopback-only rule; no hosted endpoint exists here. */
  private async rankFromLocalModel(
    req: RankRequest,
  ): Promise<{ raw: unknown | null; model: string | null }> {
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
      const envelope = (await r.json()) as { response?: string; model?: string };
      const model = typeof envelope.model === 'string' && envelope.model.length > 0
        ? envelope.model : null;
      if (typeof envelope.response !== 'string') return { raw: null, model };
      try {
        return { raw: JSON.parse(envelope.response) as unknown, model };
      } catch {
        throw new Error('the local model did not return the JSON the ranking contract requires');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
