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
import { verifyTufChain } from './c19-tuf.mjs';
import { buildPayload, canonicalize, domainContext, publicationIdentity, REQUIRED_PAYLOAD_FIELDS } from './c19-attest.mjs';
import {
  loadTrustMaterial, verifyBundle, DELEGATED_TO_COSIGN, DECLARED_OFFLINE_LIMITS,
} from './c19-anchor.mjs';
import { rekorEntryToBundle, bundleMatchesPayload, BUNDLE_MEDIA_TYPE } from './c19-rekor.mjs';
import {
  verifyBlobArgv, signBlobArgv, COSIGN_PIN, verifyBinary, assetKey,
} from './c19-cosign.mjs';
import { runWithoutNetwork } from './c19-sandbox.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const j = (v) => JSON.stringify(v);

/** The modes. Exactly one is required; there is no default that signs. */
export const PIPELINE_MODES = Object.freeze(['plan', 'dry-run', 'publish', 'verify-offline']);

/**
 * Steps 1–4 — resolve the canonical publication identity, and refuse to be a duplicate.
 */
export function resolve({ gh, sha, invocation, requireCurrentTip = true, branch = 'main' }) {
  const problems = [];
  /**
   * An OLD successful run must not publish after main has moved on. Without this, re-triggering a
   * months-old finalizer would anchor evidence that no longer describes the branch - the run was
   * genuinely successful, which is exactly why the check has to be explicit.
   *
   * It is FIRST because it needs no run lookup and is decisive on its own. Resolving the source
   * first meant a superseded commit whose runs had also aged out reported "no push run exists",
   * which is a true statement about a different problem.
   */
  if (requireCurrentTip) {
    const tip = gh.branchTip(branch);
    if (String(tip) !== String(sha)) {
      problems.push(`c19: ${sha} is no longer the tip of ${branch} (${tip}); this publication is `
        + 'superseded, and an old successful run must not anchor evidence for a branch that has '
        + 'moved on');
      return { source: null, finalizer: null, problems };
    }
  }
  const source = resolveCanonicalSource({ gh, sha });
  const finalizer = resolveCanonicalFinalizer({ gh, sha, sourceRunId: source.runId });
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
  /**
   * Called at the LAST reversible moment - after the log has been searched, with nothing between it
   * and `sign-blob`. Returning a string refuses; returning nothing proceeds.
   */
  beforeSign,
  // The REAL verifier by default. Controls exercise it with a source-owned Sigstore fixture rather
  // than replacing it: substituting unconditional success proved only that the orchestration ran,
  // never that what it produced verifies.
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

  /**
   * ── THE LAST REVERSIBLE MOMENT ──
   *
   * This check used to sit further up, before the sandbox probes and before the Rekor search. Those
   * take real time - a functional isolation probe spawns children and waits on timeouts, and the
   * index query is a network round trip - and main can move inside them. "Immediately before
   * signing" has to mean immediately: here, after the log has told us there is nothing to reuse and
   * with nothing left between this line and `sign-blob`.
   */
  if (typeof beforeSign === 'function') {
    const stop = beforeSign();
    if (stop !== undefined && stop !== null) return { action: 'refuse', signings: 0, why: stop };
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
/**
 * The exact inventory. `tuf/` carries the delegation metadata WITHOUT which the claim that the TUF
 * root authenticates the trusted root cannot be checked at all - the package used to assert that
 * relationship while shipping neither the timestamp, the snapshot nor the targets that establish
 * it. `policy.json` travels too, because the identity expectations are what the bundle is verified
 * against, and a verifier that had to supply its own would not be verifying this delivery.
 */
export const DELIVERY_PACKAGE_FILES = Object.freeze([
  'payload.json', 'bundle.sigstore.json', 'finalized-wrapper.zip',
  'trusted-root.json', 'tuf-root.json',
  'tuf/timestamp.json', 'tuf/snapshot.json', 'tuf/targets.json',
  'policy.json', 'metadata.json', 'VERIFY.md',
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
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), readFileSync(from));
  };
  require0(acquisition.wrapperPath, 'finalized-wrapper.zip');
  require0(acquisition.innerPath, acquisition.innerName);
  require0(`${dirname(acquisition.innerPath)}/${acquisition.innerName}.sha256`, `${acquisition.innerName}.sha256`);
  require0(payloadPath, 'payload.json');
  require0(bundlePath, 'bundle.sigstore.json');
  require0(join(libDir, 'c19-sigstore-trusted-root.json'), 'trusted-root.json');
  require0(join(libDir, 'c19-sigstore-tuf-root.json'), 'tuf-root.json');
  // The delegation metadata, without which "the TUF root authenticates the trusted root" is an
  // assertion the package gives the verifier no way to check.
  mkdirSync(join(dir, 'tuf'), { recursive: true });
  for (const r of ['timestamp', 'snapshot', 'targets']) {
    require0(join(libDir, 'c19-tuf', `${r}.json`), join('tuf', `${r}.json`));
  }
  require0(join(libDir, 'c19-trust.json'), 'policy.json');
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
export function verifyDeliveryPackage({
  dir, policy, trustedRoot, cosignPath, anchor, now = Date.now(),
}) {
  const problems = [];
  const p = (name) => join(dir, name);

  // 1 — exact inventory. Missing, duplicate or unexpected mandatory files are all findings.
  const present = new Set(listPackageFiles(dir));
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

  /**
   * 4 — the payload contract, ENTIRELY.
   *
   * Checking the window and the context while leaving the rest unexamined meant a payload could
   * omit any binding field and still verify offline: the fields are what the signature is ABOUT,
   * so a missing one is not a cosmetic gap.
   */
  for (const f of REQUIRED_PAYLOAD_FIELDS) {
    if (payload[f] === undefined || payload[f] === '') {
      problems.push(`c19 package: the signed payload omits required field ${j(f)}`);
    }
  }
  problems.push(...validatePayloadWindow(payload, now));
  if (payload.context !== domainContext(payload.purpose)) {
    problems.push(`c19 package: context ${j(payload.context)} does not domain-separate ${j(payload.purpose)}`);
  }
  if (canonicalize(payload) !== payloadRaw.toString('utf8')) {
    problems.push('c19 package: payload.json is not the canonical encoding of its own content');
  }

  /**
   * 5 — THE PACKAGED TRUST MATERIAL, against an anchor held independently of the package.
   *
   * The package used to ship `trusted-root.json` and `tuf-root.json` and then verify against the
   * verifier's own copies, so the shipped files were decoration: substituting them changed
   * nothing, and the instructions still claimed the TUF root authenticated the trusted root while
   * the delegation metadata that would establish it was not present at all.
   *
   * Now the packaged chain is verified on its own terms, and the result must equal the anchor the
   * reviewer holds from the reviewed source SHA. Expiry is not required - see the freshness split
   * in c19-tuf.mjs - but the pinned minimum versions are.
   */
  let packagedTrustedRoot = null;
  const packagedPolicy = readJsonOrNull(p('policy.json'));
  if (anchor === undefined) {
    problems.push('c19 package: no independently held source anchor was supplied; verifying the '
      + "package's trust material against the package's own trust material proves nothing");
  } else if (present.has('trusted-root.json') && present.has('tuf-root.json')
      && present.has('tuf/timestamp.json') && present.has('tuf/snapshot.json')
      && present.has('tuf/targets.json')) {
    const trustedRootBytes = readFileSync(p('trusted-root.json'));
    problems.push(...verifyTufChain({
      root: readJsonOrNull(p('tuf-root.json')),
      timestamp: readJsonOrNull(p('tuf/timestamp.json')),
      snapshot: readJsonOrNull(p('tuf/snapshot.json')),
      targets: readJsonOrNull(p('tuf/targets.json')),
      targetName: 'trusted_root.json', targetBytes: trustedRootBytes, now,
      purpose: 'historical', minimumVersions: anchor.minimumVersions ?? {},
    }).map((x) => `c19 package: ${x}`));
    const trHex = createHash('sha256').update(trustedRootBytes).digest('hex');
    if (trHex !== anchor.trustedRootSha256) {
      problems.push(`c19 package: the packaged trusted root hashes to ${trHex}, but the source-held `
        + `anchor pins ${j(anchor.trustedRootSha256)}`);
    }
    const rootHex = createHash('sha256').update(readFileSync(p('tuf-root.json'))).digest('hex');
    if (anchor.tufRootSha256 !== undefined && rootHex !== anchor.tufRootSha256) {
      problems.push(`c19 package: the packaged TUF root hashes to ${rootHex}, but the source-held `
        + `anchor pins ${j(anchor.tufRootSha256)}`);
    }
    if (packagedPolicy === null) problems.push('c19 package: policy.json is missing or not JSON');
    else if (anchor.policySha256 !== undefined) {
      const polHex = createHash('sha256').update(readFileSync(p('policy.json'))).digest('hex');
      if (polHex !== anchor.policySha256) {
        problems.push(`c19 package: the packaged trust policy hashes to ${polHex}, but the `
          + `source-held anchor pins ${j(anchor.policySha256)}`);
      }
    }
    if (problems.length === 0 || trHex === anchor.trustedRootSha256) {
      try { packagedTrustedRoot = JSON.parse(trustedRootBytes.toString('utf8')); } catch {
        problems.push('c19 package: trusted-root.json is not JSON');
      }
    }
  }

  /**
   * 6 — the bundle, against exact identity and the trust material FROM THE PACKAGE (now that it
   *     has been proved equal to the anchor), with no live API of any kind.
   */
  const effectivePolicy = packagedPolicy ?? policy;
  const effectiveRoot = packagedTrustedRoot ?? trustedRoot;
  if (present.has('bundle.sigstore.json')) {
    const bundle = readJsonOrNull(p('bundle.sigstore.json'));
    if (bundle === null) problems.push('c19 package: bundle.sigstore.json is not JSON');
    else {
      problems.push(...verifyBundle({
        bundle, artifactBytes: payloadRaw,
        artifactDigestHex: createHash('sha256').update(payloadRaw).digest('hex'),
        policy: effectivePolicy, trustedRoot: effectiveRoot,
        sourceSha: payload.sourceSha, workflowDigest: payload.workflowDigest,
        now,
        // Offline identity: the certificate's own invocation is checked against the pinned policy
        // and against this payload's bindings. No live run object is consulted, and none is
        // pretended - see DECLARED_OFFLINE_LIMITS.
        offlineIdentity: true, fetchRun: undefined,
      }));
    }
  }

  /**
   * 7 — THE DELEGATED CHECKS, EXECUTED.
   *
   * `cosignPath` was accepted and never used, so the package verifier omitted every check the
   * module explicitly delegates - SCT signature verification, full path building, canonical bundle
   * schema validation - while listing them as delegated. A delegate that is never invoked is a gap
   * with a label on it. Both verifiers must pass.
   */
  if (cosignPath === undefined) {
    problems.push('c19 package: no cosign binary was supplied, so the delegated Sigstore checks '
      + `(${DELEGATED_TO_COSIGN.length}) did not run; delivery standing requires BOTH verifiers`);
  } else if (present.has('bundle.sigstore.json') && present.has('trusted-root.json')) {
    const binary = verifyCosignBinary(cosignPath);
    if (binary !== null) problems.push(`c19 package: ${binary}`);
    else {
      const argv = verifyBlobArgv({
        cosignPath, bundlePath: p('bundle.sigstore.json'), payloadPath: p('payload.json'),
        certificateIdentity: effectivePolicy?.identity?.subjectAlternativeName,
        oidcIssuer: effectivePolicy?.identity?.issuer,
        // The PACKAGED trusted root, proved equal to the anchor above.
        trustedRootPath: p('trusted-root.json'), offline: true,
      });
      // Already inside the OS boundary: `verify-offline` re-executes the whole verifier there and
      // proves its own isolation, so cosign is a descendant of a constrained process.
      const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
      if (r.status !== 0) {
        problems.push(`c19 package: pinned cosign ${COSIGN_PIN.version_tag} rejected the bundle: `
          + `${(r.stderr || r.stdout || '').trim().slice(-400)}`);
      }
    }
  }
  return problems;
}

/** Files in the package, including one level of `tuf/`, as package-relative names. */
function listPackageFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      for (const f of readdirSync(join(dir, e.name))) out.push(`${e.name}/${f}`);
    } else out.push(e.name);
  }
  return out;
}

