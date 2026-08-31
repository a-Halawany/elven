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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

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
export function resolve({ gh, sha, invocation, requireCurrentTip = true, branch = 'main' }) {
  const source = resolveCanonicalSource({ gh, sha });
  const finalizer = resolveCanonicalFinalizer({ gh, sha, sourceRunId: source.runId });
  const problems = [];
  // An OLD successful run must not publish after main has moved on. Without this, re-triggering a
  // months-old finalizer would anchor evidence that no longer describes the branch — the run was
  // genuinely successful, which is exactly why the check has to be explicit.
  if (requireCurrentTip) {
    const tip = gh.branchTip(branch);
    if (String(tip) !== String(sha)) {
      problems.push(`c19: ${sha} is no longer the tip of ${branch} (${tip}); this publication is `
        + 'superseded, and an old successful run must not anchor evidence for a branch that has '
        + 'moved on');
    }
  }
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
export function buildCanonicalPayload({
  authed, acquisition, sourceTree, workflowRef, workflowDigest, workflowYamlDigest, sourceEvent,
  finalizerCompletedAt,
}) {
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
    // An AUTHENTICATED instant, identical on every retry, from which the validity window derives.
    finalizerCompletedAt,
  };
  const identity = publicationIdentity(facts);
  const payload = buildPayload('run-anchor', {
    ...facts,
    // The YAML-content digest is still useful provenance, so it is kept as its own signed field
    // rather than being conflated with the certificate's meaning.
    workflowYamlDigest,
    nonce: identity,
    ...deterministicWindow(facts, identity),
    signerId: 'sigstore-fulcio',
    keyVersion: 'fulcio-keyless',
    algorithm: 'ES256',
  });
  return { payload, canonical: canonicalize(payload), identity };
}

/**
 * A BOUNDED validity window that is still deterministic.
 *
 * 1970-to-9999 was not a validity window; it was the absence of one wearing the shape of a field.
 * But a window from the wall clock would make each retry produce different bytes and break
 * recovery, which is why it was hardcoded in the first place.
 *
 * The window is therefore derived from the FINALIZER RUN's completion instant — an authenticated
 * property of the publication identity, identical on every retry — and bounded to a real span.
 */
export const WINDOW_BEFORE_MS = 60 * 60 * 1000;              // one hour of clock tolerance
export const WINDOW_LIFETIME_MS = 10 * 365 * 24 * 3600 * 1000; // ten years of verifiability

export function deterministicWindow(facts, identity) {
  const anchor = Date.parse(facts.finalizerCompletedAt ?? '');
  if (!Number.isFinite(anchor)) {
    throw new Error('c19: the publication has no authenticated finalizer completion instant, so a '
      + 'deterministic validity window cannot be derived; refusing to substitute the wall clock, '
      + 'which would make every retry produce different bytes');
  }
  const iso = (ms) => new Date(ms).toISOString();
  return {
    issuedAt: iso(anchor),
    notBefore: iso(anchor - WINDOW_BEFORE_MS),
    expiresAt: iso(anchor + WINDOW_LIFETIME_MS),
  };
}

