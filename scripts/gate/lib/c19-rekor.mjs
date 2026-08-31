/**
 * C19 — REKOR ENTRY → SIGSTORE BUNDLE.
 *
 * Recovery has to turn what the Rekor API returns into what a verifier consumes, and those are not
 * the same object. The previous "recovery" wrote the raw API response to `<bundle>.recovered.json`
 * and returned, while every later step expected a bundle at `<bundle>`. It could not have worked,
 * and nothing executed it, so nothing said so.
 *
 * ── THE FIELDS GENUINELY DIFFER ──
 *
 *   Rekor API                          Sigstore bundle
 *   ─────────────────────────────      ─────────────────────────────────────
 *   body            (base64 JSON)      verificationMaterial.tlogEntries[].canonicalizedBody
 *   logID           (HEX string)       logId.keyId (BASE64 of those bytes)
 *   verification.signedEntryTimestamp  inclusionPromise.signedEntryTimestamp
 *   verification.inclusionProof        inclusionProof
 *     .hashes       (HEX array)          .hashes (BASE64 array)
 *     .rootHash     (HEX)                .rootHash (BASE64)
 *     .checkpoint   (string)             .checkpoint.envelope
 *   body.spec.signature.content        messageSignature.signature
 *   body.spec.signature.publicKey      verificationMaterial.certificate.rawBytes
 *     .content (base64 PEM)              (base64 DER)
 *   body.spec.data.hash.value (hex)    messageSignature.messageDigest.digest (base64)
 *
 * Every one of those is a place a plausible-looking conversion silently produces something that
 * fails verification for the wrong reason — or worse, passes a weaker check.
 */

import { createHash } from 'node:crypto';
import { pemToDer } from './c19-der.mjs';

const j = (v) => JSON.stringify(v);
const hexToB64 = (hex) => Buffer.from(String(hex), 'hex').toString('base64');

/** The media type this gate standardises on. One format, stated once, used by signing and verifying. */
export const BUNDLE_MEDIA_TYPE = 'application/vnd.dev.sigstore.bundle.v0.3+json';

/**
 * Convert one Rekor API entry into a Sigstore bundle.
 *
 * `entry` is the value side of the API's `{uuid: entry}` map. Anything missing or malformed raises
 * with the field named, because a partially converted bundle that verifies is worse than one that
 * does not.
 */
export function rekorEntryToBundle(entry) {
  const need = (v, name) => {
    if (v === undefined || v === null || v === '') {
      throw new Error(`c19-rekor: the entry has no ${name}; a bundle cannot be reconstructed from it`);
    }
    return v;
  };

  const bodyB64 = need(entry.body, 'body');
  let body;
  try { body = JSON.parse(Buffer.from(String(bodyB64), 'base64').toString('utf8')); } catch {
    throw new Error('c19-rekor: the entry body is not base64-encoded JSON');
  }
  if (body.kind !== 'hashedrekord') {
    throw new Error(`c19-rekor: entry kind ${j(body.kind)} is not the hashedrekord this gate publishes`);
  }
  const spec = need(body.spec, 'spec');
  const digestHex = need(spec?.data?.hash?.value, 'spec.data.hash.value');
  const sigB64 = need(spec?.signature?.content, 'spec.signature.content');
  const certPemB64 = need(spec?.signature?.publicKey?.content, 'spec.signature.publicKey.content');

  // The logged public key is a PEM certificate; a bundle carries its DER bytes.
  let certDer;
  try { certDer = pemToDer(Buffer.from(String(certPemB64), 'base64').toString('utf8')); } catch (e) {
    throw new Error(`c19-rekor: the logged certificate is not a readable PEM (${e.message})`);
  }

  const verification = need(entry.verification, 'verification');
  const set = need(verification.signedEntryTimestamp, 'verification.signedEntryTimestamp');
  const proof = need(verification.inclusionProof, 'verification.inclusionProof');

  // logID is HEX in the API and BASE64 in the bundle. Passing the hex string through unchanged
  // produces a key id that matches nothing, and the failure looks like an unknown log.
  const logIdHex = need(entry.logID, 'logID');
  if (!/^[0-9a-f]+$/i.test(String(logIdHex))) {
    throw new Error(`c19-rekor: logID ${j(logIdHex)} is not hexadecimal as the API defines it`);
  }

  const hashes = need(proof.hashes, 'inclusionProof.hashes');
  if (!Array.isArray(hashes)) throw new Error('c19-rekor: inclusionProof.hashes is not an array');
  for (const h of hashes) {
    if (!/^[0-9a-f]{64}$/i.test(String(h))) {
      throw new Error(`c19-rekor: audit path node ${j(h)} is not a hex sha-256 digest`);
    }
  }

  return {
    mediaType: BUNDLE_MEDIA_TYPE,
    verificationMaterial: {
      certificate: { rawBytes: certDer.toString('base64') },
      tlogEntries: [{
        logIndex: String(need(entry.logIndex, 'logIndex')),
        logId: { keyId: hexToB64(logIdHex) },
        kindVersion: { kind: body.kind, version: body.apiVersion ?? '0.0.1' },
        integratedTime: String(need(entry.integratedTime, 'integratedTime')),
        inclusionPromise: { signedEntryTimestamp: set },
        inclusionProof: {
          logIndex: String(need(proof.logIndex, 'inclusionProof.logIndex')),
          rootHash: hexToB64(need(proof.rootHash, 'inclusionProof.rootHash')),
          treeSize: String(need(proof.treeSize, 'inclusionProof.treeSize')),
          hashes: hashes.map(hexToB64),
          checkpoint: { envelope: need(proof.checkpoint, 'inclusionProof.checkpoint') },
        },
        canonicalizedBody: bodyB64,
      }],
    },
    messageSignature: {
      messageDigest: { algorithm: 'SHA2_256', digest: hexToB64(digestHex) },
      signature: sigB64,
    },
    // NOTHING outside the Sigstore schema. `_recoveredFromUuid` was added here and is rejected by
    // strict cosign parsing — the reconstructed bundle would have failed the very verification it
    // exists for. Recovery provenance is written beside the bundle, never inside it.
  };
}

/**
 * Does this reconstructed bundle actually describe the payload we are publishing?
 *
 * Reconstruction is not verification. This is the cheap structural check before the real verifiers
 * run, so a mismatched entry is rejected with a reason rather than failing opaquely later.
 */
export function bundleMatchesPayload(bundle, payloadBytes) {
  const problems = [];
  const want = createHash('sha256').update(payloadBytes).digest('hex');
  const got = Buffer.from(String(bundle?.messageSignature?.messageDigest?.digest ?? ''), 'base64')
    .toString('hex');
  if (got !== want) {
    problems.push(`c19-rekor: the recovered entry attests ${got || '(nothing)'} but the payload `
      + `hashes to ${want}; this record is not about these bytes`);
  }
  return problems;
}
