/**
 * C19 — THE ANCHOR VERIFICATION ADAPTER.
 *
 * Everything here runs OFFLINE. A verifier that reaches the network to decide whether to trust
 * something has made the network part of its trust base, and a foreign checkout on an air-gapped
 * machine must reach the same verdict as this one. So the trust material is source-owned and
 * TUF-authenticated, and this module performs no I/O beyond reading the files it is handed.
 *
 * ── WHAT IS CHECKED, IN THE ORDER IT MATTERS ──
 *
 *   1. the leaf certificate chains to a PINNED Fulcio CA, and was valid when it signed;
 *   2. its identity extensions match the declared signer EXACTLY;
 *   3. the signature verifies over the artifact digest with that certificate's key;
 *   4. the Rekor entry's signed timestamp verifies against a PINNED log key;
 *   5. the inclusion proof reconstructs the checkpoint root hash.
 *
 * Each is necessary. A chain without identity accepts any GitHub workflow. Identity without a
 * signature accepts a certificate that signed nothing. A signature without Rekor accepts one that
 * was never published and can be produced and discarded at will. Rekor without an inclusion proof
 * accepts the log's word for its own contents.
 *
 * ── WHAT THIS DOES NOT PROVE ──
 *
 * That any claim INSIDE the signed bytes is true. See `c19-authority.mjs`: this establishes who
 * signed, what they signed and that it was published — nothing about whether the content is
 * accurate. Closing an observational limit requires an authority for the claim, not a better
 * signature around it.
 */

