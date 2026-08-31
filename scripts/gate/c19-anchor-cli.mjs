#!/usr/bin/env node
/**
 * C19 — THE ANCHOR COMMAND.
 *
 * Acquisition and verification live behind one command so the workflow file cannot drift from what
 * a reviewer runs locally. Everything the workflow does is a subcommand here; nothing important
 * happens in YAML.
 *
 *   selftest --offline            trust material, identity policy and the verifier's own algebra,
 *                                 with the network proven unused
 *   leftovers                     no owned process and no owned docker resource survived
 *   publish --dry-run             everything except the irreversible step
 *   publish --recover-or-publish  find an existing Rekor entry for these exact bytes and reuse it,
 *                                 or sign once if there is none
 *   verify --offline              judge a delivered bundle with no network at all
 *
 * ── THE OIDC TOKEN IS NEVER PERSISTED ──
 *
 * cosign requests the token itself, in-process, at the moment of signing. This command never reads
 * it, never writes it to a file, an output, a step summary or a log, and never puts it in argv.
 * The only thing that leaves the signing step is the bundle.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadTrustMaterial, verifyBundle, verifyIdentity, certificateIdentity, pinnedRekorKeys,
  pinnedCaCertificates, verifyInclusionProof, verifyRekorSet, leafHash, nodeHash,
} from './lib/c19-anchor.mjs';
import {
  canonicalize, domainContext, buildPayload, publicationIdentity,
  REQUIRED_PAYLOAD_FIELDS, PUBLICATION_IDENTITY_FIELDS,
} from './lib/c19-attest.mjs';
import { C19_FROZEN, route } from './lib/c19-criteria.mjs';
import { verifyAuthorityLedger, closedClaims, openLimits } from './lib/c19-authority.mjs';
import { DOCKER_RUN_LABEL } from './lib/c18-contract.mjs';

/** Any resource this gate owns, whatever its run id — the residue question is "is anything left". */
const DOCKER_RUN_LABEL_ANY = '';
import {
  residualOwnedProcesses, dockerInventory, CONTAINMENT_FAILURE_EXIT,
} from './c18-watchdog.mjs';
import { withNetworkDenied } from './lib/c19-offline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, 'lib');
const sha256hex = (b) => createHash('sha256').update(b).digest('hex');
const say = (s) => process.stdout.write(`${s}\n`);
const die = (s) => { process.stderr.write(`C19: ${s}\n`); process.exit(1); };

/** Everything the verifier can decide about itself, without a bundle and without a network. */
async function selftest(offline) {
  const run = async () => {
    const { policy, trustedRoot } = loadTrustMaterial(LIB);
    const problems = [];

    // 1 — the trust material is the TUF-authenticated material, not something downloaded.
    if (policy.tuf?.trustedRootSha256 === undefined) problems.push('the policy declares no TUF digest');
    const cas = pinnedCaCertificates(trustedRoot);
    const logs = pinnedRekorKeys(trustedRoot);
    if (cas.length === 0) problems.push('no Fulcio certificate authority is pinned');
    if (logs.size === 0) problems.push('no Rekor log key is pinned');

    // 2 — the identity policy is EXACT. A pattern anywhere is a finding, not a convenience.
    for (const [k, v] of Object.entries(policy.identity ?? {})) {
      if (k.startsWith('_')) continue;
      if (typeof v !== 'string' || v === '') { problems.push(`identity.${k} is not an exact value`); continue; }
      if (/[*?]|\.\*|\.\+|\\/.test(v)) problems.push(`identity.${k} looks like a pattern (${v}); exact values only`);
    }

    // 3 — a signer the evidence process controls can never carry delivery standing.
    for (const [id, s] of Object.entries(policy.signers ?? {})) {
      if (s.kind === 'ed25519-local' && s.deliveryCapable !== false) {
        problems.push(`signer '${id}' is a local seam but is marked delivery-capable`);
      }
    }

    // 4 — the honesty ledger holds.
    problems.push(...verifyAuthorityLedger());

    // 5 — the frozen criteria are present and the routing rule behaves.
    if (C19_FROZEN.attackFamilies.length === 0) problems.push('the frozen attack matrix is empty');
    if (route('a-brand-new-attack-class').gate !== 'C20') problems.push('a new attack class does not route to C20');
    if (route({ invariant: 'exact-identity-binding' }).gate !== 'C19') {
      problems.push('a constitutional violation does not reopen C19');
    }
    return { policy, trustedRoot, problems, cas: cas.length, logs: logs.size };
  };

  const { result, attempts } = offline ? await withNetworkDenied(run) : { result: await run(), attempts: [] };
  say(`C19 selftest ${offline ? '(network denied)' : '(online permitted)'}`);
  say(`  pinned Fulcio certificates : ${result.cas}`);
  say(`  pinned Rekor log keys      : ${result.logs}`);
  say(`  identity fields (all exact): ${Object.keys(result.policy.identity).filter((k) => !k.startsWith('_')).length}`);
  say(`  claims closed by authority : ${closedClaims().join(', ') || '(none)'}`);
  say(`  open observational limits  : ${openLimits().length}`);
  say(`  frozen attack families     : ${C19_FROZEN.attackFamilies.length}`);
  say(`  network attempts observed  : ${attempts.length}`);
  if (result.problems.length > 0) {
    for (const p of result.problems) process.stderr.write(`  FINDING: ${p}\n`);
    die(`selftest failed with ${result.problems.length} finding(s)`);
  }
  say('C19 selftest: PASS');
}

