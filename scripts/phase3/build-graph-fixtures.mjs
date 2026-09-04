/**
 * RECORDED SUPPLY-CHAIN RESPONSES — the second half of the corridor graph.
 *
 * Phase 2's corridor method reads IMF PortWatch chokepoint rows and produces
 * entities, events, claims and assessments about the strait. It says nothing
 * about who depends on it, because the chokepoint rows do not.
 *
 * This method reads NORDWERK's own uploaded shipment and inventory records — the
 * synthetic half of the demonstration, marked `synthetic=true` at row level in the
 * frozen replay set — and produces the RELATIONSHIPS that connect the corridor to
 * a component, a shipment and a manufacturer. Those relationships are what Phase 3
 * turns into governed edges, and what the Strategy Graph then rests on.
 *
 * THESE RESPONSES ARE WRITTEN BY HAND, exactly as Phase 2's are. No model produced
 * them. They are stored `recorded_from: 'fixture'`, a claim built from one carries
 * `mode: replay`, and nothing anywhere presents them as the output of a model that
 * ran.
 *
 * The mention "Bab el-Mandeb" here carries NO identifier, deliberately. A shipping
 * manifest does not print IMF PortWatch ids, so this mention CANNOT resolve
 * automatically — it reaches the resolution queue, and a person who knows the
 * domain says it is the corridor the chokepoint source already tracks. That is the
 * honest shape of the problem, and it is the half of Phase 3 that a machine must
 * not do on its own.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'fixtures', 'phase3', 'supply-chain');

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

/** THE SUPPLY-CHAIN METHOD. One method, pinned end to end, as Phase 2 requires. */
export const SUPPLY_METHOD = {
  methodKey: 'corridor-supply-relationships',
  name: 'Corridor supply relationships — shipments, components and the manufacturer',
  targetTypes: ['ENT', 'REL'],
  modelId: 'qwen2.5:3b-instruct',
  modelWeightsDigest: sha256('qwen2.5-3b-instruct-q4_K_M.gguf@recorded-for-phase-2'),
  runtimeVersion: 'ollama/0.12.3',
  promptRef: 'extract/corridor-supply',
  promptVersion: 'v1',
  promptText: [
    'You read ONE internal shipment or inventory record and return JSON only.',
    'Return {"claims":[...]} where each claim has claim_kind (entity|relationship),',
    'subject, predicate, object_value, confidence (0..1), byte_start and byte_end naming the exact',
    'span of the record the claim rests on. Name the things the record identifies and the',
    'relationships it states between them, and nothing it does not state.',
    'If the record supports no claim you are willing to stand behind, return',
    '{"abstain":true,"reason":"..."} instead. Abstaining is a correct answer; guessing is not.',
  ].join('\n'),
  decoding: { temperature: 0, top_p: 1, seed: 20260904, num_predict: 512 },
  confidenceFloor: 0.35,
  reviewBelow: 0.75,
  budgetCalls: 40,
  budgetSeconds: 300,
};
SUPPLY_METHOD.promptDigest = sha256(SUPPLY_METHOD.promptText);
SUPPLY_METHOD.decodingDigest = sha256(jcs(SUPPLY_METHOD.decoding));

/** The manufacturer. It is the same organisation in every record. */
const MANUFACTURER = 'NORDWERK ANTRIEBSTECHNIK GmbH';

/**
 * PHASE 2's DECLARED-TARGET BOUND IS EIGHT CLAIMS PER EVIDENCE OBJECT.
 *
 * The orchestrator declares exactly eight writable claim ids before it mints the
 * capability, and the database refuses anything outside that set — so a fixture
 * that returned more would have the surplus silently dropped. Each response here
 * stays at or under the bound, and the choice of WHICH claims to make is
 * therefore part of the fixture rather than an accident of ordering.
 */
const MAX_CLAIMS = 8;

/** Read a CSV upload into rows. The uploads are whole files, not framed rows. */
function csvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

/** Which corridor a stated position sits on, WORDED AS THE RECORD WORDS IT. */
const CORRIDOR_WORDS = ['Bab el-Mandeb', 'Suez', 'Malacca'];

function spanIn(excerpt, needle) {
  const i = excerpt.indexOf(needle);
  return i < 0 ? [0, Math.min(excerpt.length, 120)] : [i, i + needle.length];
}