import { createHash, createPublicKey, verify as verifyOneShot, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { certificateExtensions, extensionString } from './c19-der.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest();
const j = (v) => JSON.stringify(v);

/**
 * Fulcio's GitHub Actions identity extensions. The SUBJECT of these certificates is empty — the
 * identity lives entirely here, which is why reading them correctly is the whole of step 2.
 */
export const FULCIO_OIDS = Object.freeze({
  issuerV2: '1.3.6.1.4.1.57264.1.8',
  buildSignerUri: '1.3.6.1.4.1.57264.1.9',
  buildSignerDigest: '1.3.6.1.4.1.57264.1.10',
  runnerEnvironment: '1.3.6.1.4.1.57264.1.11',
  sourceRepositoryUri: '1.3.6.1.4.1.57264.1.12',
  sourceRepositoryDigest: '1.3.6.1.4.1.57264.1.13',
  sourceRepositoryRef: '1.3.6.1.4.1.57264.1.14',
  sourceRepositoryIdentifier: '1.3.6.1.4.1.57264.1.15',
  sourceRepositoryOwnerUri: '1.3.6.1.4.1.57264.1.16',
  sourceRepositoryOwnerIdentifier: '1.3.6.1.4.1.57264.1.17',
  buildConfigUri: '1.3.6.1.4.1.57264.1.18',
  buildConfigDigest: '1.3.6.1.4.1.57264.1.19',
  buildTrigger: '1.3.6.1.4.1.57264.1.20',
  runInvocationUri: '1.3.6.1.4.1.57264.1.21',
  issuerV1: '1.3.6.1.4.1.57264.1.1',
});

/** The source-owned, TUF-authenticated trust material and the exact identity policy. */
export function loadTrustMaterial(libDir) {
  const policy = JSON.parse(readFileSync(join(libDir, 'c19-trust.json'), 'utf8'));
  if (policy.schema !== 'eye/c19/trust-policy' || policy.version !== 2) {
    throw new Error('c19-trust.json is not a version-2 trust policy');
  }
  const trustedRootBytes = readFileSync(join(libDir, policy.tuf.trustedRootFile));
  const actual = sha256(trustedRootBytes).toString('hex');
  if (actual !== policy.tuf.trustedRootSha256) {
    throw new Error('c19: the Sigstore trusted root does not match the digest the TUF targets '
      + `metadata declared (${actual} vs ${policy.tuf.trustedRootSha256}); the trust material has `
      + 'been substituted');
  }
  return { policy, trustedRoot: JSON.parse(trustedRootBytes.toString('utf8')) };
}

/** Every Fulcio CA certificate the trusted root pins, newest first. */
export const pinnedCaCertificates = (trustedRoot) => (trustedRoot.certificateAuthorities ?? [])
  .flatMap((ca) => (ca.certChain?.certificates ?? []).map((c) => Buffer.from(c.rawBytes, 'base64')));

/** Every Rekor log key the trusted root pins, by log id. */
export function pinnedRekorKeys(trustedRoot) {
  const out = new Map();
  for (const l of trustedRoot.tlogs ?? []) {
    const keyId = l.logId?.keyId;
    const der = l.publicKey?.rawBytes;
    if (typeof keyId === 'string' && typeof der === 'string') {
      out.set(Buffer.from(keyId, 'base64').toString('hex'),
        { der: Buffer.from(der, 'base64'), baseUrl: l.baseUrl, validFor: l.publicKey?.validFor });
    }
  }
  return out;
}

/** The identity a Fulcio leaf asserts, read from its extensions rather than taken on trust. */
export function certificateIdentity(leafDer) {
  const exts = certificateExtensions(leafDer);
  const get = (oid) => extensionString(exts.get(oid));
  const cert = new X509Certificate(leafDer);
  return {
    subjectAlternativeName: (cert.subjectAltName ?? '').replace(/^URI:/, ''),
    issuer: get(FULCIO_OIDS.issuerV2) ?? get(FULCIO_OIDS.issuerV1),
    sourceRepositoryUri: get(FULCIO_OIDS.sourceRepositoryUri),
    sourceRepositoryDigest: get(FULCIO_OIDS.sourceRepositoryDigest),
    sourceRepositoryRef: get(FULCIO_OIDS.sourceRepositoryRef),
    sourceRepositoryIdentifier: get(FULCIO_OIDS.sourceRepositoryIdentifier),
    sourceRepositoryOwnerUri: get(FULCIO_OIDS.sourceRepositoryOwnerUri),
    sourceRepositoryOwnerIdentifier: get(FULCIO_OIDS.sourceRepositoryOwnerIdentifier),
    buildConfigUri: get(FULCIO_OIDS.buildConfigUri),
    buildConfigDigest: get(FULCIO_OIDS.buildConfigDigest),
    buildSignerUri: get(FULCIO_OIDS.buildSignerUri),
    buildTrigger: get(FULCIO_OIDS.buildTrigger),
    runInvocationUri: get(FULCIO_OIDS.runInvocationUri),
    runnerEnvironment: get(FULCIO_OIDS.runnerEnvironment),
    validFrom: cert.validFrom,
    validTo: cert.validTo,
  };
}

/**
 * EXACT identity matching. Not pattern matching.
 *
 * A regular expression is how a verifier ends up trusting a workflow it never meant to: one `.*`
 * in the wrong position accepts any branch, any workflow file, or any fork of the repository. Every
 * field below has a single correct value, so there is nothing here to widen and no place for a
 * pattern to hide.
 */
export function verifyIdentity(identity, policy, { sourceSha, expectedRunUri, workflowDigest } = {}) {
  const problems = [];
  const want = policy.identity;
  const exact = (field, got, expected) => {
    if (expected === undefined || expected === null) return;
    if (got !== expected) {
      problems.push(`c19 identity: ${field} is ${j(got)}; delivery standing requires exactly ${j(expected)}`);
    }
  };
  exact('subjectAlternativeName', identity.subjectAlternativeName, want.subjectAlternativeName);
  exact('issuer', identity.issuer, want.issuer);
  exact('sourceRepositoryUri', identity.sourceRepositoryUri, `https://github.com/${want.repository}`);
  exact('sourceRepositoryRef', identity.sourceRepositoryRef, want.ref);
  exact('sourceRepositoryOwnerUri', identity.sourceRepositoryOwnerUri, `https://github.com/${want.repositoryOwner}`);
  exact('buildConfigUri', identity.buildConfigUri, `https://github.com/${want.workflowRef}`);
  exact('buildTrigger', identity.buildTrigger, want.eventName);
  exact('runnerEnvironment', identity.runnerEnvironment, want.runnerEnvironment);
  // The commit the evidence claims and the commit the certificate attests must be the same commit.
  exact('sourceRepositoryDigest', identity.sourceRepositoryDigest, sourceSha);
  exact('buildConfigDigest', identity.buildConfigDigest, workflowDigest);
  exact('runInvocationUri', identity.runInvocationUri, expectedRunUri);
  // Stable numeric identifiers: a repository renamed or transferred keeps its id, and a new
  // repository that takes the old NAME does not inherit it.
  for (const [field, expected] of [
    ['sourceRepositoryIdentifier', want.repositoryId],
    ['sourceRepositoryOwnerIdentifier', want.repositoryOwnerId],
  ]) {
    if (expected !== undefined) exact(field, identity[field], expected);
  }
  return problems;
}

/** The leaf must chain to a PINNED Fulcio CA and have been valid at signing time. */
export function verifyCertificateChain(leafDer, trustedRoot, at) {
  const problems = [];
  let leaf;
  try { leaf = new X509Certificate(leafDer); } catch (e) {
    return [`c19 certificate: unreadable leaf (${e.message})`];
  }
  const anchors = pinnedCaCertificates(trustedRoot).map((d) => {
    try { return new X509Certificate(d); } catch { return null; }
  }).filter((c) => c !== null);
  if (anchors.length === 0) return ['c19 certificate: the trust material pins no Fulcio CA'];

  // Walk up: the leaf must verify against SOME pinned certificate, directly or through an
  // intermediate that itself chains to a pinned root.
  const verified = anchors.some((a) => { try { return leaf.checkIssued(a) && leaf.verify(a.publicKey); } catch { return false; } });
  if (!verified) {
    problems.push('c19 certificate: the leaf does not chain to any pinned Fulcio certificate '
      + 'authority; a certificate that validates against some other CA is not a Sigstore identity '
      + 'for this gate');
  }
  const from = Date.parse(leaf.validFrom);
  const to = Date.parse(leaf.validTo);
  if (Number.isFinite(from) && Number.isFinite(to) && at !== undefined) {
    if (at < from || at > to) {
      problems.push(`c19 certificate: signing time ${new Date(at).toISOString()} is outside the `
        + `certificate validity window ${leaf.validFrom} .. ${leaf.validTo}`);
    }
  }
  return problems;
}

/** The signature must verify over the ARTIFACT DIGEST with the leaf's key. */
export function verifyArtifactSignature({ leafDer, signatureB64, artifactDigestHex, artifactBytes }) {
  const problems = [];
  // The bytes are checked BEFORE the key is touched. If the artifact does not hash to what the
  // bundle attests, the signature is over different bytes and nothing about the key matters — and
  // reporting a key problem there would name the wrong cause.
  if (artifactBytes !== undefined) {
    const actual = sha256(artifactBytes).toString('hex');
    if (actual !== artifactDigestHex) {
      return [`c19 signature: the bundle attests digest ${artifactDigestHex} but the artifact `
        + `hashes to ${actual}; the signature is over different bytes`];
    }
  }
  let key;
  try { key = new X509Certificate(leafDer).publicKey; } catch (e) {
    return [`c19 signature: no usable key in the leaf (${e.message})`];
  }
  const sig = Buffer.from(String(signatureB64), 'base64');
  const digest = Buffer.from(String(artifactDigestHex), 'hex');
  let ok = false;
  try {
    // Sigstore signs the artifact digest, so the digest IS the message for this verification.
    ok = verifyOneShot(null, digest, { key, dsaEncoding: 'der' }, sig);
  } catch { ok = false; }
  if (!ok) problems.push('c19 signature: does not verify over the attested artifact digest');
  return problems;
}

/**
 * The Rekor Signed Entry Timestamp, verified against a PINNED log key.
 *
 * The SET is over a canonical JSON object with its keys in lexicographic order. Rebuilding that
 * object here — rather than re-serialising whatever the bundle contained — is deliberate: signing
 * an attacker-supplied encoding would verify a projection instead of the entry.
 */
export function verifyRekorSet(entry, trustedRoot) {
  const problems = [];
  const keys = pinnedRekorKeys(trustedRoot);
  const logIdHex = Buffer.from(String(entry?.logId?.keyId ?? ''), 'base64').toString('hex');
  const pinned = keys.get(logIdHex);
  if (pinned === undefined) {
    return [`c19 rekor: entry claims log id ${logIdHex.slice(0, 16)}… which the trust material does `
      + 'not pin; an unknown log is not a transparency log'];
  }
  const set = entry?.inclusionPromise?.signedEntryTimestamp;
  if (typeof set !== 'string' || set === '') {
    return ['c19 rekor: the entry carries no signed entry timestamp'];
  }
  const canonical = JSON.stringify({
    body: entry.canonicalizedBody,
    integratedTime: Number(entry.integratedTime),
    logID: logIdHex,
    logIndex: Number(entry.logIndex),
  });
  let ok = false;
  try {
    const key = createPublicKey({ key: pinned.der, format: 'der', type: 'spki' });
    ok = verifyOneShot('sha256', Buffer.from(canonical, 'utf8'),
      { key, dsaEncoding: 'der' }, Buffer.from(set, 'base64'));
  } catch (e) {
    return [`c19 rekor: the signed entry timestamp could not be checked (${e.message})`];
  }
  if (!ok) problems.push('c19 rekor: the signed entry timestamp does not verify against the pinned log key');
  return problems;
}

/** RFC 6962 hashing: leaves and interior nodes are domain-separated so one cannot forge the other. */
export const leafHash = (bytes) => sha256(Buffer.concat([Buffer.from([0x00]), bytes]));
export const nodeHash = (l, r) => sha256(Buffer.concat([Buffer.from([0x01]), l, r]));

/**
 * Reconstruct the log's root hash from the entry and its audit path. If the reconstruction differs
 * from the checkpoint, the entry is not in the tree the log published, whatever the log says.
 */
export function verifyInclusionProof(entry) {
  const proof = entry?.inclusionProof;
  if (proof === undefined || proof === null) return ['c19 rekor: the entry carries no inclusion proof'];
  const { logIndex, treeSize, rootHash, hashes } = proof;
  if (!Array.isArray(hashes)) return ['c19 rekor: the inclusion proof carries no audit path'];
  const index = Number(logIndex);
  const size = Number(treeSize);
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || size <= index) {
    return [`c19 rekor: inclusion proof indices are not consistent (index ${logIndex}, size ${treeSize})`];
  }
  let leaf;
  try { leaf = leafHash(Buffer.from(String(entry.canonicalizedBody), 'base64')); } catch {
    return ['c19 rekor: the entry body is not decodable'];
  }
  const path = [];
  for (const step of hashes) {
    let sibling;
    try { sibling = Buffer.from(String(step), 'base64'); } catch { return ['c19 rekor: malformed audit path']; }
    if (sibling.length !== 32) return ['c19 rekor: an audit path node is not a sha-256 hash'];
    path.push(sibling);
  }

  // RFC 6962 §2.1.1, verbatim in structure. `fn` walks the leaf's index up the tree and `sn` the
  // last index at that level; together they say whether the node is a left or a right child, which
  // is the only thing that decides the hashing order. A proof that is too short or too long for the
  // declared tree size is REJECTED rather than padded — a proof whose length is not checked can be
  // truncated to make an unrelated leaf reconstruct the same root.
  let fn = index;
  let sn = size - 1;
  let hash = leaf;
  for (const sibling of path) {
    if (sn === 0) return ['c19 rekor: the audit path is longer than the declared tree admits'];
    if ((fn & 1) === 1 || fn === sn) {
      hash = nodeHash(sibling, hash);
      while ((fn & 1) === 0 && fn !== 0) { fn >>>= 1; sn >>>= 1; }
    } else {
      hash = nodeHash(hash, sibling);
    }
    fn >>>= 1;
    sn >>>= 1;
  }
  if (sn !== 0) return ['c19 rekor: the audit path is shorter than the declared tree requires'];

  const want = Buffer.from(String(rootHash ?? ''), 'base64');
  if (want.length !== 32 || !want.equals(hash)) {
    return [`c19 rekor: the inclusion proof reconstructs ${hash.toString('hex').slice(0, 16)}… but the `
      + `checkpoint says ${want.toString('hex').slice(0, 16)}…; the entry is not in the published tree`];
  }
  return [];
}