/**
 * No owned process and no owned docker resource may survive a completed run.
 *
 * This lives here rather than in the workflow because the shell version was wrong in a way that
 * only a hosted run revealed: `xargs`/`grep` exit non-zero when they match NOTHING, and under
 * `set -o pipefail` that turned the SUCCESS case — zero surviving processes — into a step failure
 * (exit 123 on Linux, exit 1 on macOS), without even printing a count. Logic that decides a gate
 * belongs in source that controls can exercise.
 */
function leftovers({ dockerOnly = false } = {}) {
  // `--docker-only` exists for controls that must exercise the DOCKER state machine from inside a
  // live, watchdog-supervised run. In that context owned processes legitimately exist — they are
  // the run itself — so asserting on global process residue there would test the harness rather
  // than the code. The full command still checks both.
  if (!dockerOnly) {
  const survivors = residualOwnedProcesses().filter((p) => p !== process.pid);
  say(`C19 leftovers: ${survivors.length} process(es) still carry a non-empty ownership chain`);
  if (survivors.length > 0) {
    for (const p of survivors) process.stderr.write(`  stranded pid: ${p}\n`);
    die('a completed run left owned processes behind');
  }
  }

  // ── DOCKER PRESENT, ABSENT, OR BROKEN ARE THREE DIFFERENT ANSWERS ──
  //
  // A macOS runner has no Docker daemon at all. Nothing could have created a container there, so
  // residue is zero BY CONSTRUCTION — but reporting that as "verified zero" would claim Docker
  // parity this platform never had. A daemon that exists and cannot be queried is different again:
  // ownership is UNDETERMINED and that is a containment failure, not an absence of residue.
  const dockerPresent = spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0;
  if (!dockerPresent) {
    say('C19 leftovers: docker is not installed on this host, so no governed container, network or '
      + 'volume could have been created here');
    say('C19 leftovers: PASS for processes; docker residue NOT APPLICABLE on this platform '
      + '(this is not a claim of docker parity)');
    return;
  }

  const inv = dockerInventory(DOCKER_RUN_LABEL_ANY);
  const total = inv.containers.length + inv.networks.length + inv.volumes.length;
  say(`C19 leftovers: containers=${inv.containers.length} networks=${inv.networks.length} `
    + `volumes=${inv.volumes.length} (ownership ${inv.determined ? 'determined' : 'UNDETERMINED'})`);
  if (!inv.determined) {
    process.stderr.write('  docker is installed but one or more resource queries failed\n');
    process.stderr.write(`  exiting ${CONTAINMENT_FAILURE_EXIT}: inability to determine ownership is `
      + 'a containment failure, not an absence of residue\n');
    process.exit(CONTAINMENT_FAILURE_EXIT);
  }
  if (total > 0) {
    for (const c of [...inv.containers, ...inv.networks, ...inv.volumes]) {
      process.stderr.write(`  stranded resource: ${c}\n`);
    }
    process.exit(CONTAINMENT_FAILURE_EXIT);
  }
  say('C19 leftovers: PASS (zero owned processes and zero owned docker resources)');
}

