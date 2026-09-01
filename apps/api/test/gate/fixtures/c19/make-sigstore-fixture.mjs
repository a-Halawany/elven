#!/usr/bin/env node
/**
 * Build a COMPLETE, standards-conformant Sigstore fixture — one that the repository verifier and
 * the pinned cosign both accept, without this project ever signing anything or touching Rekor.
 *
 * The previous fixture carried a placeholder certificate (`MIIBFAKEFIXTURECERTIFICATE`) and a
 * placeholder signature. Nothing cryptographic could be exercised against it, so the positive
 * recovery control had to replace the verifier with unconditional success — which proved the
 * orchestration ran and never that what it produced verifies. That is the hole this closes.
 *
 * What is generated, all of it real:
 *   - a fixture certificate authority, and a leaf carrying the exact Fulcio OID extensions
 *   - an embedded Signed Certificate Timestamp, signed by a fixture CT log key over the
 *     precertificate reconstruction that RFC 6962 specifies
 *   - a real ECDSA signature over the canonical payload bytes
 *   - an RFC 6962 Merkle tree, a note-format checkpoint and a Signed Entry Timestamp, all signed
 *     by a fixture Rekor key
 *   - a Sigstore trusted root pinning those three fixture keys
 *   - a trust policy whose identity expectations are the leaf's exact values
 *
 * The fixture CA is NOT the real Fulcio, and its trusted root is NOT the real Sigstore root: the
 * fixture policy is a separate file used only by controls. Substituting it for the real one is
 * exactly what the trust-material controls refuse.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seq, set, octet, utf8, ia5, bool, explicit, implicitPrim, int, bitString, oid, utcTime, name,
  ecdsaSha256, extension, tlv, uint,
} from './der.mjs';
import { buildCanonicalPayload } from '../../../../../../scripts/gate/lib/c19-pipeline.mjs';
import { canonicalJson } from '../../../../../../scripts/gate/lib/c19-tuf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'sigstore');
const sha256 = (b) => createHash('sha256').update(b).digest();
const b64 = (b) => Buffer.from(b).toString('base64');

// ── the identity this fixture attests ──────────────────────────────────────
const REPO = 'a-Halawany/elven';
const WORKFLOW_REF = `${REPO}/.github/workflows/c19-anchor.yml@refs/heads/main`;
const SAN = `https://github.com/${WORKFLOW_REF}`;
const SIGNER_RUN_ID = '33445566778';
const SIGNER_RUN_ATTEMPT = '1';
const SOURCE_SHA = 'a8d34c4d1dc91d1f205fac6044332907da210d46';
const WORKFLOW_SHA = 'b7c1f0e2a9d34c5e6f708192a3b4c5d6e7f80912';
const IDENTITY = {
  issuer: 'https://token.actions.githubusercontent.com',
  subjectAlternativeName: SAN,
  repository: REPO,
  repositoryOwner: 'a-Halawany',
  ref: 'refs/heads/main',
  workflowRef: WORKFLOW_REF,
  runnerEnvironment: 'github-hosted',
  repositoryId: '1326601788',
  repositoryOwnerId: '84006518',
  signerEventName: 'workflow_run',
};
const FULCIO = {
  '1.3.6.1.4.1.57264.1.8': IDENTITY.issuer,                                    // issuer (v2)
  '1.3.6.1.4.1.57264.1.9': `${SAN}`,                                           // build signer URI
  '1.3.6.1.4.1.57264.1.10': WORKFLOW_SHA,                                      // build signer digest
  '1.3.6.1.4.1.57264.1.11': IDENTITY.runnerEnvironment,
  '1.3.6.1.4.1.57264.1.12': `https://github.com/${REPO}`,                       // source repo URI
  '1.3.6.1.4.1.57264.1.13': SOURCE_SHA,                                        // source repo digest
  '1.3.6.1.4.1.57264.1.14': IDENTITY.ref,
  '1.3.6.1.4.1.57264.1.15': IDENTITY.repositoryId,
  '1.3.6.1.4.1.57264.1.16': `https://github.com/${IDENTITY.repositoryOwner}`,
  '1.3.6.1.4.1.57264.1.17': IDENTITY.repositoryOwnerId,
  '1.3.6.1.4.1.57264.1.18': SAN,                                               // build config URI
  '1.3.6.1.4.1.57264.1.19': WORKFLOW_SHA,                                      // build config digest
  '1.3.6.1.4.1.57264.1.20': IDENTITY.signerEventName,                          // build trigger
  '1.3.6.1.4.1.57264.1.21':                                                    // run invocation URI
    `https://github.com/${REPO}/actions/runs/${SIGNER_RUN_ID}/attempts/${SIGNER_RUN_ATTEMPT}`,
};

// ── keys ───────────────────────────────────────────────────────────────────
const p256 = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const ca = p256();
const leaf = p256();
const ctLog = p256();
const rekorLog = p256();
const spki = (k) => k.export({ type: 'spki', format: 'der' });
const spkiBits = (der) => {
  // The BIT STRING at the end of an SPKI, which is what subjectKeyIdentifier hashes.
  const c = new (require('node:crypto').X509Certificate ? Object : Object)();
  return der.subarray(der.length - 65);
};

const NOT_BEFORE = new Date('2026-08-24T20:30:00Z');
const NOT_AFTER = new Date('2026-08-24T20:40:00Z');   // Fulcio certificates are short-lived
const INTEGRATED_TIME = Math.floor(new Date('2026-08-24T20:31:00Z').getTime() / 1000);

function buildTbs({ serial, issuerName, subjectName, pubSpki, extensions }) {
  return seq([
    explicit(0, int(2)),                                  // v3
    int(serial),
    ecdsaSha256(),
    issuerName,
    seq([utcTime(NOT_BEFORE), utcTime(NOT_AFTER)]),
    subjectName,
    pubSpki,
    explicit(3, seq(extensions)),
  ]);
}
const signTbs = (tbs, key) => seq([tbs, ecdsaSha256(),
  bitString(nodeSign('sha256', tbs, { key, dsaEncoding: 'der' }))]);

const keyId = (pubDer) => sha256(pubDer.subarray(pubDer.length - 65)).subarray(0, 20);

// ── the certificate authority ──────────────────────────────────────────────
const caName = name([['2.5.4.3', 'c19 fixture CA'], ['2.5.4.10', 'eye-c19-fixture']]);
const caSpki = spki(ca.publicKey);
const caTbs = buildTbs({
  serial: 1, issuerName: caName, subjectName: caName, pubSpki: caSpki,
  extensions: [
    extension('2.5.29.19', true, seq([bool(true)])),                    // basicConstraints CA:TRUE
    extension('2.5.29.15', true, bitString(Buffer.from([0x06]), 1)),    // keyCertSign + cRLSign
    extension('2.5.29.14', false, octet(keyId(caSpki))),
  ],
});
const caDer = signTbs(caTbs, ca.privateKey);

// ── the leaf, twice: without the SCT (the CT signing input) and with it ─────
const leafSpki = spki(leaf.publicKey);
const baseExtensions = [
  extension('2.5.29.15', true, bitString(Buffer.from([0x80]), 7)),      // digitalSignature
  extension('2.5.29.37', false, seq([oid('1.3.6.1.5.5.7.3.3')])),       // codeSigning
  extension('2.5.29.19', true, seq([])),                                // basicConstraints CA:FALSE
  extension('2.5.29.14', false, octet(keyId(leafSpki))),
  extension('2.5.29.35', false, seq([implicitPrim(0, keyId(caSpki))])), // authorityKeyIdentifier
  extension('2.5.29.17', true, seq([tlv(0x86, Buffer.from(SAN, 'utf8'))])),  // SAN: URI
  ...Object.entries(FULCIO).map(([o, v]) => extension(o, false, utf8(v))),
];
const LEAF_SERIAL = Buffer.from('4f1c9a2b7d3e5f60', 'hex');
const preTbs = buildTbs({
  serial: LEAF_SERIAL, issuerName: caName, subjectName: seq([]),
  pubSpki: leafSpki, extensions: baseExtensions,
});

/**
 * RFC 6962 §3.2 — the SCT is signed over the PRECERTIFICATE: the issuer's key hash, plus this
 * TBS with the SCT extension absent. `preTbs` is exactly that, which is why it is built first.
 */