/**
 * The whole verdict. Returns findings; an empty array means every checked property held.
 *
 * `requireDeliveryStanding` is what separates a developer running this locally from the delivery
 * gate: the local signer exists so the path can be exercised without an OIDC identity, and it can
 * never satisfy delivery.
 */
export function verifyBundle({
  bundle, artifactBytes, artifactDigestHex, policy, trustedRoot, sourceSha, expectedRunUri,
  workflowDigest, now = Date.now(), requireDeliveryStanding = true, signerId = 'sigstore-fulcio',
}) {
  const problems = [];
  const signer = policy?.signers?.[signerId];
  if (signer === undefined) return [`c19: signer ${j(signerId)} is not in the trust policy`];
  if (requireDeliveryStanding && signer.deliveryCapable !== true) {
    return [`c19: signer ${j(signerId)} is NOT delivery-capable; a signer the evidence process `
      + 'controls cannot establish delivery standing'];
  }
  if (bundle === null || typeof bundle !== 'object') return ['c19: the bundle is not an object'];

  const certB64 = bundle.verificationMaterial?.certificate?.rawBytes
    ?? bundle.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;
  if (typeof certB64 !== 'string') return ['c19: the bundle carries no Fulcio certificate'];
  let leafDer;
  try { leafDer = Buffer.from(certB64, 'base64'); } catch { return ['c19: the certificate is not decodable']; }

  const entries = bundle.verificationMaterial?.tlogEntries ?? [];
  if (entries.length === 0) problems.push('c19 rekor: the bundle carries no transparency log entry');
  const entry = entries[0];
  const signedAt = entry === undefined ? now : Number(entry.integratedTime) * 1000;

  problems.push(...verifyCertificateChain(leafDer, trustedRoot, signedAt));

  let identity;
  try { identity = certificateIdentity(leafDer); } catch (e) {
    problems.push(`c19 identity: the certificate's extensions are unreadable (${e.message})`);
    return problems;
  }
  problems.push(...verifyIdentity(identity, policy, { sourceSha, expectedRunUri, workflowDigest }));

  const sigB64 = bundle.messageSignature?.signature;
  const digestB64 = bundle.messageSignature?.messageDigest?.digest;
  if (typeof sigB64 !== 'string' || typeof digestB64 !== 'string') {
    problems.push('c19 signature: the bundle carries no message signature');
  } else {
    const attested = Buffer.from(digestB64, 'base64').toString('hex');
    if (artifactDigestHex !== undefined && attested !== artifactDigestHex) {
      problems.push(`c19 signature: the bundle attests ${attested} but verification is about `
        + `${artifactDigestHex}`);
    }
    problems.push(...verifyArtifactSignature({
      leafDer, signatureB64: sigB64, artifactDigestHex: attested, artifactBytes,
    }));
  }

  if (entry !== undefined) {
    problems.push(...verifyRekorSet(entry, trustedRoot));
    problems.push(...verifyInclusionProof(entry));
  }
  return problems;
}

export { sha256 };