/**
 * ── SEARCHING THE LOG, WHICH IS WHAT MAKES RECOVERY IDEMPOTENT ──
 *
 * The previous "recovery" ran `cosign verify-blob --help` and then checked whether a local bundle
 * file existed. It never contacted Rekor. So the exact failure it claimed to handle — the log
 * accepted an entry, then the runner died before writing the bundle — produced a retry that found
 * no local file and SIGNED AGAIN, creating a second identity assertion for the same bytes and
 * turning the log into a record of our retries.
 *
 * This asks the log. Publication is an online step by nature, so a network call here is correct;
 * OFFLINE verification never calls this.
 */
export async function searchRekorByDigest(digestHex, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl('https://rekor.sigstore.dev/api/v1/index/retrieve', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ hash: `sha256:${digestHex}` }),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`rekor index query failed with HTTP ${res.status}`);
  const uuids = await res.json();
  return Array.isArray(uuids) ? uuids : [];
}

/** Retrieve one log entry by uuid, so a found record can be verified rather than assumed good. */
export async function fetchRekorEntry(uuid, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`https://rekor.sigstore.dev/api/v1/log/entries/${encodeURIComponent(uuid)}`);
  if (!res.ok) throw new Error(`rekor entry fetch failed with HTTP ${res.status}`);
  const body = await res.json();
  const [, entry] = Object.entries(body)[0] ?? [];
  return entry ?? null;
}

/**
 * Rebuild a Sigstore bundle from a Rekor entry.
 *
 * A log entry carries everything a bundle needs — the certificate, the signature and the log proof
 * — so a publication whose bundle was lost after acceptance can be recovered rather than re-signed.
 * If any part is absent, this returns null and the caller fails closed: an incomplete bundle that
 * looked complete would be worse than no recovery at all.
 */
export function rekorEntryToBundle(entry) {
  let body;
  try {
    body = JSON.parse(Buffer.from(String(entry?.body ?? entry?.canonicalizedBody ?? ''), 'base64').toString('utf8'));
  } catch { return null; }
  const spec = body?.spec ?? {};
  const certPem = spec?.signature?.publicKey?.content;
  const signature = spec?.signature?.content;
  const digest = spec?.data?.hash?.value;
  if (typeof certPem !== 'string' || typeof signature !== 'string' || typeof digest !== 'string') return null;
  let certDer;
  try {
    const pem = Buffer.from(certPem, 'base64').toString('utf8');
    const m = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
    if (m === null) return null;
    certDer = m[1].replace(/\s+/g, '');
  } catch { return null; }
  const verification = entry?.verification ?? {};
  return {
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: {
      certificate: { rawBytes: certDer },
      tlogEntries: [{
        logIndex: String(entry.logIndex),
        logId: { keyId: entry.logID ?? entry.logId?.keyId },
        integratedTime: String(entry.integratedTime),
        canonicalizedBody: entry.body ?? entry.canonicalizedBody,
        inclusionPromise: { signedEntryTimestamp: verification.signedEntryTimestamp },
        inclusionProof: verification.inclusionProof,
      }],
    },
    messageSignature: {
      messageDigest: { algorithm: 'SHA2_256', digest: Buffer.from(digest, 'hex').toString('base64') },
      signature,
    },
  };
}

/**
 * Decide what to do about an already-published record.
 *
 * Returns one of:
 *   { action: 'reuse',  entry }   an existing record matches these exact bytes and verifies
 *   { action: 'sign' }            the log has no record for these bytes
 *   { action: 'refuse', why }     ambiguous or unverifiable — fail closed rather than sign again
 *
 * Ambiguity is a refusal, not a tiebreak. Two records over the same digest mean something happened
 * that this contract does not describe, and signing a third is the worst available response.
 */
export async function decideRecovery({ digestHex, expectedIdentity, search, fetchEntry, verifyEntry }) {
  // `expectedIdentity` is NOT optional decoration. A recovered record must be verified against the
  // identity this publication requires, or "recovery" means accepting whatever the log happens to
  // hold for that digest.
  if (expectedIdentity === undefined || expectedIdentity === null
    || Object.keys(expectedIdentity).length === 0) {
    return { action: 'refuse', why: 'no expected identity was supplied for recovery; a record '
      + 'accepted without an identity check is not a recovered publication' };
  }
  let uuids;
  try { uuids = await search(digestHex); } catch (e) {
    return { action: 'refuse', why: `the transparency log could not be queried (${e.message}); `
      + 'signing without knowing whether a record already exists would risk a duplicate' };
  }
  if (uuids.length === 0) return { action: 'sign' };
  if (uuids.length > 1) {
    return { action: 'refuse', why: `${uuids.length} log records already exist for this digest; an `
      + 'ambiguous set is refused rather than resolved by guessing' };
  }
  let entry;
  try { entry = await fetchEntry(uuids[0]); } catch (e) {
    return { action: 'refuse', why: `an existing record was found but could not be retrieved (${e.message})` };
  }
  if (entry === null) return { action: 'refuse', why: 'an existing record was found but came back empty' };
  const problems = verifyEntry(entry, expectedIdentity);
  if (problems.length > 0) {
    return { action: 'refuse', why: `an existing record was found but does not verify: ${problems[0]}` };
  }
  return { action: 'reuse', entry };
}

