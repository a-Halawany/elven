/**
 * C19 — THE SINGLE DELIVERY PIPELINE.
 *
 * One implementation, used unchanged by local controls, the hosted non-publishing harness, the real
 * publication workflow, recovery after an interruption, and foreign-checkout offline verification.
 * Workflow YAML supplies triggers, permissions and inputs; it contains no second implementation of
 * resolution, acquisition, recovery or verification.
 *
 * That mattered because the previous structure had two: the harness resolved fixtures one way and
 * production another, so a green harness proved something production never did.
 *
 * ── ORDER IS PART OF THE CONTRACT ──
 *
 * Every reversible check completes before anything irreversible. An OIDC token is not requested, a
 * signature is not made and Rekor is not written until resolution, acquisition, authentication,
 * payload construction and full validation have all passed. A gate that validates after signing has
 * already done the thing it was guarding.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { createGitHub } from './c19-github.mjs';
import {
  resolveCanonicalSource, resolveCanonicalFinalizer, assertCanonicalInvocation,
} from './c19-resolve.mjs';
import { acquire } from './c19-acquire.mjs';
import { buildPayload, canonicalize, domainContext, publicationIdentity, REQUIRED_PAYLOAD_FIELDS } from './c19-attest.mjs';
import { loadTrustMaterial, verifyBundle } from './c19-anchor.mjs';
import { rekorEntryToBundle, bundleMatchesPayload, BUNDLE_MEDIA_TYPE } from './c19-rekor.mjs';
import { verifyBlobArgv, signBlobArgv, COSIGN_PIN } from './c19-cosign.mjs';
import { runWithoutNetwork } from './c19-sandbox.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const j = (v) => JSON.stringify(v);

/** The modes. Exactly one is required; there is no default that signs. */
export const PIPELINE_MODES = Object.freeze(['plan', 'dry-run', 'publish', 'verify-offline']);

/**
 * Steps 1–4 — resolve the canonical publication identity, and refuse to be a duplicate.
 */
export function resolve({ gh, sha, invocation }) {
  const source = resolveCanonicalSource({ gh, sha });
  const finalizer = resolveCanonicalFinalizer({ gh, sha, sourceRunId: source.runId });
  const problems = [];
  // A later rerun must resolve to the existing publication or be refused — never merely queued
  // behind it, because both would eventually run and the second would duplicate.
  if (invocation !== undefined) {
    problems.push(...assertCanonicalInvocation({
      canonical: finalizer, actualRunId: invocation.finalizerRunId,
      actualAttempt: invocation.finalizerAttempt, what: 'finalizer',
    }));
  }
  return { source, finalizer, problems };
}

/** Step 10 — the deterministic canonical payload, from AUTHENTICATED bindings only. */
export function buildCanonicalPayload({ authed, acquisition, sourceTree, workflowRef, workflowDigest, workflowYamlDigest, sourceEvent }) {
  const facts = {
    sourceSha: authed.sourceSha,
    sourceTree,
    sourceRunId: authed.sourceRunId,
    sourceRunAttempt: authed.sourceRunAttempt,
    sourceEvent,
    finalizerRunId: authed.finalizerRunId,
    finalizerRunAttempt: authed.finalizerRunAttempt,
    workflowRef,
    // Fulcio's Build Config Digest is GitHub's workflow COMMIT (`workflow_sha`), not a hash of the
    // YAML bytes. Verifying a certificate against a YAML digest could never match.
    workflowDigest,
    evidenceArtifactId: acquisition.artifactId,
    evidenceArtifactName: acquisition.artifactName,
    evidenceDigest: acquisition.wrapperDigest,
    finalizedInnerName: acquisition.innerName,
    finalizedInnerDigest: acquisition.innerDigest,
  };
  const identity = publicationIdentity(facts);
  const payload = buildPayload('run-anchor', {
    ...facts,
    // The YAML-content digest is still useful provenance, so it is kept as its own signed field
    // rather than being conflated with the certificate's meaning.
    workflowYamlDigest,
    nonce: identity,
    // Derived from the publication identity, never from the clock, or a retry could not reproduce it.
    issuedAt: '1970-01-01T00:00:00.000Z',
    notBefore: '1970-01-01T00:00:00.000Z',
    expiresAt: '9999-12-31T23:59:59.999Z',
    signerId: 'sigstore-fulcio',
    keyVersion: 'fulcio-keyless',
    algorithm: 'ES256',
  });
  return { payload, canonical: canonicalize(payload), identity };
}