const SCT_TIMESTAMP = NOT_BEFORE.getTime() + 1000;
const ctLogSpki = spki(ctLog.publicKey);
const ctLogId = sha256(ctLogSpki);
const sctSigningInput = Buffer.concat([
  Buffer.from([0x00]),                    // version v1
  Buffer.from([0x00]),                    // signature_type certificate_timestamp
  uint(SCT_TIMESTAMP, 8),
  uint(1, 2),                             // entry_type precert_entry
  sha256(caSpki),                         // issuer_key_hash
  uint(preTbs.length, 3), preTbs,         // tbs_certificate, 24-bit length
  uint(0, 2),                             // no CT extensions
]);
const sctSig = nodeSign('sha256', sctSigningInput, { key: ctLog.privateKey, dsaEncoding: 'der' });
const serializedSct = Buffer.concat([
  Buffer.from([0x00]), ctLogId, uint(SCT_TIMESTAMP, 8), uint(0, 2),
  Buffer.from([0x04, 0x03]),              // sha256, ecdsa
  uint(sctSig.length, 2), sctSig,
]);
const sctList = Buffer.concat([uint(serializedSct.length + 2, 2), uint(serializedSct.length, 2), serializedSct]);
const leafTbs = buildTbs({
  serial: LEAF_SERIAL, issuerName: caName, subjectName: seq([]), pubSpki: leafSpki,
  extensions: [...baseExtensions, extension('1.3.6.1.4.1.11129.2.4.2', false, octet(sctList))],
});
const leafDer = signTbs(leafTbs, ca.privateKey);

