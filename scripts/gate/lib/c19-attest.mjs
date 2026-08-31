/**
 * C19 — THE PROVIDER-NEUTRAL ATTESTATION CONTRACT.
 *
 * C18's verifier recomputes every claim from the delivered bytes, which is its strength and its
 * ceiling: the evidence producer is its own sole authority. An adversary who rebinds every
 * attacker-controlled binding consistently produces an archive that is internally perfect. C19
 * introduces a trust root the producer does not control and binds the facts C18 cannot prove to
 * statements that root makes.
 *
 * ── THE CONTRACT IS PROVIDER-NEUTRAL ──
 *
 * A signer adapter acquires a signature; this module verifies one. The envelope carries a canonical
 * payload, a signature, a signer id and a key version, and nothing else about how it was obtained.
 * Adding a provider never changes what a verifier checks.
 *
 * ── WHAT IS VERIFIED, AND OVER WHICH BYTES ──
 *
 * Signatures are verified over the CANONICAL PAYLOAD BYTES (RFC 8785 JCS, the same canonicalisation
 * the audit chain already uses), never over a reparsed projection of attacker-controlled JSON. The
 * envelope's own `payloadDigest` is recomputed rather than trusted: an envelope that disagrees with
 * its payload is a finding, not a hint.
 *
 * Every signature context is domain-separated as `eye/c19/<purpose>/v1`, so a signature made for one
 * purpose can never be replayed as another.
 *
 * ── INDEPENDENCE IS ENFORCED, NOT ASSERTED ──
 *
 * The registry marks each signer `deliveryCapable`. The `local-dev` signer exists so hermetic
 * controls can exercise the whole path without a network or an OIDC identity, and it is
 * `deliveryCapable: false`. Delivery-standing verification refuses it by construction. A signer
 * controlled by the evidence process is not independent, and treating one as independent would be
 * the single worst thing this gate could do — so the refusal is a rule here, not a convention.
 */

import { createHash, createPublicKey, createVerify, verify as verifyOneShot, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256Hex = (b) => createHash('sha256').update(b).digest('hex');
const j = (v) => JSON.stringify(v);

/**
 * ── WHY THIS FILE EXISTS AGAIN ──
 *
 * It was deleted mid-pass as "dead code" when the implementation pivoted to signing the evidence
 * ZIP directly with cosign. That pivot quietly abandoned the frozen C19 design: signing an archive
 * proves only that the archive existed, and carries no purpose, no domain separation, no nonce, no
 * validity window, and no binding to the source run, the finalizer run, or the tree the evidence
 * came from. Every one of those was a stated requirement, and none of them survives in a bare
 * signature over a ZIP.
 *
 * So the signed object is a CANONICAL PAYLOAD that binds all of it, and cosign signs THAT payload's
 * bytes. The evidence archive is bound by digest from inside the payload rather than being the
 * signed object itself.
 */

/** The closed set of purposes. An unknown purpose is a rejection, never a pass-through. */
export const C19_PURPOSES = Object.freeze([
  'run-anchor',          // binds a hosted run, its source tree and the evidence archive
  'identifier-binding',  // binds backend-assigned identifiers to that run
  'secret-commitment',   // binds a per-instance secret to its instance, without revealing it
  'isolation-policy',    // binds the effective child-isolation policy actually enforced
]);

/** Domain separation. One purpose, one context string, no overlap. */
export const domainContext = (purpose) => `eye/c19/${purpose}/v1`;

/**
 * ── THE PAYLOAD IS DETERMINISTIC, AND THAT IS WHAT MAKES RECOVERY POSSIBLE ──
 *
 * The first version put the signer's own run id, a wall-clock `issuedAt` and a RANDOM nonce into
 * the signed payload. Every retry therefore produced different bytes, a different digest, and a
 * Rekor search that could not possibly find the entry the previous attempt had already published.
 * "Idempotent recovery" was impossible by construction: the thing being searched for never had the
 * same name twice.
 *
 * The signed payload now depends ONLY on the publication identity — which source run, which
 * finalizer run, which artifact — so any attempt at publishing that identity produces byte-identical
 * bytes and finds its own prior entry.
 *
 * The signer's own run is not lost: it is bound by the FULCIO CERTIFICATE's run invocation URI,
 * which is where the identity of the signer belongs. Duplicating it inside the signed payload is
 * what made the payload unstable, and it added nothing the certificate did not already prove.
 */
export const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  // identity of the statement itself
  'schema', 'version', 'purpose', 'context',
  // what source produced the evidence
  'sourceSha', 'sourceTree',
  // the UPSTREAM run that produced it
  'sourceRunId', 'sourceRunAttempt', 'sourceEvent',
  // the FINALIZER run that produced the delivered artifact
  'finalizerRunId', 'finalizerRunAttempt',
  // which workflow configuration is authorised to sign this
  'workflowRef', 'workflowDigest',
  // what is being attested — both the wrapper and the finalized inner artifact
  'evidenceArtifactId', 'evidenceArtifactName', 'evidenceDigest',
  'finalizedInnerName', 'finalizedInnerDigest',
  // replay and validity, both DERIVED from the publication identity rather than from the clock
  'nonce', 'issuedAt', 'notBefore', 'expiresAt',
  // who signed it and how
  'signerId', 'keyVersion', 'algorithm',
]);

