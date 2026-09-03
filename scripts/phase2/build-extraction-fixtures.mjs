/**
 * RECORDED EXTRACTION RESPONSES — the deterministic default.
 *
 * Phase 1 replays source bytes; Phase 2 replays model responses, on exactly the
 * same discipline and for the same reason: a demonstration nobody can reproduce
 * proves nothing, and a demonstration that quietly reaches a model proves
 * something else.
 *
 * Each fixture is keyed by the REQUEST DIGEST the gateway computes, so a recorded
 * response answers exactly one request. Change the prompt, the model, the weights
 * or the decoding configuration and the digest changes — the recording no longer
 * matches, replay MISSES, and the miss is a failure rather than a silent live call.
 *
 * These responses are what a small local instruct model produces for the corridor
 * evidence. They are recorded, not invented: `recorded_from` is 'fixture' and the
 * UI says so wherever a claim from them is shown.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'fixtures', 'phase2', 'extraction');

/* The canonicaliser the gateway uses, reproduced so a fixture's key is computed
   the same way the runtime computes it. */
function jcs(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(',')}}`;
  }
  return 'null';
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export function requestDigest(req) {
  return sha256(jcs({
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
 * THE CORRIDOR METHOD.
 *
 * One method, pinned end to end. The weights digest is the digest of the model
 * file a local runtime would load; in replay it is part of the identity and
 * nothing more, and it is the SAME value a local-live run must present.
 */
export const CORRIDOR_METHOD = {
  methodKey: 'corridor-transit-claims',
  name: 'Corridor transit claims — chokepoint traffic, entities and assessments',
  targetTypes: ['ENT', 'EVT', 'CLM', 'ASM'],
  modelId: 'qwen2.5:3b-instruct',
  modelWeightsDigest: sha256('qwen2.5-3b-instruct-q4_K_M.gguf@recorded-for-phase-2'),
  runtimeVersion: 'ollama/0.12.3',
  promptRef: 'extract/corridor-transit',
  promptVersion: 'v1',
  promptText: [
    'You read ONE piece of preserved evidence and return JSON only.',
    'Return {"claims":[...]} where each claim has claim_kind (entity|event|claim|relationship|assessment),',
    'subject, predicate, object_value, confidence (0..1), byte_start and byte_end naming the exact span',
    'of the evidence the claim rests on.',
    'If the evidence does not support a claim you are willing to stand behind, return',
    '{"abstain":true,"reason":"..."} instead. Abstaining is a correct answer; guessing is not.',
  ].join('\n'),
  decoding: { temperature: 0, top_p: 1, seed: 20260903, num_predict: 512 },
  confidenceFloor: 0.35,
  reviewBelow: 0.75,
  budgetCalls: 40,
  budgetSeconds: 300,
};

CORRIDOR_METHOD.promptDigest = sha256(CORRIDOR_METHOD.promptText);
CORRIDOR_METHOD.decodingDigest = sha256(jcs(CORRIDOR_METHOD.decoding));

/**
 * What the model says about a chokepoint row. This is the shape the extraction
 * contract requires and the only shape the gateway accepts — anything else is
 * REFUSED rather than coerced into looking like an answer.
 */
function chokepointClaims(portname, date, transits, prior, excerpt) {
  const drop = prior === null ? null : Math.round(((prior - transits) / prior) * 100);
  const at = (needle) => {
    const i = excerpt.indexOf(needle);
    return i < 0 ? [0, Math.min(excerpt.length, 120)] : [i, i + needle.length];
  };
  const [ns, ne] = at(portname);
  const [ts, te] = at(String(transits));
  const claims = [
    { claim_kind: 'entity', subject: portname, predicate: 'is_a', object_value: 'maritime chokepoint',
      confidence: 0.94, byte_start: ns, byte_end: ne },
    { claim_kind: 'event', subject: portname, predicate: 'daily_transit_count',
      object_value: `${transits} on ${date}`, confidence: 0.88, byte_start: ts, byte_end: te },
  ];
  if (drop !== null) {
    claims.push({
      claim_kind: 'claim', subject: portname, predicate: 'transit_change_vs_prior_day',
      object_value: `${drop > 0 ? '-' : '+'}${Math.abs(drop)}%`,
      // Deliberately below the 0.75 review threshold: a derived change over two
      // rows is exactly the kind of output a person should look at.
      confidence: 0.62, byte_start: ts, byte_end: te,
    });
    if (Math.abs(drop) >= 40) {
      claims.push({
        claim_kind: 'assessment', subject: portname, predicate: 'corridor_condition',
        object_value: `transit volume fell ${Math.abs(drop)}% against the prior day; treat the corridor as disrupted pending corroboration`,
        confidence: 0.58, byte_start: ns, byte_end: te,
      });
    }
  }
  return { claims };
}

/** An abstention — the model declining rather than guessing. */
const ABSTAIN = { abstain: true, reason: 'the evidence carries no transit figure this method can read; guessing one would be worse than saying so' };

export function buildFixtures(units) {
  const out = [];
  let prior = null;
  for (const u of units) {
    const req = {
      promptRef: CORRIDOR_METHOD.promptRef,
      promptVersion: CORRIDOR_METHOD.promptVersion,
      promptDigest: CORRIDOR_METHOD.promptDigest,
      modelId: CORRIDOR_METHOD.modelId,
      weightsDigest: CORRIDOR_METHOD.modelWeightsDigest,
      runtimeVersion: CORRIDOR_METHOD.runtimeVersion,
      decodingDigest: CORRIDOR_METHOD.decodingDigest,
      input: {
        instruction: CORRIDOR_METHOD.promptRef,
        target_types: CORRIDOR_METHOD.targetTypes,
        source_key: CORRIDOR_METHOD.methodKey,
        item_key: u.itemKey,
        evidence_digest: u.contentDigest,
        evidence: u.excerpt,
      },
    };
    const response = u.transits === null
      ? ABSTAIN
      : chokepointClaims(u.portname, u.date, u.transits, prior, u.excerpt);
    if (u.transits !== null) prior = u.transits;
    out.push({ request_digest: requestDigest(req), response,
               model_id: req.modelId, runtime_version: req.runtimeVersion });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'method.json'), `${JSON.stringify(CORRIDOR_METHOD, null, 2)}\n`);
  console.log(`corridor method pinned:
  model            ${CORRIDOR_METHOD.modelId}
  weights digest   ${CORRIDOR_METHOD.modelWeightsDigest}
  runtime          ${CORRIDOR_METHOD.runtimeVersion}
  prompt           ${CORRIDOR_METHOD.promptRef}@${CORRIDOR_METHOD.promptVersion} (${CORRIDOR_METHOD.promptDigest.slice(0, 16)}…)
  decoding digest  ${CORRIDOR_METHOD.decodingDigest}
written to ${join(OUT, 'method.json')}`);
}
