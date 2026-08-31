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
import { certificateExtensions, extensionString, pemToDer } from './c19-der.mjs';

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
  if (policy.schema !== 'eye/c19/trust-policy' || policy.version !== 3) {
    throw new Error(`c19-trust.json is version ${policy.version}; this verifier reads version 3 and `
      + 'refuses an older policy rather than applying it — v2 could fail open on identity fields '
      + 'for which no expectation was supplied');
  }
  if (!Array.isArray(policy.requiredIdentityFields) || policy.requiredIdentityFields.length === 0) {
    throw new Error('c19-trust.json declares no required identity fields; every delivery-standing '
      + 'field must be mandatory, or verification can pass without checking anything');
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
 * EXACT identity matching that FAILS CLOSED.
 *
 * The previous version checked a field only when the caller happened to supply an expected value:
 *
 *     if (expected === undefined || expected === null) return;   // <- skipped the check
 *
 * That is fail-open, and it was not theoretical. The real CLI supplied no workflow digest, and the
 * workflow's final verification step supplied neither a source SHA nor a run URI, so an identity
 * carrying a WRONG source SHA, a WRONG workflow digest and a WRONG run invocation URI verified
 * with **zero findings**. A verifier that silently skips the checks nobody remembered to ask for
 * is worse than no verifier, because its silence reads as approval.
 *
 * Now: every field in `requiredIdentityFields` must be present in the certificate AND matched
 * against an expected value. A missing expectation is a REFUSAL — the caller could not state what
 * it was verifying, so nothing is verified.
 *
 * ── THE SIGNER IS NOT THE SOURCE ──
 *
 * The anchor workflow is `workflow_run`-triggered, so Fulcio records its Build Trigger as
 * `workflow_run` — NOT the `push` that triggered the upstream `ci` run. Conflating them accepts a
 * signature minted through a different trigger path than the policy authorises. The upstream
 * source run, its event and its attempt are bound SEPARATELY, through the signed payload.
 *
 * Fulcio's Run Invocation URI also carries `/attempts/<run_attempt>`; an expectation that omits it
 * would never match, or worse, would be relaxed until it did.
 */
export function verifyIdentity(identity, policy, expectations = {}) {
  const problems = [];
  const want = policy.identity;
  const required = policy.requiredIdentityFields ?? [];

  const {
    sourceSha, runId, runAttempt, workflowDigest,
  } = expectations;

  // The run invocation URI is built from the run AND its attempt, because that is what Fulcio
  // records. A bare `/actions/runs/<id>` never matches a real certificate.
  const expectedRunUri = (runId !== undefined && runAttempt !== undefined)
    ? `https://github.com/${want.repository}/actions/runs/${runId}/attempts/${runAttempt}`
    : expectations.expectedRunUri;

  const expected = {
    subjectAlternativeName: want.subjectAlternativeName,
    issuer: want.issuer,
    sourceRepositoryUri: `https://github.com/${want.repository}`,
    sourceRepositoryIdentifier: want.repositoryId,
    sourceRepositoryOwnerUri: `https://github.com/${want.repositoryOwner}`,
    sourceRepositoryOwnerIdentifier: want.repositoryOwnerId,
    sourceRepositoryRef: want.ref,
    sourceRepositoryDigest: sourceSha,
    buildConfigUri: `https://github.com/${want.workflowRef}`,
    buildConfigDigest: workflowDigest,
    // The SIGNER's trigger, not the upstream source event.
    buildTrigger: want.signerEventName,
    runInvocationUri: expectedRunUri,
    runnerEnvironment: want.runnerEnvironment,
  };

  for (const field of required) {
    const got = identity[field];
    const exp = expected[field];
    if (exp === undefined || exp === null || exp === '') {
      // FAIL CLOSED. The caller could not say what it expected, so this field is unverified, and
      // an unverified required field is a refusal rather than a pass.
      problems.push(`c19 identity: no expected value was supplied for required field ${j(field)}; `
        + 'delivery standing cannot be established for a field nobody stated');
      continue;
    }
    if (got === undefined || got === null || got === '') {
      problems.push(`c19 identity: the certificate carries no ${j(field)}; every required identity `
        + 'extension must be present');
      continue;
    }
    if (String(got) !== String(exp)) {
      problems.push(`c19 identity: ${field} is ${j(got)}; delivery standing requires exactly ${j(exp)}`);
    }
  }
  // A field the policy does not require is still checked when both sides are known, so adding a
  // binding to the policy strengthens verification without needing a code change here.
  for (const [field, exp] of Object.entries(expected)) {
    if (required.includes(field)) continue;
    if (exp === undefined || exp === null) continue;
    if (String(identity[field]) !== String(exp)) {
      problems.push(`c19 identity: ${field} is ${j(identity[field])}; expected ${j(exp)}`);
    }
  }
  return problems;
}

/**
 * ── A RECOVERED SIGNATURE WAS MADE BY A DIFFERENT RUN, AND THAT IS THE POINT ──
 *
 * Recovery exists because attempt N published and then lost its bundle. Attempt N+1 finds that
 * record — and previously compared its certificate against attempt N+1's OWN run invocation URI,
 * which cannot possibly match. Recovery therefore located the entry it needed and then refused it,
 * which is worse than not recovering at all: it turns a recoverable state into a permanent failure,
 * and the obvious "fix" under time pressure is to sign again.
 *
 * The coherent rule is that the two cases ask different questions:
 *
 *   FRESH     the certificate must name THIS run and THIS attempt — the one authorised to sign now.
 *   RECOVERY  the certificate names the ORIGINAL run and attempt. That invocation must be
 *             independently confirmed, through GitHub, to have been the authorised C19 workflow on
 *             main for this exact publication — not compared to the runner doing the recovering.
 */

/** The signer's own run and attempt, read out of the certificate rather than assumed. */
export function originalSignerInvocation(identity, policy) {
  const uri = String(identity?.runInvocationUri ?? '');
  const prefix = `https://github.com/${policy.identity.repository}/actions/runs/`;
  if (!uri.startsWith(prefix)) {
    return { problems: [`c19 recovery: the certificate's run invocation URI ${j(uri)} is not a run `
      + `of ${j(policy.identity.repository)}`], invocation: null };
  }
  const m = /^(\d+)\/attempts\/(\d+)$/.exec(uri.slice(prefix.length));
  if (m === null) {
    return { problems: [`c19 recovery: the certificate's run invocation URI ${j(uri)} does not name `
      + 'a run and attempt in the form Fulcio records'], invocation: null };
  }
  return { problems: [], invocation: { runId: m[1], runAttempt: m[2] } };
}

/**
 * Independently confirm that the ORIGINAL signing invocation was the authorised C19 workflow on
 * main, for this exact publication. The certificate says who signed; this asks GitHub whether that
 * signer was allowed to.
 *
 * `fetchRun` is injected so a control can drive every branch without a network.
 */
export function confirmAuthorizedSignerRun({ invocation, policy, expectedHeadSha, fetchRun }) {
  const problems = [];
  const run = fetchRun(invocation.runId, invocation.runAttempt);
  if (run === null || run === undefined) {
    return [`c19 recovery: GitHub has no record of run ${invocation.runId} attempt `
      + `${invocation.runAttempt}; an unconfirmable signer is not an authorised one`];
  }
  const want = policy.identity;
  const checks = [
    ['repository', run.repository?.full_name, want.repository],
    // `owner/repo/.github/workflows/x.yml@ref` -> `.github/workflows/x.yml`. Splitting on '/' and
    // taking the last element yields the REF's last segment, not the workflow file.
    ['workflow path', run.path, want.workflowRef.split('@')[0].split('/').slice(2).join('/')],
    ['head branch', run.head_branch, 'main'],
    ['event', run.event, want.signerEventName],
    ['conclusion', run.conclusion, 'success'],
  ];
  for (const [name, got, expected] of checks) {
    if (String(got) !== String(expected)) {
      problems.push(`c19 recovery: the original signing run's ${name} is ${j(got)}; an authorised `
        + `C19 publication requires ${j(expected)}`);
    }
  }
  if (expectedHeadSha !== undefined && String(run.head_sha) !== String(expectedHeadSha)) {
    problems.push(`c19 recovery: the original signing run was for ${j(run.head_sha)}, not the `
      + `publication's ${j(expectedHeadSha)}`);
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
 * ── BINDING THE LOG RECORD TO WHAT WAS ACTUALLY SIGNED ──
 *
 * Checking the artifact signature and the Rekor entry SEPARATELY proves almost nothing: it shows
 * that something was signed, and that something was logged, without ever establishing that they
 * are the same something. An attacker who can present any valid log entry alongside any valid
 * signature satisfies both checks independently.
 *
 * So the entry body is DECODED and its contents compared to the bundle: the logged artifact digest,
 * the logged signature and the logged certificate must each equal the ones being verified.
 */
export function verifyRekorBodyBinding(entry, { leafDer, signatureB64, artifactDigestHex }) {
  const problems = [];
  let body;
  try {
    body = JSON.parse(Buffer.from(String(entry?.canonicalizedBody ?? ''), 'base64').toString('utf8'));
  } catch {
    return ['c19 rekor: the entry body is not decodable JSON; nothing can be bound to it'];
  }
  const kind = body?.kind;
  if (kind !== 'hashedrekord') {
    problems.push(`c19 rekor: entry kind ${j(kind)} is not the hashedrekord this gate publishes`);
  }
  const spec = body?.spec ?? {};
  const loggedDigest = spec?.data?.hash?.value;
  const loggedAlgorithm = spec?.data?.hash?.algorithm;
  const loggedSig = spec?.signature?.content;
  const loggedKey = spec?.signature?.publicKey?.content;

  if (loggedAlgorithm !== 'sha256') {
    problems.push(`c19 rekor: the logged hash algorithm is ${j(loggedAlgorithm)}, not sha256`);
  }
  if (String(loggedDigest) !== String(artifactDigestHex)) {
    problems.push(`c19 rekor: the log records digest ${j(loggedDigest)} but the bundle attests `
      + `${j(artifactDigestHex)}; the logged record is not about these bytes`);
  }
  if (String(loggedSig) !== String(signatureB64)) {
    problems.push('c19 rekor: the signature in the log entry is not the signature in the bundle; '
      + 'the entry does not attest this signature');
  }
  // The logged public key is the PEM of the signing certificate.
  let loggedDer;
  try { loggedDer = pemToDer(Buffer.from(String(loggedKey), 'base64').toString('utf8')); } catch {
    problems.push('c19 rekor: the certificate recorded in the log entry is not decodable');
    return problems;
  }
  if (!loggedDer.equals(Buffer.from(leafDer))) {
    problems.push('c19 rekor: the certificate in the log entry is not the certificate in the '
      + 'bundle; the entry was made by a different identity');
  }
  return problems;
}

/**
 * The Rekor Signed Entry Timestamp, verified against a PINNED log key that was VALID AT THE TIME.
 *
 * A log key has a validity window. Accepting a SET signed by a key outside its window accepts a
 * record the log itself would no longer vouch for, which is how a retired key becomes a forgery
 * oracle.
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
  const integrated = Number(entry?.integratedTime) * 1000;
  const start = Date.parse(pinned.validFor?.start ?? '');
  const endRaw = pinned.validFor?.end;
  const end = endRaw === undefined ? Infinity : Date.parse(endRaw);
  if (Number.isFinite(start) && integrated < start) {
    problems.push('c19 rekor: the entry predates the validity window of the log key it names');
  }
  if (Number.isFinite(end) && integrated > end) {
    problems.push('c19 rekor: the entry postdates the validity window of the log key it names; a '
      + 'retired key does not vouch for new records');
  }
  const set = entry?.inclusionPromise?.signedEntryTimestamp;
  if (typeof set !== 'string' || set === '') {
    problems.push('c19 rekor: the entry carries no signed entry timestamp');
    return problems;
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
 * ── THE CHECKPOINT MUST BE AUTHENTICATED, OR THE PROOF PROVES NOTHING ──
 *
 * An inclusion proof reconstructs a root hash and compares it to one the BUNDLE supplied. If that
 * root is taken on trust, the whole exercise is circular: a one-leaf proof whose "root" is just
 * the attacker's own leaf hash reconstructs perfectly. That case was accepted by the previous
 * implementation, which is a complete bypass of the transparency guarantee.
 *
 * The root must therefore come from the log's SIGNED CHECKPOINT — a signed note whose body carries
 * the origin, the tree size and the root hash, and whose signature is verified against the pinned
 * log key before any of it is believed.
 */
export function parseCheckpoint(envelope) {
  const text = String(envelope ?? '');
  const split = text.indexOf('\n\n');
  if (split < 0) return null;
  const bodyText = text.slice(0, split + 1);          // note body INCLUDES its trailing newline
  const lines = text.slice(0, split).split('\n');
  if (lines.length < 3) return null;
  const sigLines = text.slice(split + 2).split('\n').filter((l) => l.startsWith('— '));
  const sigs = sigLines.map((l) => {
    const parts = l.slice(2).split(' ');
    return { name: parts[0], blob: Buffer.from(parts[1] ?? '', 'base64') };
  });
  return {
    origin: lines[0],
    treeSize: Number(lines[1]),
    rootHash: Buffer.from(lines[2], 'base64'),
    bodyBytes: Buffer.from(bodyText, 'utf8'),
    signatures: sigs,
  };
}

/** Verify a checkpoint's signature against the pinned log key it claims to come from. */
export function verifyCheckpoint(entry, trustedRoot) {
  const envelope = entry?.inclusionProof?.checkpoint?.envelope;
  if (typeof envelope !== 'string' || envelope === '') {
    return { problems: ['c19 rekor: the inclusion proof carries no signed checkpoint; without one '
      + 'the root hash is attacker-supplied and the proof is circular'], checkpoint: null };
  }
  const cp = parseCheckpoint(envelope);
  if (cp === null) return { problems: ['c19 rekor: the checkpoint envelope is malformed'], checkpoint: null };

  const keys = pinnedRekorKeys(trustedRoot);
  const logIdHex = Buffer.from(String(entry?.logId?.keyId ?? ''), 'base64').toString('hex');
  const pinned = keys.get(logIdHex);
  if (pinned === undefined) {
    return { problems: ['c19 rekor: the checkpoint names a log this trust material does not pin'], checkpoint: null };
  }
  // A note signature is a 4-byte key hint followed by the raw signature.
  let ok = false;
  try {
    const key = createPublicKey({ key: pinned.der, format: 'der', type: 'spki' });
    for (const s of cp.signatures) {
      if (s.blob.length <= 4) continue;
      if (verifyOneShot('sha256', cp.bodyBytes, { key, dsaEncoding: 'der' }, s.blob.subarray(4))) {
        ok = true;
        break;
      }
    }
  } catch (e) {
    return { problems: [`c19 rekor: the checkpoint signature could not be checked (${e.message})`], checkpoint: null };
  }
  if (!ok) {
    return { problems: ['c19 rekor: the checkpoint signature does not verify against the pinned log '
      + 'key; its root hash cannot be trusted'], checkpoint: null };
  }
  return { problems: [], checkpoint: cp };
}

/**
 * Reconstruct the log's root hash from the entry and its audit path, and compare it to the root in
 * an AUTHENTICATED checkpoint. The checkpoint is required: comparing against a root the bundle
 * supplied would let any leaf prove itself.
 */
export function verifyInclusionProof(entry, trustedRoot) {
  const proof = entry?.inclusionProof;
  if (proof === undefined || proof === null) return ['c19 rekor: the entry carries no inclusion proof'];

  const { problems: cpProblems, checkpoint } = verifyCheckpoint(entry, trustedRoot);
  if (cpProblems.length > 0) return cpProblems;

  const { logIndex, treeSize, hashes } = proof;
  if (!Array.isArray(hashes)) return ['c19 rekor: the inclusion proof carries no audit path'];
  const index = Number(logIndex);
  const size = Number(treeSize);
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || size <= index) {
    return [`c19 rekor: inclusion proof indices are not consistent (index ${logIndex}, size ${treeSize})`];
  }
  // The proof's own tree size must equal the size the SIGNED checkpoint states.
  if (size !== checkpoint.treeSize) {
    return [`c19 rekor: the proof declares tree size ${size} but the signed checkpoint says `
      + `${checkpoint.treeSize}; the proof is against a different tree`];
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

  // RFC 6962 §2.1.1. A proof that is too short or too long for the declared tree is REJECTED
  // rather than padded: an unchecked length can be truncated to make an unrelated leaf reconstruct
  // the same root.
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

  if (!checkpoint.rootHash.equals(hash)) {
    return [`c19 rekor: the proof reconstructs ${hash.toString('hex').slice(0, 16)}… but the SIGNED `
      + `checkpoint says ${checkpoint.rootHash.toString('hex').slice(0, 16)}…; the entry is not in `
      + 'the tree the log published'];
  }
  return [];
}

/**
 * ── SIGNED CERTIFICATE TIMESTAMP ──
 *
 * Fulcio embeds an SCT proving the certificate was submitted to a CT log. Full SCT signature
 * verification requires reconstructing the pre-certificate TBS with the poison extension removed
 * and the issuer key hash prepended — subtle enough that a hand-rolled version that LOOKED right
 * would be worse than none, because it would report success either way.
 *
 * So this checks PRESENCE and STRUCTURE only, and says so. The cryptographic verification of the
 * SCT is delegated to cosign in `c19-anchor-cli.mjs`, which is a standards-conformant Sigstore
 * verifier; delivery standing requires BOTH, and this function never claims to have done cosign's
 * job.
 */
export const SCT_OID = '1.3.6.1.4.1.11129.2.4.2';

export function verifySctPresence(leafDer, trustedRoot) {
  const problems = [];
  let exts;
  try { exts = certificateExtensions(leafDer); } catch (e) {
    return [`c19 sct: the certificate's extensions are unreadable (${e.message})`];
  }
  const sct = exts.get(SCT_OID);
  if (sct === undefined) {
    return ['c19 sct: the certificate carries no embedded SCT; a Fulcio certificate without one '
      + 'was never submitted to a certificate transparency log'];
  }
  if (!Array.isArray(trustedRoot?.ctlogs) || trustedRoot.ctlogs.length === 0) {
    problems.push('c19 sct: the trust material pins no CT log, so the SCT cannot be attributed');
  }
  // The extension wraps an SCT list: two bytes of total length, then length-prefixed entries.
  const raw = sct.raw;
  const inner = raw.length > 2 && raw[0] === 0x04 ? raw.subarray(2) : raw;
  if (inner.length < 4) problems.push('c19 sct: the SCT list is too short to contain an entry');
  return problems;
}

/**
 * The whole verdict. Returns findings; an empty array means every checked property held.
 *
 * `requireDeliveryStanding` is what separates a developer running this locally from the delivery
 * gate: the local signer exists so the path can be exercised without an OIDC identity, and it can
 * never satisfy delivery.
 */
export function verifyBundle({
  bundle, artifactBytes, artifactDigestHex, policy, trustedRoot, sourceSha, runId, runAttempt,
  workflowDigest, now = Date.now(), requireDeliveryStanding = true, signerId = 'sigstore-fulcio',
  // RECOVERY: the certificate was made by an earlier run, so its own invocation is the expectation
  // and `fetchRun` independently confirms that invocation was authorised.
  recovery = false, fetchRun,
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
  if (entries.length === 0) {
    problems.push('c19 rekor: the bundle carries no transparency log entry; an unpublished '
      + 'signature can be produced and discarded at will');
  }
  if (entries.length > 1) {
    problems.push(`c19 rekor: the bundle carries ${entries.length} log entries; exactly one record `
      + 'must attest these bytes, and an ambiguous set is refused rather than searched');
  }
  const entry = entries[0];
  const signedAt = entry === undefined ? now : Number(entry.integratedTime) * 1000;

  problems.push(...verifyCertificateChain(leafDer, trustedRoot, signedAt));
  problems.push(...verifySctPresence(leafDer, trustedRoot));

  let identity;
  try { identity = certificateIdentity(leafDer); } catch (e) {
    problems.push(`c19 identity: the certificate's extensions are unreadable (${e.message})`);
    return problems;
  }
  if (recovery) {
    const { problems: uriProblems, invocation } = originalSignerInvocation(identity, policy);
    problems.push(...uriProblems);
    if (invocation !== null) {
      // The certificate is checked against ITS OWN invocation, never the recovering runner's.
      problems.push(...verifyIdentity(identity, policy, {
        sourceSha, workflowDigest, runId: invocation.runId, runAttempt: invocation.runAttempt,
      }));
      if (typeof fetchRun !== 'function') {
        problems.push('c19 recovery: no means of confirming the original signing run was '
          + 'authorised; recovery must not accept a certificate on its own word');
      } else {
        problems.push(...confirmAuthorizedSignerRun({
          invocation, policy, expectedHeadSha: sourceSha, fetchRun,
        }));
      }
    }
  } else {
    problems.push(...verifyIdentity(identity, policy, { sourceSha, runId, runAttempt, workflowDigest }));
  }

  const sigB64 = bundle.messageSignature?.signature;
  const digestB64 = bundle.messageSignature?.messageDigest?.digest;
  if (typeof sigB64 !== 'string' || typeof digestB64 !== 'string') {
    problems.push('c19 signature: the bundle carries no message signature');
    return problems;
  }
  const attested = Buffer.from(digestB64, 'base64').toString('hex');
  if (artifactDigestHex !== undefined && attested !== artifactDigestHex) {
    problems.push(`c19 signature: the bundle attests ${attested} but verification is about `
      + `${artifactDigestHex}`);
  }
  problems.push(...verifyArtifactSignature({
    leafDer, signatureB64: sigB64, artifactDigestHex: attested, artifactBytes,
  }));

  if (entry !== undefined) {
    // The log record must be about THESE bytes, THIS signature and THIS certificate. Checking the
    // signature and the log entry separately proves only that something was signed and something
    // was logged — never that they are the same something.
    problems.push(...verifyRekorBodyBinding(entry, {
      leafDer, signatureB64: sigB64, artifactDigestHex: attested,
    }));
    problems.push(...verifyRekorSet(entry, trustedRoot));
    problems.push(...verifyInclusionProof(entry, trustedRoot));
  }
  return problems;
}

/**
 * What this module does NOT do, stated so a caller cannot mistake it for a complete verifier.
 *
 * These are the mandatory Sigstore checks delegated to cosign, a standards-conformant
 * implementation. Delivery standing requires BOTH this module and cosign to pass; a hand-rolled
 * look-alike of any of these would be worse than delegation, because it would report success
 * whether or not it was correct.
 */
export const DELEGATED_TO_COSIGN = Object.freeze([
  // EXECUTED by `runCosignVerify` in c19-anchor-cli.mjs on every delivery-standing verification.
  // Listing a delegate without invoking one is a gap with a label on it, which is what this was.
  'SCT signature verification against the CT log key (presence and structure only are checked here)',
  'full X.509 path building and policy validation beyond the pinned-anchor check',
  'canonical Sigstore bundle schema validation',
]);

export { sha256 };