/**
 * The bindings that DEFINE a publication. Two attempts that agree on all of these are the same
 * publication and must produce the same bytes; a change to any of them is a different publication.
 */
export const PUBLICATION_IDENTITY_FIELDS = Object.freeze([
  'sourceSha', 'sourceTree', 'sourceRunId', 'sourceRunAttempt', 'sourceEvent',
  'finalizerRunId', 'finalizerRunAttempt',
  'evidenceArtifactId', 'evidenceDigest', 'finalizedInnerDigest',
  'workflowRef', 'workflowDigest',
]);

/**
 * The stable identity of one publication, and the nonce derived from it.
 *
 * A random nonce would defeat the whole mechanism. This nonce is still a nonce in the sense that
 * matters — it is unique per publication and domain-separated — but it is REPRODUCIBLE, so the
 * retry of a crashed run computes the same one.
 */
export function publicationIdentity(facts) {
  const missing = PUBLICATION_IDENTITY_FIELDS.filter((f) => facts[f] === undefined || facts[f] === '');
  if (missing.length > 0) {
    throw new Error(`c19: publication identity is missing ${missing.join(', ')}`);
  }
  const core = Object.fromEntries(PUBLICATION_IDENTITY_FIELDS.map((f) => [f, String(facts[f])]));
  return createHash('sha256')
    .update('eye/c19/publication-identity/v1\n')
    .update(canonicalize(core))
    .digest('hex');
}

/**
 * Bindings that are recorded when the producer knows them. They are not universally required — a
 * payload for a purpose that has no transaction has nothing honest to say about one — but when
 * present they are verified exactly.
 */
export const OPTIONAL_PAYLOAD_BINDINGS = Object.freeze([
  'pathBinding', 'instanceBinding', 'transactionBinding', 'correlationBinding',
]);

/**
 * RFC 8785 JCS canonicalisation, restricted to the JSON this contract admits.
 *
 * Signing a canonical form is the whole point: two encodings of the same object must produce the
 * same bytes, or a signature proves nothing about the object. Reusing the audit chain's
 * canonicaliser would be ideal, but it lives behind the C18 boundary this pass must not disturb, so
 * the same algorithm is implemented here over the closed value space these payloads use.
 */
export function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('c19: a non-finite number cannot be canonicalised');
    if (!Number.isInteger(value)) throw new Error('c19: only integers are admitted in a payload');
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    // JCS orders members by their UTF-16 code units, which is what `Array#sort` does by default.
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  throw new Error(`c19: ${typeof value} cannot be canonicalised`);
}

/** The tracked source artifact: pinned signers, key versions, algorithms and revocations. */
export function loadTrustRegistry(libDir) {
  const raw = JSON.parse(readFileSync(join(libDir, 'c19-trust.json'), 'utf8'));
  if (raw.schema !== 'eye/c19/trust-registry' || raw.version !== 1) {
    throw new Error('c19-trust.json is not a version-1 trust registry');
  }
  for (const [id, signer] of Object.entries(raw.signers ?? {})) {
    if (typeof signer.deliveryCapable !== 'boolean') {
      throw new Error(`c19-trust.json signer ${j(id)} does not declare deliveryCapable`);
    }
  }
  return raw;
}

/**
 * Build a canonical payload. The caller supplies the facts; this fixes the shape, the context and
 * the ordering, so a payload cannot be assembled in a way a verifier would read differently.
 */