/** Step 11 — every reversible check, before anything irreversible. */
export function validateBeforeIrreversible({ payload, canonicalBytes, acquisition, policy, expectSha }) {
  const problems = [];
  for (const f of REQUIRED_PAYLOAD_FIELDS) {
    if (payload[f] === undefined || payload[f] === '') problems.push(`c19: payload omits ${j(f)}`);
  }
  if (payload.context !== domainContext(payload.purpose)) {
    problems.push(`c19: context ${j(payload.context)} does not domain-separate ${j(payload.purpose)}`);
  }
  if (canonicalize(payload) !== canonicalBytes.toString('utf8')) {
    problems.push('c19: the payload bytes are not the canonical encoding of their own content');
  }
  if (payload.evidenceDigest !== acquisition.wrapperDigest) {
    problems.push('c19: the payload does not bind the acquired wrapper');
  }
  if (payload.finalizedInnerDigest !== acquisition.innerDigest) {
    problems.push('c19: the payload does not bind the acquired inner evidence');
  }
  if (expectSha !== undefined && payload.sourceSha !== expectSha) {
    problems.push(`c19: the payload binds ${j(payload.sourceSha)}; this publication is about ${j(expectSha)}`);
  }
  const nbf = Date.parse(payload.notBefore);
  const exp = Date.parse(payload.expiresAt);
  const now = Date.now();
  if (!Number.isFinite(nbf) || !Number.isFinite(exp)) problems.push('c19: the validity window is not instants');
  else if (now < nbf || now > exp) problems.push('c19: the payload is outside its validity window NOW');
  if (policy?.identity?.workflowRef !== undefined && payload.workflowRef !== policy.identity.workflowRef) {
    problems.push(`c19: the payload names workflow ${j(payload.workflowRef)}, not the authorised `
      + `${j(policy.identity.workflowRef)}`);
  }
  return problems;
}

/**
 * Steps 12–13 — search Rekor, then EITHER reconstruct the existing publication OR sign exactly once.
 *
 * Recovery deliberately does NOT require the original run's overall conclusion to be `success`.
 * The recovery case exists precisely because Rekor accepted the signature and the run then failed
 * or was cancelled before persisting the bundle; demanding success would refuse every case the
 * mechanism was built for.
 */
export async function recoverOrSign({
  canonicalBytes, payloadPath, bundlePath, policy, trustedRoot, gh, cosignPath,
  search, fetchEntry, mode, sign = defaultSign,
}) {
  const digest = sha256(canonicalBytes);
  let uuids;
  try { uuids = await search(digest); } catch (e) {
    return { action: 'refuse', why: `the transparency log could not be queried (${e.message}); `
      + 'signing without knowing whether a record exists would risk a duplicate' };
  }
  if (uuids.length > 1) {
    return { action: 'refuse', why: `${uuids.length} log records already exist for this publication` };
  }

  if (uuids.length === 1) {
    let entry;
    try { entry = await fetchEntry(uuids[0]); } catch (e) {
      return { action: 'refuse', why: `an existing record was found but could not be retrieved (${e.message})` };
    }
    let bundle;
    try { bundle = rekorEntryToBundle(entry, { uuid: uuids[0] }); } catch (e) {
      return { action: 'refuse', why: `the existing record could not be reconstructed: ${e.message}` };
    }
    const problems = [
      ...bundleMatchesPayload(bundle, canonicalBytes),
      ...verifyBundle({
        bundle, artifactBytes: canonicalBytes, artifactDigestHex: digest, policy, trustedRoot,
        sourceSha: undefined, workflowDigest: undefined,
        recovery: true,
        // The ORIGINAL invocation is authenticated through GitHub. Its conclusion is NOT required
        // to be success: that is the very situation recovery exists for.
        fetchRun: (runId, attempt) => gh.runAttempt(runId, attempt),
      }),
    ];
    if (problems.length > 0) {
      return { action: 'refuse', why: `an existing record was found but does not verify: ${problems[0]}` };
    }
    // Persist at the NORMAL bundle path, because every later step reads that path.
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
    return { action: 'reuse', bundle, signings: 0 };
  }

  if (mode === 'dry-run') {
    return { action: 'would-sign', signings: 0,
      why: 'the log has no record for these bytes; a real run would sign exactly once here' };
  }
  sign({ cosignPath, bundlePath, payloadPath });
  if (!existsSync(bundlePath)) {
    return { action: 'refuse', why: 'signing reported success but no bundle was persisted' };
  }
  return { action: 'signed', signings: 1 };
}