/**
 * ── the signed payload ──
 *
 * Built by the PIPELINE'S OWN `buildCanonicalPayload`, from evidence bytes generated here, so the
 * fixture is shaped exactly like a real publication: every required field present, the window
 * derived from the finalizer instant, the context domain-separated, and the bytes the canonical
 * encoding of their own content. A hand-written stub would verify cryptographically and still tell
 * us nothing about whether the package contract holds.
 */
const wrapperBytes = Buffer.from('PK\u0003\u0004 c19 fixture finalized wrapper');
const innerBytes = Buffer.from('PK\u0003\u0004 c19 fixture finalized inner evidence');
const INNER_NAME = `c17-cross-host-finalized-${SOURCE_SHA}.zip`;
const built = buildCanonicalPayload({
  authed: {
    sourceSha: SOURCE_SHA, sourceRunId: '32772872150', sourceRunAttempt: '1',
    finalizerRunId: '32773496008', finalizerRunAttempt: '1',
  },
  acquisition: {
    wrapperDigest: sha256(wrapperBytes).toString('hex'),
    innerDigest: sha256(innerBytes).toString('hex'),
    innerName: INNER_NAME, artifactId: '4242424242',
    artifactName: 'c17-cross-host-finalized',
  },
  sourceTree: '9f1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d5',
  workflowRef: WORKFLOW_REF,
  workflowDigest: WORKFLOW_SHA,
  workflowYamlDigest: sha256(Buffer.from('c19-anchor.yml fixture')).toString('hex'),
  sourceEvent: 'push',
  // The window is derived from this instant and runs for ten years, so the fixture stays valid
  // far beyond any TUF timestamp - which is the contradiction the freshness split removes.
  finalizerCompletedAt: '2026-08-24T20:23:00Z',
});
const payload = Buffer.from(built.canonical, 'utf8');
const payloadDigest = sha256(payload);
const signature = nodeSign('sha256', payload, { key: leaf.privateKey, dsaEncoding: 'der' });