export function buildPayload(purpose, facts) {
  if (!C19_PURPOSES.includes(purpose)) throw new Error(`c19: unknown purpose ${j(purpose)}`);
  const payload = {
    schema: 'eye/c19/payload',
    version: 2,
    purpose,
    context: domainContext(purpose),
    ...facts,
  };
  const missing = REQUIRED_PAYLOAD_FIELDS.filter((f) => payload[f] === undefined);
  if (missing.length > 0) {
    throw new Error(`c19: payload for ${purpose} is missing ${missing.join(', ')}`);
  }
  return payload;
}

/**
 * Judge ONE envelope. Returns findings; an empty array means every checked claim held.
 *
 * `now` is injected so controls can exercise expiry deterministically. `seenNonces` is the replay
 * cache: a nonce already recorded for this purpose is a replay, whatever else is valid.
 */
export function verifyEnvelope({
  envelope, registry, expected, now = Date.now(), seenNonces = new Set(), requireDeliveryCapable = false,
}) {
  const problems = [];
  const fail = (m) => { problems.push(`c19 attestation: ${m}`); return problems; };

  if (envelope === null || typeof envelope !== 'object') return fail('is not an object');
  if (envelope.schema !== 'eye/c19/envelope' || envelope.version !== 1) {
    return fail(`declares ${j(envelope.schema)} v${j(envelope.version)}; this verifier reads `
      + 'eye/c19/envelope v1 and refuses an unknown version rather than guessing');
  }
  if (typeof envelope.payload !== 'string') return fail('carries no canonical payload string');

  // ── the payload must parse AND re-canonicalise to exactly the signed bytes ──────
  let payload;
  try { payload = JSON.parse(envelope.payload); } catch { return fail('payload is not JSON'); }
  let recanonical;
  try { recanonical = canonicalize(payload); } catch (e) { return fail(`payload ${e.message}`); }
  if (recanonical !== envelope.payload) {
    problems.push('c19 attestation: the payload is not canonical; a signature over a noncanonical '
      + 'encoding proves nothing about the object it claims to describe');
  }
  // The envelope's own digest is RECOMPUTED. Trusting it would let an attacker choose what the
  // verifier thinks it checked.
  const digest = sha256Hex(Buffer.from(envelope.payload, 'utf8'));
  if (envelope.payloadDigest !== digest) {
    problems.push('c19 attestation: the envelope payloadDigest disagrees with the payload itself');
  }

  // ── purpose, context and required fields ───────────────────────────────────────
  if (!C19_PURPOSES.includes(payload.purpose)) {
    problems.push(`c19 attestation: purpose ${j(payload.purpose)} is not one this gate issues`);
  } else if (payload.context !== domainContext(payload.purpose)) {
    problems.push(`c19 attestation: context ${j(payload.context)} does not domain-separate `
      + `purpose ${j(payload.purpose)}; a signature for one purpose must not verify as another`);
  }
  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (payload[field] === undefined) problems.push(`c19 attestation: payload omits ${j(field)}`);
  }

  // ── the signer, its key version, its algorithm and its revocation state ────────
  const signer = registry?.signers?.[payload.signerId];
  if (signer === undefined) {
    problems.push(`c19 attestation: signer ${j(payload.signerId)} is not in the trust registry`);
  } else {
    if (requireDeliveryCapable && signer.deliveryCapable !== true) {
      problems.push(`c19 attestation: signer ${j(payload.signerId)} is NOT delivery-capable; a `
        + 'signer the evidence process controls cannot establish delivery standing');
    }
    if (signer.keys?.[payload.keyVersion] === undefined) {
      problems.push(`c19 attestation: signer ${j(payload.signerId)} has no key version `
        + `${j(payload.keyVersion)} in the registry`);
    }
  }
  if (!(registry?.algorithms ?? []).includes(payload.algorithm)) {
    problems.push(`c19 attestation: algorithm ${j(payload.algorithm)} is not allowlisted`);
  }
  const revoked = (registry?.revoked ?? []).some((r) => r.signerId === payload.signerId
    && (r.keyVersion === undefined || r.keyVersion === payload.keyVersion)
    && (r.jti === undefined || r.jti === payload.nonce));
  if (revoked) {
    problems.push(`c19 attestation: signer ${j(payload.signerId)} key ${j(payload.keyVersion)} is `
      + 'revoked; a revoked key fails closed');
  }

  // ── freshness, with the uncertainty kept explicit ──────────────────────────────
  const at = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
  const nbf = at(payload.notBefore);
  const exp = at(payload.expiresAt);
  const iat = at(payload.issuedAt);
  if (!Number.isFinite(iat) || !Number.isFinite(nbf) || !Number.isFinite(exp)) {
    problems.push('c19 attestation: issuedAt, notBefore and expiresAt must all be instants');
  } else {
    if (now < nbf) problems.push('c19 attestation: presented before its notBefore');
    if (now > exp) problems.push('c19 attestation: has expired');
    if (exp <= nbf) problems.push('c19 attestation: expires no later than it becomes valid');
  }

  // ── replay ─────────────────────────────────────────────────────────────────────
  const replayKey = `${payload.purpose}:${payload.nonce}`;
  if (seenNonces.has(replayKey)) {
    problems.push(`c19 attestation: nonce ${j(payload.nonce)} was already presented for purpose `
      + `${j(payload.purpose)}; this is a replay`);
  }

  // ── binding: the statement must be ABOUT the thing being verified ─────────────
  for (const [field, want] of Object.entries(expected ?? {})) {
    if (want === undefined || want === null) continue;
    if (payload[field] !== want) {
      problems.push(`c19 attestation: ${field} is ${j(payload[field])}; this verification is `
        + `about ${j(want)}`);
    }
  }

  return problems;
}