const defaultSign = ({ cosignPath, bundlePath, payloadPath }) => {
  const argv = signBlobArgv({ cosignPath, bundlePath, payloadPath });
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`c19: cosign sign-blob failed (exit ${r.status})`);
};

/**
 * Step 14 — verify the final bundle with BOTH the repository verifier and the pinned cosign, and do
 * the cosign half with the network denied at the OS boundary.
 */
export function verifyFinalBundle({
  bundlePath, payloadPath, policy, trustedRoot, trustedRootPath, cosignPath, sourceSha, workflowDigest,
  runId, runAttempt, recovery = false, gh, offline = true,
}) {
  const problems = [];
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const payloadBytes = readFileSync(payloadPath);
  problems.push(...verifyBundle({
    bundle, artifactBytes: payloadBytes, artifactDigestHex: sha256(payloadBytes),
    policy, trustedRoot, sourceSha, workflowDigest, runId, runAttempt,
    recovery, fetchRun: gh === undefined ? undefined : ((r, a) => gh.runAttempt(r, a)),
  }));

  const argv = verifyBlobArgv({
    cosignPath, bundlePath, payloadPath,
    certificateIdentity: policy.identity.subjectAlternativeName,
    oidcIssuer: policy.identity.issuer,
    trustedRootPath, offline,
  });
  // The same pinned binary that signs. Run with the network denied at the OS boundary, because
  // patching Node's networking constrains nothing about a spawned process.
  const r = offline
    ? runWithoutNetwork(argv)
    : (() => { const x = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
               return { status: x.status, stdout: x.stdout ?? '', stderr: x.stderr ?? '', mechanism: 'none' }; })();
  if (r.status !== 0) {
    problems.push(`c19: pinned cosign ${COSIGN_PIN.version_tag} rejected the bundle`
      + `${offline ? ` (offline, enforced via ${r.mechanism})` : ''}: `
      + `${(r.stderr || r.stdout).trim().slice(-400)}`);
  }
  return { problems, cosignMechanism: r.mechanism };
}

/** Step 15 — everything a foreign checkout needs after GitHub's artifacts expire. */
export function persistDeliveryPackage({ out, acquisition, payloadPath, bundlePath, libDir, metadata }) {
  const dir = join(out, 'delivery');
  mkdirSync(dir, { recursive: true });
  const copy = (from, name) => { if (existsSync(from)) writeFileSync(join(dir, name), readFileSync(from)); };
  copy(acquisition.wrapperPath, 'finalized-wrapper.zip');
  copy(acquisition.innerPath, acquisition.innerName);
  copy(`${acquisition.innerPath}.sha256`, `${acquisition.innerName}.sha256`);
  copy(payloadPath, 'payload.json');
  copy(bundlePath, 'bundle.sigstore.json');
  copy(join(libDir, 'c19-sigstore-trusted-root.json'), 'trusted-root.json');
  copy(join(libDir, 'c19-sigstore-tuf-root.json'), 'tuf-root.json');
  writeFileSync(join(dir, 'VERIFY.md'), verifyInstructions(metadata));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return dir;
}

const verifyInstructions = (m) => `# Verifying this delivery offline

Everything needed is in this directory. No GitHub artifact, network call or checkout is required —
which matters because GitHub artifacts expire and this evidence should outlive them.

| File | What it is |
|---|---|
| \`payload.json\` | the canonical signed bytes |
| \`bundle.sigstore.json\` | the Sigstore bundle (${BUNDLE_MEDIA_TYPE}) |
| \`finalized-wrapper.zip\` | the artifact GitHub served |
| \`${m.innerName ?? 'c17-cross-host-finalized-<sha>.zip'}\` | the finalized inner evidence |
| \`trusted-root.json\` | independently bootstrapped Sigstore trust material |
| \`tuf-root.json\` | the TUF root that authenticates it |

## Verify

    cosign verify-blob --bundle bundle.sigstore.json \\
      --certificate-identity ${m.certificateIdentity ?? '<SAN>'} \\
      --certificate-oidc-issuer ${m.oidcIssuer ?? '<issuer>'} \\
      --trusted-root trusted-root.json --offline payload.json

Then confirm \`payload.json\` binds the evidence you hold:

    sha256sum finalized-wrapper.zip     # must equal .evidenceDigest in payload.json
    sha256sum ${m.innerName ?? '<inner>'}   # must equal .finalizedInnerDigest

## What this proves, and what it does not

It proves the workflow identity that signed, the exact bytes signed, log inclusion and a
publication time window. It does **not** prove that claims inside the evidence are true — see
\`c19-authority.mjs\` for the claim-to-authority ledger and the limits that remain open.
`;