const ORG_CLAIM = (excerpt) => {
  const [s, e] = spanIn(excerpt, 'synthetic');
  return {
    claim_kind: 'entity', subject: MANUFACTURER, predicate: 'is_a',
    object_value: 'manufacturer', confidence: 0.9, byte_start: s, byte_end: e,
    qualifiers: { entity_type: 'organization' },
  };
};

/**
 * The shipment upload.
 *
 * The eight-claim bound forces a CHOICE of which row to read, so the choice is a
 * stated rule rather than an accident of ordering: the loaded shipment nearest to
 * arriving — the earliest ETA — because that is the one a corridor decision turns
 * on first.
 *
 * THE POSITION IS QUOTED AS THE MANIFEST WRITES IT — "Suez", not "Suez Canal".
 * That is the point: a shipping manifest does not print the publisher's
 * identifiers or the publisher's spelling, so this mention CANNOT resolve
 * automatically. It reaches the resolution queue, and a person who knows the
 * domain says which corridor it means.
 */
function shipmentClaims(rows, excerpt) {
  const candidates = rows
    .filter((r) => (r.vessel ?? '') !== 'not yet loaded'
      && CORRIDOR_WORDS.some((w) => (r.position_at_window_open ?? '').includes(w)))
    .sort((a, b) => String(a.eta_rotterdam ?? '').localeCompare(String(b.eta_rotterdam ?? '')));
  const inTransit = candidates[0];
  if (inTransit === undefined) return null;
  const word = CORRIDOR_WORDS.find((w) => inTransit.position_at_window_open.includes(w));
  const [ss, se] = spanIn(excerpt, inTransit.shipment_id);
  const [cs, ce] = spanIn(excerpt, inTransit.component_id);
  const [vs, ve] = spanIn(excerpt, inTransit.vessel);
  const [ps, pe] = spanIn(excerpt, word);
  /*
   * THE CHAIN, NOT A HANDFUL OF NODES.
   *
   * Eight claims is the bound, so they are spent on the links that make the
   * corridor reach the manufacturer: chokepoint ← vessel → shipment → component
   * ← manufacturer. The manufacturer's own entity claim is made by the INVENTORY
   * record instead, which names it too — an entity is a governed identity, so it
   * only has to be named once for every mention of it to resolve to it.
   */
  const claims = [
    { claim_kind: 'entity', subject: inTransit.component_id, predicate: 'is_a',
      object_value: 'component', confidence: 0.93, byte_start: cs, byte_end: ce,
      qualifiers: { entity_type: 'product' } },
    { claim_kind: 'entity', subject: inTransit.shipment_id, predicate: 'is_a',
      object_value: 'shipment', confidence: 0.93, byte_start: ss, byte_end: se,
      qualifiers: { entity_type: 'asset' } },
    { claim_kind: 'entity', subject: inTransit.vessel, predicate: 'is_a',
      object_value: 'vessel', confidence: 0.91, byte_start: vs, byte_end: ve,
      qualifiers: { entity_type: 'vessel' } },
    { claim_kind: 'entity', subject: word, predicate: 'is_a',
      object_value: 'maritime chokepoint', confidence: 0.7, byte_start: ps, byte_end: pe,
      qualifiers: { entity_type: 'place' } },
    // A relationship's span covers BOTH ends, whichever order they appear in the
    // record. A span that ran backwards would be refused by the extraction
    // contract, correctly — byte offsets are a claim about the bytes, not a hint.
    { claim_kind: 'relationship', subject: inTransit.vessel, predicate: 'carries',
      object_value: inTransit.shipment_id, confidence: 0.9,
      byte_start: Math.min(vs, ss), byte_end: Math.max(ve, se),
      qualifiers: { valid_from: '2024-01-01T00:00:00Z' } },
    { claim_kind: 'relationship', subject: inTransit.shipment_id, predicate: 'carries',
      object_value: inTransit.component_id, confidence: 0.91,
      byte_start: Math.min(ss, cs), byte_end: Math.max(se, ce),
      qualifiers: { valid_from: '2024-01-01T00:00:00Z' } },
    { claim_kind: 'relationship', subject: MANUFACTURER, predicate: 'depends_on',
      object_value: inTransit.component_id, confidence: 0.88, byte_start: cs, byte_end: ce,
      qualifiers: { valid_from: '2024-01-01T00:00:00Z' } },
    { claim_kind: 'relationship', subject: inTransit.vessel, predicate: 'transits',
      object_value: word, confidence: 0.78,
      byte_start: Math.min(vs, ps), byte_end: Math.max(ve, pe),
      qualifiers: { valid_from: '2024-01-12T00:00:00Z' } },
  ];
  return { claims: claims.slice(0, MAX_CLAIMS) };
}