/** The window must be real, bounded, and current at verification time. */
export function validatePayloadWindow(payload, now = Date.now()) {
  const problems = [];
  const nbf = Date.parse(payload.notBefore);
  const exp = Date.parse(payload.expiresAt);
  const iat = Date.parse(payload.issuedAt);
  if (!Number.isFinite(nbf) || !Number.isFinite(exp) || !Number.isFinite(iat)) {
    return ['c19 payload: issuedAt, notBefore and expiresAt must all be instants'];
  }
  if (exp <= nbf) problems.push('c19 payload: expires no later than it becomes valid');
  const span = exp - nbf;
  if (span > WINDOW_LIFETIME_MS + WINDOW_BEFORE_MS + 1000) {
    problems.push(`c19 payload: the validity window spans ${Math.round(span / 86400000)} days; an `
      + 'unbounded window is not a validity window');
  }
  if (now < nbf) problems.push('c19 payload: presented before its notBefore');
  if (now > exp) problems.push('c19 payload: has expired');
  return problems;
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
  // Injected so a control can exercise the ORCHESTRATION of recovery — reuse, zero signing, the
  // bundle written at the normal path — without needing a Fulcio-issued certificate it cannot
  // fabricate. The cryptographic half is covered by the identity and transparency controls.
  verifyBundleFn = verifyBundle,
}) {
  const digest = sha256(canonicalBytes);
  let raw;
  try { raw = await search(digest); } catch (e) {
    return { action: 'refuse', why: `the transparency log could not be queried (${e.message}); `
      + 'signing without knowing whether a record exists would risk a duplicate' };
  }
  // A malformed response must NOT collapse into "no record" and then sign. That is the single
  // worst failure mode available here: a transient shape change would mint a duplicate.
  if (!Array.isArray(raw)) {
    return { action: 'refuse', why: `the transparency log returned ${typeof raw}, not an array of `
      + 'uuids; a malformed response is not evidence that no record exists' };
  }
  const uuids = [...new Set(raw.map((u) => String(u)))].filter((u) => /^[0-9a-f]{40,80}$/i.test(u));
  if (uuids.length !== raw.length) {
    const dropped = raw.length - uuids.length;
    if (uuids.length === 0 && raw.length > 0) {
      return { action: 'refuse', why: `the transparency log returned ${raw.length} entr(y|ies) but `
        + 'none is a well-formed uuid; refusing rather than treating them as absent' };
    }
    process.stderr.write(`c19: ignored ${dropped} malformed or duplicate uuid(s) from the log\n`);
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
    try { bundle = rekorEntryToBundle(entry); } catch (e) {
      return { action: 'refuse', why: `the existing record could not be reconstructed: ${e.message}` };
    }
    // The identity verifier fails closed, so recovery must SUPPLY the expectations rather than
    // leave them undefined — omitting them made every recovery refuse, which is why `reuse` was
    // unreachable. They come from the canonical payload, which is itself the signed object and
    // therefore the authoritative statement of what this publication is about.
    const payload = JSON.parse(canonicalBytes.toString('utf8'));
    const problems = [
      ...bundleMatchesPayload(bundle, canonicalBytes),
      ...verifyBundleFn({
        bundle, artifactBytes: canonicalBytes, artifactDigestHex: digest, policy, trustedRoot,
        sourceSha: payload.sourceSha,
        workflowDigest: payload.workflowDigest,
        recovery: true,
        fetchRun: (runId, attempt) => gh.runAttempt(runId, attempt),
      }),
    ];
    if (problems.length > 0) {
      return { action: 'refuse', why: `an existing record was found but does not verify: ${problems[0]}` };
    }
    // Persist at the NORMAL bundle path, and keep recovery metadata OUT of the bundle: a
    // `_recoveredFromUuid` field is not part of the Sigstore schema and strict cosign parsing
    // rejects it, so the bundle would have failed the very verification it was reconstructed for.
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
    writeFileSync(`${bundlePath}.recovery.json`, JSON.stringify({
      recoveredFromUuid: uuids[0], recoveredAt: 'derived-from-publication-identity',
      publicationDigest: digest,
    }, null, 2));
    return { action: 'reuse', bundle, signings: 0, uuid: uuids[0] };
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
export const DELIVERY_PACKAGE_FILES = Object.freeze([
  'payload.json', 'bundle.sigstore.json', 'finalized-wrapper.zip',
  'trusted-root.json', 'tuf-root.json', 'metadata.json', 'VERIFY.md',
]);

/**
 * Step 15 — everything a foreign checkout needs after GitHub's artifacts expire.
 *
 * FAILS CLOSED. The previous version copied each file "if it exists", so an absent wrapper or
 * bundle produced a package that was quietly incomplete and an offline verifier would then fail
 * for a reason that says nothing about the evidence.
 */
export function persistDeliveryPackage({ out, acquisition, payloadPath, bundlePath, libDir, metadata }) {
  const dir = join(out, 'delivery');
  mkdirSync(dir, { recursive: true });
  const require0 = (from, name) => {
    if (!existsSync(from)) {
      throw new Error(`c19: the delivery package requires ${name}, and ${from} does not exist; `
        + 'refusing to persist an incomplete package that would fail verification for the wrong reason');
    }
    writeFileSync(join(dir, name), readFileSync(from));
  };
  require0(acquisition.wrapperPath, 'finalized-wrapper.zip');
  require0(acquisition.innerPath, acquisition.innerName);
  require0(`${dirname(acquisition.innerPath)}/${acquisition.innerName}.sha256`, `${acquisition.innerName}.sha256`);
  require0(payloadPath, 'payload.json');
  require0(bundlePath, 'bundle.sigstore.json');
  require0(join(libDir, 'c19-sigstore-trusted-root.json'), 'trusted-root.json');
  require0(join(libDir, 'c19-sigstore-tuf-root.json'), 'tuf-root.json');
  writeFileSync(join(dir, 'VERIFY.md'), verifyInstructions(metadata));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return dir;
}

/**
 * ── PACKAGE-LEVEL OFFLINE VERIFICATION ──
 *
 * The previous `verify-offline` asked for RECOVERY verification without GitHub and without the
 * identity expectations the fail-closed verifier requires, so it could never pass. It also ignored
 * the wrapper, the inner archive and the sidecar entirely — the three things the package exists to
 * carry.
 *
 * This verifies the PACKAGE: exact inventory, recomputed digests against the canonical payload, the
 * sidecar, the bundle against exact identity and independently held trust material. No GitHub call
 * is made, and the whole thing runs under OS-level network denial.
 */
export function verifyDeliveryPackage({ dir, policy, trustedRoot, cosignPath, now = Date.now() }) {
  const problems = [];
  const p = (name) => join(dir, name);

  // 1 — exact inventory. Missing, duplicate or unexpected mandatory files are all findings.
  const present = new Set(readdirSync(dir));
  const payloadRaw = existsSync(p('payload.json')) ? readFileSync(p('payload.json')) : null;
  let payload = null;
  if (payloadRaw !== null) { try { payload = JSON.parse(payloadRaw.toString('utf8')); } catch { /* reported below */ } }
  const innerName = payload?.finalizedInnerName;
  const expected = new Set([...DELIVERY_PACKAGE_FILES,
    ...(typeof innerName === 'string' ? [innerName, `${innerName}.sha256`] : [])]);
  for (const f of expected) {
    if (!present.has(f)) problems.push(`c19 package: required file ${j(f)} is missing`);
  }
  for (const f of present) {
    if (!expected.has(f)) problems.push(`c19 package: unexpected file ${j(f)}; the inventory is exact`);
  }
  if (payload === null) {
    problems.push('c19 package: payload.json is missing or is not JSON');
    return problems;
  }

  // 2 — recompute the digests the payload binds.
  const digestOf = (name) => createHash('sha256').update(readFileSync(p(name))).digest('hex');
  if (present.has('finalized-wrapper.zip')) {
    const got = digestOf('finalized-wrapper.zip');
    if (got !== payload.evidenceDigest) {
      problems.push(`c19 package: the wrapper hashes to ${got} but the signed payload binds `
        + `${j(payload.evidenceDigest)}`);
    }
  }
  if (typeof innerName === 'string' && present.has(innerName)) {
    const got = digestOf(innerName);
    if (got !== payload.finalizedInnerDigest) {
      problems.push(`c19 package: the inner evidence hashes to ${got} but the signed payload binds `
        + `${j(payload.finalizedInnerDigest)}`);
    }
    // 3 — the sidecar must agree with both.
    if (present.has(`${innerName}.sha256`)) {
      const text = readFileSync(p(`${innerName}.sha256`), 'utf8').trim();
      const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(text);
      if (m === null) problems.push('c19 package: the sidecar is not a `<digest>  <name>` record');
      else {
        if (m[1] !== got) problems.push(`c19 package: the sidecar declares ${m[1]}, not ${got}`);
        if (m[2].trim() !== innerName) problems.push(`c19 package: the sidecar names ${j(m[2].trim())}`);
      }
    }
  }

  // 4 — payload semantics, including a MEANINGFUL validity window.
  problems.push(...validatePayloadWindow(payload, now));
  if (payload.context !== domainContext(payload.purpose)) {
    problems.push(`c19 package: context ${j(payload.context)} does not domain-separate ${j(payload.purpose)}`);
  }
  if (canonicalize(payload) !== payloadRaw.toString('utf8')) {
    problems.push('c19 package: payload.json is not the canonical encoding of its own content');
  }

  // 5 — the bundle, against exact identity and the trust material HELD IN THE PACKAGE, which is
  //     itself checked against the source-owned anchor by the caller.
  if (present.has('bundle.sigstore.json')) {
    const bundle = JSON.parse(readFileSync(p('bundle.sigstore.json'), 'utf8'));
    problems.push(...verifyBundle({
      bundle, artifactBytes: payloadRaw, artifactDigestHex: createHash('sha256').update(payloadRaw).digest('hex'),
      policy, trustedRoot,
      sourceSha: payload.sourceSha, workflowDigest: payload.workflowDigest,
      recovery: true,
      // No GitHub. Offline means offline: the certificate's own invocation is read and compared to
      // the policy, and anything requiring a live API call is simply not part of this verification.
      fetchRun: undefined,
    }));
  }
  return problems;
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