/**
 * Record a nonce as seen. Kept separate from verification so a verifier can judge an envelope
 * without mutating the cache, and so the replay control can prove the cache is what rejects.
 */
export const rememberNonce = (seenNonces, payload) => seenNonces.add(`${payload.purpose}:${payload.nonce}`);

/**
 * Verify a raw signature over the canonical payload bytes for a registered key.
 *
 * `RS256` and `ES256` are the allowlisted algorithms; anything else is refused before any
 * cryptographic operation, so an attacker cannot choose a weaker primitive.
 */
export function verifySignatureBytes({ payloadBytes, signatureB64, publicKeyPem, algorithm }) {
  if (algorithm !== 'RS256' && algorithm !== 'ES256') {
    return [`c19 attestation: algorithm ${j(algorithm)} is not one this verifier will attempt`];
  }
  let key;
  try { key = createPublicKey(publicKeyPem); } catch (e) { return [`c19 attestation: unusable public key (${e.message})`]; }
  const signature = Buffer.from(signatureB64, 'base64');
  let ok = false;
  try {
    if (algorithm === 'RS256') {
      const v = createVerify('RSA-SHA256');
      v.update(payloadBytes);
      v.end();
      ok = v.verify(key, signature);
    } else {
      ok = verifyOneShot('sha256', payloadBytes, { key, dsaEncoding: 'der' }, signature);
    }
  } catch (e) {
    return [`c19 attestation: signature could not be checked (${e.message})`];
  }
  return ok ? [] : ['c19 attestation: the signature does not verify over the canonical payload bytes'];
}

/**
 * Verify a Sigstore certificate chain offline against the PINNED Fulcio roots.
 *
 * Only the pinned chain is trusted: a certificate that validates against some other CA is not a
 * Sigstore certificate for this gate's purposes. The leaf's identity extensions are checked by the
 * caller, which knows which workflow identity it expects.
 */
export function verifyCertificateChain({ leafPem, chainPem }) {
  const problems = [];
  let leaf;
  try { leaf = new X509Certificate(leafPem); } catch (e) { return [`c19 attestation: unusable leaf certificate (${e.message})`]; }
  const anchors = (chainPem ?? []).map((pem) => {
    try { return new X509Certificate(pem); } catch { return null; }
  }).filter((c) => c !== null);
  if (anchors.length === 0) return ['c19 attestation: the registry pins no Fulcio chain to verify against'];

  // The leaf must be issued by one pinned anchor, and that anchor must verify it.
  const issuer = anchors.find((a) => leaf.checkIssued(a) && leaf.verify(a.publicKey));
  if (issuer === undefined) {
    problems.push('c19 attestation: the leaf certificate does not chain to a pinned Fulcio anchor');
  }
  return problems;
}

/** The identity a Fulcio leaf asserts, as the verifier reads it. Never trusted from the envelope. */
export function certificateIdentity(leafPem) {
  const leaf = new X509Certificate(leafPem);
  return { subjectAltName: leaf.subjectAltName ?? null, issuer: leaf.issuer, validTo: leaf.validTo };
}

export { sha256Hex };