/**
 * The inventory upload.
 *
 * The row whose on-hand figure is the planted formula-risk cell is SKIPPED, not
 * read: Phase 1 preserved and classified that cell without evaluating it, and an
 * extraction that quietly turned `=SUM(D2:D5)` into a number would undo the one
 * thing that record exists to demonstrate.
 */
function inventoryClaims(rows, excerpt) {
  const clean = rows.filter((r) => /^[0-9.]+$/.test(String(r.on_hand ?? '')));
  if (clean.length === 0) return null;
  const claims = [ORG_CLAIM(excerpt)];
  const seen = new Set();
  for (const r of clean) {
    if (seen.has(r.component_id) || claims.length >= MAX_CLAIMS - 1) continue;
    seen.add(r.component_id);
    const [cs, ce] = spanIn(excerpt, r.component_id);
    claims.push({
      claim_kind: 'entity', subject: r.component_id, predicate: 'is_a',
      object_value: 'component', confidence: 0.92, byte_start: cs, byte_end: ce,
      qualifiers: { entity_type: 'product' },
    });
  }
  const first = clean[0];
  const [fs, fe] = spanIn(excerpt, first.component_id);
  claims.push({
    claim_kind: 'relationship', subject: MANUFACTURER, predicate: 'stocks',
    object_value: first.component_id, confidence: 0.85, byte_start: fs, byte_end: fe,
    qualifiers: { valid_from: '2024-01-01T00:00:00Z' },
  });
  return { claims: claims.slice(0, MAX_CLAIMS) };
}

const ABSTAIN = {
  abstain: true,
  reason: 'this record states no shipment, component or vessel this method can name; '
    + 'guessing one would be worse than saying so',
};

/** What this method makes of ONE preserved upload. */
export function responseFor(excerpt) {
  const rows = csvRows(excerpt);
  if (rows === null) return ABSTAIN;
  if ('shipment_id' in rows[0]) return shipmentClaims(rows, excerpt) ?? ABSTAIN;
  if ('on_hand' in rows[0]) return inventoryClaims(rows, excerpt) ?? ABSTAIN;
  return ABSTAIN;
}

export function buildFixtures(units) {
  const out = [];
  for (const u of units) {
    const req = {
      promptRef: SUPPLY_METHOD.promptRef,
      promptVersion: SUPPLY_METHOD.promptVersion,
      promptDigest: SUPPLY_METHOD.promptDigest,
      modelId: SUPPLY_METHOD.modelId,
      weightsDigest: SUPPLY_METHOD.modelWeightsDigest,
      runtimeVersion: SUPPLY_METHOD.runtimeVersion,
      decodingDigest: SUPPLY_METHOD.decodingDigest,
      input: {
        instruction: SUPPLY_METHOD.promptRef,
        target_types: SUPPLY_METHOD.targetTypes,
        source_key: SUPPLY_METHOD.methodKey,
        item_key: u.itemKey,
        evidence_digest: u.contentDigest,
        evidence: u.excerpt,
      },
    };
    out.push({
      request_digest: requestDigest(req),
      response: responseFor(u.excerpt),
      model_id: req.modelId, runtime_version: req.runtimeVersion,
    });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'method.json'), `${JSON.stringify(SUPPLY_METHOD, null, 2)}\n`);
  console.log(`supply-chain method pinned:
  model            ${SUPPLY_METHOD.modelId}
  weights digest   ${SUPPLY_METHOD.modelWeightsDigest}
  runtime          ${SUPPLY_METHOD.runtimeVersion}
  prompt           ${SUPPLY_METHOD.promptRef}@${SUPPLY_METHOD.promptVersion} (${SUPPLY_METHOD.promptDigest.slice(0, 16)}…)
  decoding digest  ${SUPPLY_METHOD.decodingDigest}
written to ${join(OUT, 'method.json')}`);
}