// ── the Rekor entry: a real hashedrekord over a real Merkle tree ────────────
const pem = (der, kind) => `-----BEGIN ${kind}-----\n${
  b64(der).replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END ${kind}-----\n`;
const body = {
  apiVersion: '0.0.1', kind: 'hashedrekord',
  spec: {
    data: { hash: { algorithm: 'sha256', value: payloadDigest.toString('hex') } },
    signature: { content: b64(signature), publicKey: { content: b64(Buffer.from(pem(leafDer, 'CERTIFICATE'), 'utf8')) } },
  },
};
const bodyB64 = b64(Buffer.from(JSON.stringify(body)));

const leafHash = (b) => sha256(Buffer.concat([Buffer.from([0x00]), b]));
const nodeHash = (l, r) => sha256(Buffer.concat([Buffer.from([0x01]), l, r]));
const leaves = [Buffer.from('c19-fixture-a'), Buffer.from('c19-fixture-b'),
  Buffer.from(bodyB64, 'base64'), Buffer.from('c19-fixture-d')].map(leafHash);
const root = nodeHash(nodeHash(leaves[0], leaves[1]), nodeHash(leaves[2], leaves[3]));
const auditPath = [leaves[3], nodeHash(leaves[0], leaves[1])];
const LOG_INDEX = 2;
const TREE_SIZE = 4;

const rekorSpki = spki(rekorLog.publicKey);
const rekorLogIdHex = sha256(rekorSpki).toString('hex');
// The note's first line is the log ORIGIN; the signature line names the KEY. For Rekor the origin
// is "<host> - <treeID>" while the key name is just the host, and conflating them makes the
// signature line unparseable - the name is read with a space-delimited scan.
const LOG_NAME = 'rekor.fixture.local';
const TREE_ID = '1234567890';
const ORIGIN = `${LOG_NAME} - ${TREE_ID}`;
const checkpointBody = `${ORIGIN}\n${TREE_SIZE}\n${b64(root)}\n`;
const cpSig = nodeSign('sha256', Buffer.from(checkpointBody, 'utf8'), { key: rekorLog.privateKey, dsaEncoding: 'der' });
// A note signature is a 4-byte key hint followed by the raw signature.
// Rekor's key hint is the first four bytes of SHA-256 over the key's PKIX DER - the same value
// whose full form is the log id. Go's sumdb/note hashes the key NAME as well; Rekor does not, and
// a hint the verifier cannot match reads as "the signature did not verify".
const keyHint = sha256(rekorSpki).subarray(0, 4);
const checkpoint = `${checkpointBody}\n\u2014 ${LOG_NAME} ${b64(Buffer.concat([keyHint, cpSig]))}\n`;

const setCanonical = JSON.stringify({
  body: bodyB64, integratedTime: INTEGRATED_TIME, logID: rekorLogIdHex, logIndex: LOG_INDEX,
});
const setSig = nodeSign('sha256', Buffer.from(setCanonical, 'utf8'), { key: rekorLog.privateKey, dsaEncoding: 'der' });

const uuid = sha256(Buffer.from(bodyB64, 'base64')).toString('hex');
const rekorApiEntry = {
  body: bodyB64, integratedTime: INTEGRATED_TIME, logID: rekorLogIdHex, logIndex: LOG_INDEX,
  verification: {
    signedEntryTimestamp: b64(setSig),
    inclusionProof: {
      checkpoint, hashes: auditPath.map((h) => h.toString('hex')),
      logIndex: LOG_INDEX, rootHash: root.toString('hex'), treeSize: TREE_SIZE,
    },
  },
};