const readJsonOrNull = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};

/** The binary must be the pinned one, authenticated BEFORE any code from it runs. */
function verifyCosignBinary(cosignPath) {
  try {
    verifyBinary(cosignPath, assetKey());
    return null;
  } catch (e) { return e.message; }
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
| \`trusted-root.json\` | Sigstore trust material |
| \`tuf-root.json\` | the TUF root |
| \`tuf/*.json\` | timestamp, snapshot and targets — the delegation metadata that actually connects the two |
| \`policy.json\` | the identity expectations the bundle is verified against |

## The anchor is NOT in this directory, and must not be

The TUF root here authenticates the trusted root here — and would equally authenticate a matched
pair substituted for both. Verify this package against the source-owned anchor from the reviewed
commit, never against the copies travelling with it:

    git clone https://github.com/${m.repo ?? '<owner>/<repo>'} src
    git -C src checkout ${m.sourceSha ?? '<REVIEWED SHA>'}   # the exact SHA, never a moving branch

## Verify

    node src/scripts/gate/c19-deliver.mjs verify-offline \\
      --package . --out /tmp/c19-verify --cosign <pinned ${COSIGN_PIN.version_tag} binary>

That re-executes itself inside an OS network boundary and proves from inside that it cannot reach
the network; checks the inventory; recomputes every digest against the signed payload; verifies
this package's TUF chain against the source-held anchor; verifies the bundle; and runs pinned
cosign. Both verifiers must pass.

The equivalent single cosign command, if you would rather drive it yourself:

    cosign verify-blob --bundle bundle.sigstore.json \\
      --certificate-identity ${m.certificateIdentity ?? '<SAN>'} \\
      --certificate-oidc-issuer ${m.oidcIssuer ?? '<issuer>'} \\
      --trusted-root trusted-root.json --offline payload.json

## Freshness

TUF metadata is verified by signature, threshold and the minimum versions the source-held policy
pins — NOT by expiry. Sigstore's timestamp role expires within days by design and this payload
declares a window measured in years, so requiring a current timestamp would mean the package
stopped verifying days after it was built. Expiry IS enforced when the source-owned snapshot is
refreshed from the Sigstore repository.

## What this proves, and what it does not

It proves the workflow identity that signed, the exact bytes signed, log inclusion and a
publication time window. It does **not** prove that claims inside the evidence are true — see
\`c19-authority.mjs\` for the claim-to-authority ledger.

Offline verification additionally cannot establish:

${DECLARED_OFFLINE_LIMITS.map((l) => `- ${l}`).join('\n')}
`;
