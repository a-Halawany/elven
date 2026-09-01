/**
 * Build a self-consistent Rekor TRANSPARENCY fixture with a LOCAL key.
 *
 * SCOPE: this fixture exercises the transparency machinery - the Merkle tree, the signed
 * checkpoint, the SET, and the Rekor-entry-to-Sigstore-bundle conversion - and its mutation
 * matrix. Its certificate and artifact signature are PLACEHOLDERS, which is why it cannot be used
 * to prove that a bundle verifies: that is `make-sigstore-fixture.mjs`, which generates a real CA,
 * a real leaf with Fulcio extensions and an embedded SCT, and a real signature, and which pinned
 * cosign accepts. Using this one for that purpose is what hid a broken signature check.
 *
 * Publishing this project to Rekor to obtain a real entry is exactly what must not happen before
 * review, so the fixture is generated: a real ECDSA key, a real RFC 6962 tree, a real signed
 * checkpoint and a real SET, all internally consistent. It exercises the whole reconstruction and
 * verification path without publishing anything.
 *
 * It is NOT a delivery-capable signer, and the trust policy refuses it as one — which is the same
 * refusal that protects the real path.
 */
import { generateKeyPairSync, createHash, sign as nodeSign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash('sha256').update(b).digest();
const leafHash = (b) => sha256(Buffer.concat([Buffer.from([0x00]), b]));
const nodeHash = (l, r) => sha256(Buffer.concat([Buffer.from([0x01]), l, r]));

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const logDer = publicKey.export({ type: 'spki', format: 'der' });
const logIdHex = createHash('sha256').update(logDer).digest('hex');

const payload = Buffer.from('{"schema":"eye/c19/payload","fixture":true}');
const payloadDigestHex = createHash('sha256').update(payload).digest('hex');
const certPem = '-----BEGIN CERTIFICATE-----\nMIIBFAKEFIXTURECERTIFICATE\n-----END CERTIFICATE-----';
const signatureB64 = 'ZmFrZS1zaWduYXR1cmU=';

const body = {
  apiVersion: '0.0.1', kind: 'hashedrekord',
  spec: {
    data: { hash: { algorithm: 'sha256', value: payloadDigestHex } },
    signature: { content: signatureB64, publicKey: { content: Buffer.from(certPem).toString('base64') } },
  },
};
const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64');

// A real 4-leaf tree, with this entry at index 2.
const leaves = [Buffer.from('a'), Buffer.from('b'), Buffer.from(bodyB64, 'base64'), Buffer.from('d')]
  .map(leafHash);
const root = nodeHash(nodeHash(leaves[0], leaves[1]), nodeHash(leaves[2], leaves[3]));
const auditPath = [leaves[3], nodeHash(leaves[0], leaves[1])];

const checkpointBody = `rekor.fixture.local - 1234567890\n4\n${root.toString('base64')}\n`;
const cpSig = nodeSign('sha256', Buffer.from(checkpointBody, 'utf8'), { key: privateKey, dsaEncoding: 'der' });
const checkpoint = `${checkpointBody}\n— rekor.fixture.local ${Buffer.concat([Buffer.alloc(4), cpSig]).toString('base64')}\n`;

const integratedTime = 1735689600;
const logIndex = 2;
const setCanonical = JSON.stringify({
  body: bodyB64, integratedTime, logID: logIdHex, logIndex,
});
const set = nodeSign('sha256', Buffer.from(setCanonical, 'utf8'), { key: privateKey, dsaEncoding: 'der' });

const entry = {
  body: bodyB64, logID: logIdHex, logIndex, integratedTime,
  verification: {
    signedEntryTimestamp: set.toString('base64'),
    inclusionProof: {
      logIndex: 2, treeSize: 4, rootHash: root.toString('hex'),
      hashes: auditPath.map((h) => h.toString('hex')),
      checkpoint,
    },
  },
};

// A realistic Rekor uuid: 64 hex characters. The placeholder 'uuid-fixture' was not hex and was
// therefore correctly rejected by the uuid validation, which is itself the point of that check.
const uuid = createHash('sha256').update('c19-fixture-entry').digest('hex');
writeFileSync(join(HERE, 'rekor-entry.json'), JSON.stringify({ [uuid]: entry }, null, 2));
writeFileSync(join(HERE, 'payload.json'), payload);
writeFileSync(join(HERE, 'trusted-root.json'), JSON.stringify({
  mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
  certificateAuthorities: [],
  tlogs: [{
    baseUrl: 'https://rekor.fixture.local',
    hashAlgorithm: 'SHA2_256',
    publicKey: { rawBytes: logDer.toString('base64'), validFor: { start: '2020-01-01T00:00:00Z' } },
    logId: { keyId: Buffer.from(logIdHex, 'hex').toString('base64') },
  }],
  ctlogs: [],
}, null, 2));
process.stdout.write(`fixture written: log ${logIdHex.slice(0, 16)}… root ${root.toString('hex').slice(0, 16)}…\n`);