// ── the Sigstore trusted root pinning the three fixture keys ────────────────
const isoRange = { start: NOT_BEFORE.toISOString() };
const trustedRoot = {
  mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
  certificateAuthorities: [{
    subject: { organization: 'eye-c19-fixture', commonName: 'c19 fixture CA' },
    uri: 'https://fulcio.fixture.local',
    certChain: { certificates: [{ rawBytes: b64(caDer) }] },
    validFor: isoRange,
  }],
  ctlogs: [{
    baseUrl: 'https://ctfe.fixture.local', hashAlgorithm: 'SHA2_256',
    publicKey: { rawBytes: b64(ctLogSpki), keyDetails: 'PKIX_ECDSA_P256_SHA_256', validFor: isoRange },
    logId: { keyId: b64(ctLogId) },
  }],
  tlogs: [{
    baseUrl: 'https://rekor.fixture.local', hashAlgorithm: 'SHA2_256',
    publicKey: { rawBytes: b64(rekorSpki), keyDetails: 'PKIX_ECDSA_P256_SHA_256', validFor: isoRange },
    logId: { keyId: b64(sha256(rekorSpki)) },
  }],
  timestampAuthorities: [],
};

/**
 * ── a FIXTURE TUF CHAIN over the fixture trusted root ──
 *
 * The delivery package must carry the delegation metadata that connects its TUF root to its
 * trusted root, and that metadata has to verify - shipping the two endpoints and asserting a
 * relationship between them was the defect. So the fixture generates a real chain: three roles,
 * each signed to its threshold by keys the root delegates to, versions the anchor can pin, and a
 * targets entry naming the trusted root by BOTH hash and length.
 */
const trustedRootBytes = Buffer.from(`${JSON.stringify(trustedRoot, null, 2)}\n`, 'utf8');
const tufKeys = { root: p256(), timestamp: p256(), snapshot: p256(), targets: p256() };
const tufKeyId = (k) => sha256(Buffer.from(k.publicKey.export({ type: 'spki', format: 'pem' }), 'utf8')).toString('hex');
const pemPub = (k) => k.publicKey.export({ type: 'spki', format: 'pem' });
const TUF_EXPIRES = '2027-01-01T00:00:00Z';

const tufKeyEntries = {};
const tufRoles = {};
for (const [role, k] of Object.entries(tufKeys)) {
  const id = tufKeyId(k);
  tufKeyEntries[id] = { keytype: 'ecdsa', scheme: 'ecdsa-sha2-nistp256', keyval: { public: pemPub(k) } };
  tufRoles[role] = { keyids: [id], threshold: 1 };
}
const signRole = (signed, key) => {
  const message = canonicalJson(signed);
  return {
    signed,
    signatures: [{ keyid: tufKeyId(key), sig: nodeSign('sha256', Buffer.from(message, 'utf8'),
      { key: key.privateKey, dsaEncoding: 'der' }).toString('hex') }],
  };
};
const tufRoot = signRole({
  _type: 'root', spec_version: '1.0.0', version: 1, expires: TUF_EXPIRES,
  consistent_snapshot: true, keys: tufKeyEntries, roles: tufRoles,
}, tufKeys.root);
const tufTargets = signRole({
  _type: 'targets', spec_version: '1.0.0', version: 1, expires: TUF_EXPIRES,
  targets: {
    'trusted_root.json': {
      length: trustedRootBytes.length,
      hashes: { sha256: sha256(trustedRootBytes).toString('hex') },
    },
  },
}, tufKeys.targets);
const tufSnapshot = signRole({
  _type: 'snapshot', spec_version: '1.0.0', version: 1, expires: TUF_EXPIRES,
  meta: { 'targets.json': { version: 1 } },
}, tufKeys.snapshot);
const tufTimestamp = signRole({
  _type: 'timestamp', spec_version: '1.0.0', version: 1, expires: TUF_EXPIRES,
  meta: { 'snapshot.json': { version: 1 } },
}, tufKeys.timestamp);