/**
 * PUBLICATION. Requires an artifact, a payload and a bundle path — there is nothing to publish
 * without them, and a command that "succeeds" having published nothing is how a delivery chain
 * comes to be believed without existing.
 */
async function publish({ dryRun, recoverOrPublish, artifactPath, payloadPath, bundlePath }) {
  /**
   * EXACTLY ONE MODE, STATED EXPLICITLY.
   *
   * The dispatcher passed `recoverOrPublish` and `publish()` never accepted it, so invoking
   * `publish` with NEITHER flag fell through to the real signing path. A command that signs
   * because nobody said not to is the most dangerous possible default for an irreversible action.
   */
  if (dryRun && recoverOrPublish) {
    die('--dry-run and --recover-or-publish are mutually exclusive; state exactly one mode');
  }
  if (!dryRun && !recoverOrPublish) {
    die('publish requires an explicit mode: --dry-run or --recover-or-publish. Refusing to sign '
      + 'merely because no mode was stated.');
  }
  const need = { SOURCE_SHA: process.env.SOURCE_SHA, RUN_URI: process.env.RUN_URI };
  for (const [k, v] of Object.entries(need)) {
    if (v === undefined || v === '') die(`${k} is not set; a publication must name what it attests`);
  }
  if (artifactPath === undefined) die('--artifact is required; there is nothing to publish without it');
  if (payloadPath === undefined) die('--payload is required; the signed object is the canonical payload');
  if (bundlePath === undefined) die('--bundle is required; the bundle must be persisted to be verifiable');
  if (!existsSync(artifactPath)) die(`the artifact ${artifactPath} does not exist`);
  if (!existsSync(payloadPath)) die(`the payload ${payloadPath} does not exist`);

  const payloadBytes = readFileSync(payloadPath);
  const payloadDigest = sha256hex(payloadBytes);
  const artifactDigest = sha256hex(readFileSync(artifactPath));
  say(`C19 publish: artifact ${artifactPath}`);
  say(`  artifact sha256 ${artifactDigest}`);
  say(`  payload  sha256 ${payloadDigest}  (the signed object)`);

  const cosign = process.env.COSIGN ?? 'cosign';
  const { policy, trustedRoot } = loadTrustMaterial(LIB);

  // ── RECOVERY FIRST, ALWAYS ──
  const decision = await decideRecovery({
    digestHex: payloadDigest,
    // The identity this publication requires. Recovery verifies against it; an empty object is
    // refused by decideRecovery precisely so this can never quietly become a no-op again.
    expectedIdentity: {
      sourceSha: process.env.SOURCE_SHA,
      signerRunId: process.env.SIGNER_RUN_ID,
      workflowDigest: process.env.WORKFLOW_DIGEST,
    },
    search: (d) => searchRekorByDigest(d),
    fetchEntry: (u) => fetchRekorEntry(u),
    verifyEntry: (entry) => verifyRekorSet(entry, trustedRoot),
  });
  say(`  recovery decision: ${decision.action}${decision.why ? ` — ${decision.why}` : ''}`);

  if (decision.action === 'refuse') die(decision.why);
  if (decision.action === 'reuse') {
    // ── RECONSTRUCT THE ACTUAL BUNDLE AT THE REQUESTED PATH ──
    //
    // The previous version wrote `${bundlePath}.recovered.json` and returned. Every downstream step
    // — offline verification, foreign-checkout verification, persistence — expects `bundlePath`, so
    // recovery could never actually complete. It reported success and left nothing usable.
    const bundle = rekorEntryToBundle(decision.entry);
    if (bundle === null) {
      die('an existing record was found but a Sigstore bundle could not be reconstructed from it; '
        + 'failing closed rather than signing a second time');
    }
    writeFileSync(bundlePath, JSON.stringify(bundle));
    // The reconstructed bundle must satisfy the SAME verification the freshly signed one does.
    const problems = verifyBundle({
      bundle, artifactBytes: payloadBytes, artifactDigestHex: payloadDigest,
      policy, trustedRoot,
      sourceSha: process.env.SOURCE_SHA,
      runId: process.env.SIGNER_RUN_ID,
      runAttempt: process.env.SIGNER_RUN_ATTEMPT,
      workflowDigest: process.env.WORKFLOW_DIGEST,
      requireDeliveryStanding: true,
    });
    if (problems.length > 0) {
      for (const p of problems) process.stderr.write(`  ${p}\n`);
      die('the recovered bundle does not verify; refusing to reuse it and refusing to sign again');
    }
    say('C19 publish: an existing Rekor record already attests these exact bytes; reconstructed and '
      + `verified the bundle at ${bundlePath}, performing ZERO signing operations`);
    return;
  }
  if (dryRun) {
    say('C19 publish: DRY RUN — the log has no record for these bytes, and a real run would sign '
      + 'exactly once here. Nothing was signed and nothing was published.');
    return;
  }

  const r = spawnSync(cosign, ['sign-blob', '--yes', '--bundle', bundlePath, payloadPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) die(`cosign sign-blob failed (exit ${r.status})`);
  if (!existsSync(bundlePath)) die('cosign reported success but no bundle was persisted');
  say(`C19 publish: signed once and recorded in Rekor; bundle at ${bundlePath}`);
}

/**
 * VERIFICATION. Refuses to "succeed" without something to verify — the previous version fell back
 * to a trust-material selftest and exited 0, so a workflow step named "verify the published bundle"
 * verified no bundle at all.
 */
async function verify({ offline, requireDeliveryStanding, artifactPath, payloadPath, bundlePath }) {
  if (artifactPath === undefined || bundlePath === undefined || payloadPath === undefined) {
    die('verify requires --artifact, --payload and --bundle; a verification with nothing to verify '
      + 'must fail rather than report success');
  }
  for (const [flag, path] of [['--artifact', artifactPath], ['--payload', payloadPath], ['--bundle', bundlePath]]) {
    if (!existsSync(path)) die(`${flag} ${path} does not exist`);
  }
  const run = async () => {
    const { policy, trustedRoot } = loadTrustMaterial(LIB);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const payloadBytes = readFileSync(payloadPath);
    const artifactBytes = readFileSync(artifactPath);
    const problems = [];

    // 1 — the payload is canonical, well-formed, and binds the artifact we were handed.
    // The whole signed contract, against expectations established from GitHub's API rather than
    // from the document being judged.
    problems.push(...verifyPayloadDocument(payloadBytes, expectationsFromEnv()));
    // And the delivered wrapper must be the one the payload names.
    const wrapperDigest = sha256hex(artifactBytes);
    if (process.env.EVIDENCE_DIGEST !== undefined && wrapperDigest !== process.env.EVIDENCE_DIGEST) {
      problems.push(`c19 payload: the delivered artifact hashes to ${wrapperDigest} but the run `
        + `established ${process.env.EVIDENCE_DIGEST}`);
    }
    // 2 — the signature, certificate, identity and log record all agree, over the PAYLOAD bytes.
    problems.push(...verifyBundle({
      bundle, artifactBytes: payloadBytes, artifactDigestHex: sha256hex(payloadBytes),
      policy, trustedRoot,
      sourceSha: process.env.SOURCE_SHA,
      runId: process.env.SIGNER_RUN_ID,
      runAttempt: process.env.SIGNER_RUN_ATTEMPT,
      workflowDigest: process.env.WORKFLOW_DIGEST,
      requireDeliveryStanding,
    }));
    // 3 — the delegated Sigstore checks, EXECUTED rather than listed.
    if (requireDeliveryStanding) {
      problems.push(...runCosignVerify({ payloadPath, bundlePath, offline }));
    }
    return problems;
  };
  const { result: problems, attempts } = offline
    ? await withNetworkDenied(run)
    : { result: await run(), attempts: [] };
  say(`C19 verify ${offline ? '(OFFLINE — network denied)' : '(ONLINE)'}: `
    + `${problems.length} finding(s), ${attempts.length} network attempt(s)`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  if (problems.length > 0) die('verification failed');
  say('C19 verify: PASS');
}

/**
 * Build the canonical payload that will actually be signed.
 *
 * The signed object is this document, NOT the evidence ZIP. Signing the archive alone would carry
 * no purpose, no domain separation, no nonce, no validity window and no binding to the source run,
 * the finalizer run or the tree the evidence came from — all of which the frozen design requires.
 */
function buildPayloadFile(outPath) {
  const need = [
    'SOURCE_SHA', 'SOURCE_TREE', 'SOURCE_RUN_ID', 'SOURCE_RUN_ATTEMPT', 'SOURCE_EVENT',
    'FINALIZER_RUN_ID', 'FINALIZER_RUN_ATTEMPT', 'FINALIZER_COMPLETED_AT',
    'EVIDENCE_ARTIFACT_ID', 'EVIDENCE_ARTIFACT_NAME', 'EVIDENCE_DIGEST',
    'FINALIZED_INNER_NAME', 'FINALIZED_INNER_DIGEST', 'WORKFLOW_DIGEST',
  ];
  const env = {};
  for (const k of need) {
    const v = process.env[k];
    if (v === undefined || v === '') die(`${k} is not set; every binding in the payload is mandatory`);
    env[k] = v;
  }
  const { policy } = loadTrustMaterial(LIB);

  // The validity window is anchored to the FINALIZER's completion time, which is an external,
  // stable fact about this publication — not to `Date.now()`, which would differ on every retry
  // and change the payload digest, making the prior entry unfindable.
  const anchor = Date.parse(env.FINALIZER_COMPLETED_AT);
  if (!Number.isFinite(anchor)) die('FINALIZER_COMPLETED_AT is not an instant');
  const iso = (ms) => new Date(ms).toISOString();

  const facts = {
    sourceSha: env.SOURCE_SHA,
    sourceTree: env.SOURCE_TREE,
    sourceRunId: env.SOURCE_RUN_ID,
    sourceRunAttempt: env.SOURCE_RUN_ATTEMPT,
    sourceEvent: env.SOURCE_EVENT,
    finalizerRunId: env.FINALIZER_RUN_ID,
    finalizerRunAttempt: env.FINALIZER_RUN_ATTEMPT,
    workflowRef: policy.identity.workflowRef,
    workflowDigest: env.WORKFLOW_DIGEST,
    evidenceArtifactId: env.EVIDENCE_ARTIFACT_ID,
    evidenceArtifactName: env.EVIDENCE_ARTIFACT_NAME,
    evidenceDigest: env.EVIDENCE_DIGEST,
    finalizedInnerName: env.FINALIZED_INNER_NAME,
    finalizedInnerDigest: env.FINALIZED_INNER_DIGEST,
  };
  // Derived, not drawn. A random nonce made every retry a different publication.
  const identity = publicationIdentity(facts);

  const payload = buildPayload('run-anchor', {
    ...facts,
    nonce: identity,
    issuedAt: iso(anchor),
    notBefore: iso(anchor - 60_000),
    expiresAt: iso(anchor + 365 * 24 * 3600 * 1000),
    signerId: 'sigstore-fulcio',
    keyVersion: 'fulcio-keyless',
    algorithm: policy.algorithms[0],
  });
  const canonical = canonicalize(payload);
  writeFileSync(outPath, canonical);
  say(`C19 payload: ${outPath}`);
  say(`  publication identity ${identity}`);
  say(`  sha256 ${sha256hex(Buffer.from(canonical, 'utf8'))}  (the signed object; stable across retries)`);
  say(`  binds finalized inner ${env.FINALIZED_INNER_DIGEST} inside wrapper ${env.EVIDENCE_DIGEST}`);
}

/**
 * ── THE DELEGATED CHECKS, ACTUALLY EXECUTED ──
 *
 * `DELEGATED_TO_COSIGN` listed SCT signature verification, full X.509 path validation and canonical
 * bundle validation — and nothing ever invoked cosign. A comment naming a delegate is not
 * delegation; it is a gap with a label on it.
 *
 * This runs the pinned verifier against the bundle with the EXACT certificate identity and issuer,
 * offline against the source-owned trusted root. Its verdict is required for delivery standing:
 * the repository-specific checks in `c19-anchor.mjs` and this stand alongside each other, and
 * neither substitutes for the other.
 */
function runCosignVerify({ payloadPath, bundlePath, offline }) {
  const cosign = process.env.COSIGN ?? 'cosign';
  const { policy } = loadTrustMaterial(LIB);
  const probe = spawnSync(cosign, ['version'], { encoding: 'utf8' });
  if (probe.error !== undefined || probe.status !== 0) {
    return [`c19 cosign: the pinned verifier is not available (${probe.error?.code ?? `exit ${probe.status}`}); `
      + 'delivery standing requires the delegated Sigstore checks to actually run'];
  }
  const args = [
    'verify-blob',
    '--bundle', bundlePath,
    '--certificate-identity', policy.identity.subjectAlternativeName,
    '--certificate-oidc-issuer', policy.identity.issuer,
    '--trusted-root', join(LIB, policy.tuf.trustedRootFile),
  ];
  if (offline) args.push('--offline');
  args.push(payloadPath);
  const r = spawnSync(cosign, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    return [`c19 cosign: verify-blob rejected the bundle (exit ${r.status}): `
      + `${((r.stderr ?? '') + (r.stdout ?? '')).trim().slice(0, 300)}`];
  }
  say('  cosign verify-blob: PASS (exact identity and issuer, offline against the pinned root)');
  return [];
}

/**
 * ── THE WHOLE SIGNED CONTRACT, CHECKED AGAINST INDEPENDENT EXPECTATIONS ──
 *
 * The previous version checked canonical form, the evidence digest, the source SHA, and that
 * `expiresAt > notBefore`. Everything else in the payload was signed and then ignored — so a
 * payload binding the wrong finalizer run, the wrong artifact id, the wrong workflow, an expired
 * window or a different purpose verified clean. A field that is signed but never compared is
 * decoration.
 *
 * Every expectation here is established independently of the payload — from the environment the
 * workflow sets from GitHub's own API, not from the document being judged.
 */
function verifyPayloadDocument(payloadBytes, expectations) {
  const problems = [];
  let doc;
  try { doc = JSON.parse(payloadBytes.toString('utf8')); } catch {
    return ['c19 payload: not valid JSON'];
  }
  let canonical;
  try { canonical = canonicalize(doc); } catch (e) { return [`c19 payload: ${e.message}`]; }
  if (canonical !== payloadBytes.toString('utf8')) {
    problems.push('c19 payload: the delivered bytes are not the canonical encoding of their own '
      + 'content; a signature over a noncanonical encoding proves nothing about the object');
  }
  for (const f of REQUIRED_PAYLOAD_FIELDS) {
    if (doc[f] === undefined) problems.push(`c19 payload: omits required field ${JSON.stringify(f)}`);
  }
  if (doc.schema !== 'eye/c19/payload') {
    problems.push(`c19 payload: schema ${JSON.stringify(doc.schema)} is not eye/c19/payload`);
  }
  if (doc.version !== 2) {
    problems.push(`c19 payload: version ${JSON.stringify(doc.version)}; this verifier reads 2 and `
      + 'refuses an unknown version rather than guessing');
  }
  if (doc.context !== domainContext(doc.purpose)) {
    problems.push(`c19 payload: context ${JSON.stringify(doc.context)} does not domain-separate `
      + `purpose ${JSON.stringify(doc.purpose)}`);
  }
  if (doc.purpose !== 'run-anchor') {
    problems.push(`c19 payload: purpose ${JSON.stringify(doc.purpose)} is not the delivery purpose`);
  }

  // EVERY mandatory binding, compared to an expectation established outside this document.
  // A missing expectation is a refusal: the caller could not say what it was verifying.
  const bindings = {
    sourceSha: expectations.sourceSha,
    sourceTree: expectations.sourceTree,
    sourceRunId: expectations.sourceRunId,
    sourceRunAttempt: expectations.sourceRunAttempt,
    sourceEvent: expectations.sourceEvent,
    finalizerRunId: expectations.finalizerRunId,
    finalizerRunAttempt: expectations.finalizerRunAttempt,
    workflowRef: expectations.workflowRef,
    workflowDigest: expectations.workflowDigest,
    evidenceArtifactId: expectations.evidenceArtifactId,
    evidenceArtifactName: expectations.evidenceArtifactName,
    evidenceDigest: expectations.evidenceDigest,
    finalizedInnerName: expectations.finalizedInnerName,
    finalizedInnerDigest: expectations.finalizedInnerDigest,
    signerId: 'sigstore-fulcio',
    keyVersion: 'fulcio-keyless',
    algorithm: expectations.algorithm,
  };
  for (const [field, expected] of Object.entries(bindings)) {
    if (expected === undefined || expected === null || expected === '') {
      problems.push(`c19 payload: no expected value was supplied for ${JSON.stringify(field)}; a `
        + 'binding nobody stated cannot be verified');
      continue;
    }
    if (String(doc[field]) !== String(expected)) {
      problems.push(`c19 payload: ${field} is ${JSON.stringify(doc[field])}; expected `
        + `${JSON.stringify(String(expected))}`);
    }
  }

  // The nonce must BE the publication identity these bindings determine — that is what makes a
  // retry reproducible and a substituted nonce detectable.
  try {
    const expectedNonce = publicationIdentity(doc);
    if (doc.nonce !== expectedNonce) {
      problems.push(`c19 payload: nonce ${JSON.stringify(doc.nonce)} is not the publication identity `
        + `its own bindings determine (${expectedNonce.slice(0, 16)}…)`);
    }
  } catch (e) {
    problems.push(`c19 payload: publication identity cannot be computed (${e.message})`);
  }

  // CURRENT validity, not merely internal consistency.
  const now = expectations.now ?? Date.now();
  const nbf = Date.parse(doc.notBefore);
  const exp = Date.parse(doc.expiresAt);
  const iat = Date.parse(doc.issuedAt);
  if (!Number.isFinite(nbf) || !Number.isFinite(exp) || !Number.isFinite(iat)) {
    problems.push('c19 payload: issuedAt, notBefore and expiresAt must all be instants');
  } else {
    if (exp <= nbf) problems.push('c19 payload: expires no later than it becomes valid');
    if (now < nbf) problems.push('c19 payload: presented before its notBefore');
    if (now > exp) problems.push('c19 payload: has expired');
  }
  return problems;
}

/**
 * Expectations gathered from the ENVIRONMENT the workflow establishes from GitHub's API — never
 * from the payload. Every one is mandatory; `verifyPayloadDocument` refuses any that is absent,
 * which is what turns a missing export into a loud failure instead of a skipped check.
 */
function expectationsFromEnv() {
  const { policy } = loadTrustMaterial(LIB);
  return {
    sourceSha: process.env.SOURCE_SHA,
    sourceTree: process.env.SOURCE_TREE,
    sourceRunId: process.env.SOURCE_RUN_ID,
    sourceRunAttempt: process.env.SOURCE_RUN_ATTEMPT,
    sourceEvent: process.env.SOURCE_EVENT,
    finalizerRunId: process.env.FINALIZER_RUN_ID,
    finalizerRunAttempt: process.env.FINALIZER_RUN_ATTEMPT,
    workflowRef: policy.identity.workflowRef,
    workflowDigest: process.env.WORKFLOW_DIGEST,
    evidenceArtifactId: process.env.EVIDENCE_ARTIFACT_ID,
    evidenceArtifactName: process.env.EVIDENCE_ARTIFACT_NAME,
    evidenceDigest: process.env.EVIDENCE_DIGEST,
    finalizedInnerName: process.env.FINALIZED_INNER_NAME,
    finalizedInnerDigest: process.env.FINALIZED_INNER_DIGEST,
    algorithm: policy.algorithms[0],
  };
}

/**
 * The dispatcher runs only when this file IS the program. Without this guard the module could not
 * be imported by a control at all — importing it ran the dispatcher, which exited the test process
 * on an unrecognised command. Logic that decides a gate has to be reachable by the controls that
 * check it.
 */
const invokedDirectly = (() => {
  const a = process.argv[1];
  if (typeof a !== 'string' || a === '') return false;
  try { return realpathSync(a) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0];

if (!invokedDirectly) { /* imported by a control: expose the functions, run nothing */ }
else if (cmd === 'selftest') await selftest(has('--offline'));
else if (cmd === 'leftovers') leftovers({ dockerOnly: has('--docker-only') });
else if (cmd === 'payload') buildPayloadFile(valueOf('--out') ?? die('payload requires --out'));
else if (cmd === 'publish') {
  // `await`ed. Without it a rejection became an unhandled promise and the process could exit 0
  // while publication had failed.
  await publish({
    dryRun: has('--dry-run'),
    recoverOrPublish: has('--recover-or-publish'),
    artifactPath: valueOf('--artifact'),
    payloadPath: valueOf('--payload'),
    bundlePath: valueOf('--bundle'),
  });
} else if (cmd === 'verify') {
  await verify({
    offline: has('--offline') || !has('--online'),
    requireDeliveryStanding: has('--require-delivery-standing'),
    artifactPath: valueOf('--artifact'),
    payloadPath: valueOf('--payload'),
    bundlePath: valueOf('--bundle'),
  });
} else {
  process.stderr.write('usage: c19-anchor-cli.mjs <selftest|leftovers|payload|publish|verify> [flags]\n');
  process.exit(2);
}