mkdirSync(join(OUT, 'tuf'), { recursive: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'payload.json'), payload);
writeFileSync(join(OUT, 'finalized-wrapper.zip'), wrapperBytes);
writeFileSync(join(OUT, INNER_NAME), innerBytes);
writeFileSync(join(OUT, `${INNER_NAME}.sha256`), `${sha256(innerBytes).toString('hex')}  ${INNER_NAME}\n`);
writeFileSync(join(OUT, 'rekor-entry.json'), `${JSON.stringify({ [uuid]: rekorApiEntry }, null, 2)}\n`);
writeFileSync(join(OUT, 'trusted-root.json'), trustedRootBytes);
writeFileSync(join(OUT, 'tuf-root.json'), `${JSON.stringify(tufRoot, null, 2)}\n`);
for (const [n, v] of [['timestamp', tufTimestamp], ['snapshot', tufSnapshot], ['targets', tufTargets]]) {
  writeFileSync(join(OUT, 'tuf', `${n}.json`), `${JSON.stringify(v, null, 2)}\n`);
}
writeFileSync(join(OUT, 'leaf.pem'), pem(leafDer, 'CERTIFICATE'));
writeFileSync(join(OUT, 'ca.pem'), pem(caDer, 'CERTIFICATE'));
/**
 * The FIXTURE trust policy. Same schema and same required fields as the real one - the identity
 * values are the leaf's, and the TUF pins are absent because this trusted root is source-owned
 * rather than TUF-delivered. It exists only so controls can verify against the fixture CA; the
 * real policy is what production uses, and substituting one for the other is what the
 * trust-material controls refuse.
 */
const realPolicy = JSON.parse(readFileSync(
  join(HERE, '..', '..', '..', '..', '..', '..', 'scripts', 'gate', 'lib', 'c19-trust.json'), 'utf8'));
writeFileSync(join(OUT, 'policy.json'), `${JSON.stringify({
  ...realPolicy,
  _fixture: 'NOT the production policy: it trusts a fixture CA generated by make-sigstore-fixture.mjs',
  identity: IDENTITY,
  tuf: {
    rootFile: 'tuf-root.json', trustedRootFile: 'trusted-root.json',
    trustedRootSha256: sha256(trustedRootBytes).toString('hex'),
    minimumVersions: { root: 1, timestamp: 1, snapshot: 1, targets: 1 },
  },
}, null, 2)}\n`);

writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify({
  uuid, identity: IDENTITY, sourceSha: SOURCE_SHA, workflowDigest: WORKFLOW_SHA,
  innerName: INNER_NAME, payloadDigest: payloadDigest.toString('hex'),
  signerRunId: SIGNER_RUN_ID, signerRunAttempt: SIGNER_RUN_ATTEMPT,
  integratedTime: INTEGRATED_TIME, notBefore: NOT_BEFORE.toISOString(), notAfter: NOT_AFTER.toISOString(),
}, null, 2)}\n`);
/**
 * The same material under the PRODUCTION names, so `persistDeliveryPackage` can use this directory
 * as its `libDir` unchanged. The point is to exercise the real persist step rather than assembling
 * a package by hand and then verifying the thing we assembled.
 */
mkdirSync(join(OUT, 'c19-tuf'), { recursive: true });
writeFileSync(join(OUT, 'c19-sigstore-trusted-root.json'), trustedRootBytes);
writeFileSync(join(OUT, 'c19-sigstore-tuf-root.json'), `${JSON.stringify(tufRoot, null, 2)}\n`);
for (const [n, v] of [['timestamp', tufTimestamp], ['snapshot', tufSnapshot], ['targets', tufTargets]]) {
  writeFileSync(join(OUT, 'c19-tuf', `${n}.json`), `${JSON.stringify(v, null, 2)}\n`);
}
writeFileSync(join(OUT, 'c19-trust.json'), readFileSync(join(OUT, 'policy.json')));

process.stdout.write(`c19 sigstore fixture written to ${OUT}\n  uuid ${uuid}\n`);
