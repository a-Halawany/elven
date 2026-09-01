#!/usr/bin/env node
/**
 * C19 — THE DELIVERY COMMAND.
 *
 * A thin front for `lib/c19-pipeline.mjs`. Every caller — local controls, the hosted non-publishing
 * harness, the real publication workflow, recovery, and foreign-checkout verification — runs THIS,
 * in one of four modes. There is no second implementation anywhere, and workflow YAML holds no
 * resolution, acquisition, recovery or verification logic of its own.
 *
 *   plan            resolve the canonical publication identity and stop
 *   dry-run         everything reversible, then stop before OIDC, signing and Rekor writes
 *   publish         the real path: recover an existing publication, or sign exactly once
 *   verify-offline  verify a delivered package with the network denied at the OS boundary
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHub } from './lib/c19-github.mjs';
import {
  PIPELINE_MODES, resolve, buildCanonicalPayload, validateBeforeIrreversible,
  recoverOrSign, verifyFinalBundle, persistDeliveryPackage, verifyDeliveryPackage,
  buildDeliveryMetadata,
} from './lib/c19-pipeline.mjs';
import { loadTrustMaterial } from './lib/c19-anchor.mjs';
import { assetKey, install as installCosign, COSIGN_PIN } from './lib/c19-cosign.mjs';
import {
  proveNetworkDenial, runWithoutNetwork, proveThisProcessIsNetworkDenied,
} from './lib/c19-sandbox.mjs';
import { acquire } from './lib/c19-acquire.mjs';
import { rekorSearch, rekorEntry } from './lib/c19-rekor-transport.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, 'lib');
const say = (s) => process.stdout.write(`${s}\n`);
const die = (s) => { process.stderr.write(`C19 deliver: ${s}\n`); process.exit(1); };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const argv = process.argv.slice(2);
/** The re-execution marker. See `verify-offline` below for why it is argv and not the environment. */
const INSIDE_SANDBOX = '--inside-sandbox';
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

/**
 * Every flag this command knows. An unrecognised flag is refused rather than ignored: a silently
 * dropped `--workflow-sha` produced a payload built from a default, and an INTERNAL marker
 * supplied by hand produced a result labelled offline that was not.
 */
const KNOWN_FLAGS = Object.freeze([
  '--out', '--package', '--repo', '--sha', '--finalizer-run', '--finalizer-attempt',
  '--source-root', '--workflow-sha', '--cosign', '--signer-run', '--signer-attempt', '--anchor',
]);

/**
 * Read a source-owned anchor from a directory. The production layout and the package layout name
 * the same three things differently, so both are accepted - and a directory carrying neither is
 * refused rather than yielding an anchor of undefineds that would compare equal to nothing.
 */
function loadAnchor(dir) {
  const pick = (...names) => {
    for (const n of names) { if (existsSync(join(dir, n))) return join(dir, n); }
    return null;
  };
  const policyPath = pick('c19-trust.json', 'policy.json');
  const rootPath = pick('c19-sigstore-tuf-root.json', 'tuf-root.json');
  if (policyPath === null || rootPath === null) {
    die(`${dir} is not a source-owned anchor: it holds neither the production trust policy and TUF `
      + 'root nor the package-shaped policy.json and tuf-root.json');
  }
  const anchorPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
  return {
    trustedRootSha256: anchorPolicy.tuf.trustedRootSha256,
    tufRootSha256: sha256(readFileSync(rootPath)),
    policySha256: sha256(readFileSync(policyPath)),
    minimumVersions: anchorPolicy.tuf.minimumVersions ?? {},
    policy: anchorPolicy,
  };
}

async function main() {
  const mode = argv[0];
  if (!PIPELINE_MODES.includes(mode)) {
    process.stderr.write(`usage: c19-deliver.mjs <${PIPELINE_MODES.join('|')}> [flags]\n`);
    process.exit(2);
  }
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    if (KNOWN_FLAGS.includes(a)) { i += 1; continue; }
    if (a === INSIDE_SANDBOX) continue;   // routing only; the isolation proof is below, not here
    die(`unknown flag ${JSON.stringify(a)}. Flags are not ignored: one dropped silently is how a `
      + 'default reaches a signed payload.');
  }
  const out = val('--out') ?? die('--out is required');
  mkdirSync(out, { recursive: true });
  const { policy, trustedRoot } = loadTrustMaterial(LIB);

  // ── verify-offline needs no GitHub at all ──────────────────────────────────
  if (mode === 'verify-offline') {
    const dir = val('--package') ?? die('--package is required for verify-offline');
    // The WHOLE verifier runs inside the OS boundary — this process re-executes itself under the
    // sandbox, so Node and every descendant it spawns are constrained. Verifying "offline" from an
    // unconstrained process proves nothing about what that process reaches for.
    /**
     * The marker is an ARGUMENT, not an environment variable.
     *
     * It was `C19_INSIDE_SANDBOX=1` in the environment, and `sudo` - which the Linux mechanism
     * needs, because unprivileged `unshare` does not work on hosted runners - resets the
     * environment of the command it runs. The marker never reached the child, so the child took
     * the outer branch and re-executed itself again. On CI that printed the "re-executing" line
     * twice and never ran the verification at all. An environment variable is strippable; argv
     * is not, and it must carry no secret precisely because it is visible in the process table.
     */
    if (!argv.includes(INSIDE_SANDBOX)) {
      const proof = proveNetworkDenial();
      if (!proof.ok) die(`${proof.why}. Offline verification cannot be performed here.`);
      say(`C19 deliver: re-executing the whole verifier inside the ${proof.mechanism} boundary`);
      const r = runWithoutNetwork(
        [process.execPath, fileURLToPath(import.meta.url), ...argv, INSIDE_SANDBOX],
        { env: process.env, mechanism: proof.mechanism },
      );
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      process.exit(r.status === null ? 1 : r.status);
    }

    /**
     * ── THE MARKER IS A CLAIM; THIS IS THE EVIDENCE ──
     *
     * Trusting the marker meant any caller could pass it and get a result labelled "offline" that
     * was produced with the network fully available - the verification would run, print its
     * findings, and never once be constrained. The marker only routes; it proves nothing.
     *
     * So the child establishes its own isolation from its own environment: it attempts a
     * connection to a literal address and requires the operating system to refuse it.
     */
    const isolated = proveThisProcessIsNetworkDenied();
    if (!isolated.ok) die(`${isolated.why} (observed: ${isolated.evidence})`);
    say(`C19 deliver: isolation confirmed from inside — ${isolated.evidence}`);

    /**
     * ── THE ANCHOR IS HELD INDEPENDENTLY OF THE PACKAGE ──
     *
     * Verifying the package's trust material against the package's own trust material proves
     * nothing, which is what shipping those files and then ignoring them amounted to. The anchor
     * comes from a source-owned checkout - this repository by default, or `--anchor <dir>` for a
     * source-owned fixture whose CA is deliberately not the real Fulcio.
     *
     * It is a DIRECTORY, never a file inside the package: if the two could be the same place the
     * independence would be nominal.
     */
    const anchorDir = val('--anchor') ?? LIB;
    if (realpathSync(anchorDir) === realpathSync(dir)) {
      die('--anchor must not be the package being verified; an anchor taken from inside the '
        + 'package authenticates the package against itself');
    }
    const anchor = loadAnchor(anchorDir);
    const problems = verifyDeliveryPackage({
      dir, policy: anchor.policy, trustedRoot, anchor,
      // REQUIRED. A foreign checkout cannot download cosign - it has no network by construction -
      // so the operator supplies the pinned binary and the verifier authenticates it by digest
      // before executing it. Absent, verification refuses rather than silently omitting the
      // delegated Sigstore checks, which is what "accepts cosignPath but never invokes cosign"
      // amounted to.
      cosignPath: val('--cosign') ?? die('--cosign is required for verify-offline: the delegated '
        + `Sigstore checks are not optional. Supply the pinned ${COSIGN_PIN.version_tag} binary; `
        + 'its digest is verified before it is executed.'),
    });
    say(`C19 deliver: package verification, ${problems.length} finding(s)`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    if (problems.length > 0) die('offline package verification failed');
    say('C19 deliver: verify-offline PASS');
    return;
  }

  const repo = val('--repo') ?? die('--repo is required');
  const sha = val('--sha') ?? die('--sha is required');
  const gh = createGitHub({ repo });

  // ── 1–4 resolve, and refuse a non-canonical or duplicate invocation ───────
  const invocation = val('--finalizer-run') === undefined ? undefined : {
    finalizerRunId: val('--finalizer-run'), finalizerAttempt: val('--finalizer-attempt'),
  };
  /**
   * The superseded-tip guard applies to PUBLICATION, always. The dry-run harness deliberately
   * exercises a HISTORICAL publication — a past commit with an intact chain — so requiring it to be
   * main's current tip would make the harness impossible rather than safe.
   *
   * The distinction is structural, not a flag a caller can pass: `publish` always enforces, and no
   * argument can turn it off. `plan` and `dry-run` cannot sign anything, so they exercise history.
   *
   * Resolution is not the last word. A branch can move between resolution and the irreversible step
   * - the acquisition, verification and payload construction in between take minutes against the
   * live API - so publish RE-CHECKS the tip immediately before signing, below.
   */
  const requireCurrentTip = mode === 'publish';
  const { source, finalizer, problems: resolveProblems } = resolve({ gh, sha, invocation, requireCurrentTip });
  if (!requireCurrentTip) {
    say(`C19 deliver: ${mode} against a historical publication; the superseded-tip guard is not `
      + 'applicable to a mode that cannot sign, and is ENFORCED UNCONDITIONALLY in publish mode');
  }
  if (resolveProblems.length > 0) { for (const p of resolveProblems) process.stderr.write(`  ${p}\n`); die('resolution refused this invocation'); }
  say(`C19 deliver: canonical source ${source.runId}#${source.runAttempt}, `
    + `finalizer ${finalizer.runId}#${finalizer.runAttempt}`
    + `${finalizer.causallyBound ? ' (causally bound)' : ' (same-SHA, unambiguous)'}`);
  if (mode === 'plan') {
    writeFileSync(join(out, 'plan.json'), JSON.stringify({ source, finalizer }, null, 2));
    say('C19 deliver: plan PASS'); return;
  }

  // ── 5–9 acquire and authenticate ─────────────────────────────────────────
  // Resolution PROPOSES the publication identity; the verified evidence AUTHENTICATES it. GitHub's
  // run object does not expose which run triggered a workflow_run, so the causal binding cannot come
  // from the listing — it comes from the finalizer receipt inside the C17-verified evidence, and
  // `expect` makes the two agree or fail.
  const acquisition = acquireOrDie({
    gh, finalizer, out, sourceRoot: val('--source-root'),
    expect: {
      finalizerRunId: finalizer.runId, finalizerRunAttempt: finalizer.runAttempt,
      sourceRunId: source.runId, sourceRunAttempt: source.runAttempt, sourceSha: sha,
    },
  });
  say(`C19 deliver: wrapper ${acquisition.wrapperDigest.slice(0, 16)}… inner ${acquisition.innerName}`);
  say(`C19 deliver: authenticated source ${acquisition.authed.sourceRunId}#${acquisition.authed.sourceRunAttempt}`);

  /**
   * The workflow COMMIT is a signed claim, so it is required rather than defaulted.
   *
   * It used to fall back to the source commit. That is a different commit of a different thing:
   * the payload would assert a workflow digest that is not the workflow's, and no Fulcio
   * certificate could ever match it - a false binding, signed, produced silently by omitting a
   * flag. An absent value is refused instead.
   */
  const workflowSha = val('--workflow-sha') ?? process.env.WORKFLOW_SHA;
  if (workflowSha === undefined || workflowSha === '') {
    die('the workflow commit is required (--workflow-sha, or WORKFLOW_SHA in the environment). '
      + "Fulcio's Build Config Digest is GitHub's `workflow_sha`; substituting the source commit "
      + 'would sign a binding that is false and could never verify.');
  }

  // ── 10 the deterministic payload ─────────────────────────────────────────
  const sourceTree = spawnSync('git', ['rev-parse', `${acquisition.authed.sourceSha}^{tree}`],
    { encoding: 'utf8' }).stdout?.trim();
  if (!sourceTree) die('the source tree could not be resolved; a fetched history is required');
  const wfPath = join(HERE, '..', '..', '.github', 'workflows', 'c19-anchor.yml');
  const built = buildCanonicalPayload({
    authed: acquisition.authed, acquisition, sourceTree,
    workflowRef: policy.identity.workflowRef,
    // GitHub's workflow COMMIT, supplied by the workflow. Fulcio records this, not a YAML hash.
    workflowDigest: workflowSha,
    workflowYamlDigest: existsSync(wfPath) ? sha256(readFileSync(wfPath)) : 'unavailable',
    sourceEvent: source.event,
    finalizerCompletedAt: finalizer.completedAt,
  });
  const payloadPath = join(out, 'payload.json');
  writeFileSync(payloadPath, built.canonical);
  const canonicalBytes = Buffer.from(built.canonical, 'utf8');
  say(`C19 deliver: payload ${sha256(canonicalBytes).slice(0, 16)}… identity ${built.identity.slice(0, 16)}…`);

  // ── 11 EVERY reversible check, before anything irreversible ──────────────
  const vProblems = validateBeforeIrreversible({
    payload: built.payload, canonicalBytes, acquisition, policy, expectSha: sha,
  });
  if (vProblems.length > 0) { for (const p of vProblems) process.stderr.write(`  ${p}\n`); die('validation failed before any irreversible step'); }
  say('C19 deliver: all reversible validation passed');

  /**
   * ── PROVE THE OFFLINE BOUNDARY BEFORE ANYTHING IRREVERSIBLE ──
   *
   * The publish job runs on Ubuntu, where unprivileged `unshare` does not work. The pipeline used
   * to sign FIRST and then call offline verification, which threw because no mechanism existed —
   * publishing to Rekor and then deterministically failing before persistence. A boundary that is
   * discovered to be missing after the irreversible step is not a boundary.
   *
   * So it is proved here, functionally, while everything is still reversible. No sandbox means
   * ZERO signing attempts.
   */
  if (mode === 'publish') {
    const proof = proveNetworkDenial();
    if (!proof.ok) {
      die(`${proof.why}. Refusing to sign: a publication that cannot then be verified offline is `
        + 'worse than no publication.');
    }
    say(`C19 deliver: offline boundary proved functional via ${proof.mechanism}, before signing`);
  }

  // ── 12–13 search, then reconstruct or sign exactly once ──────────────────
  const bundlePath = join(out, 'bundle.sigstore.json');
  const cosignPath = val('--cosign');
  const outcome = await recoverOrSign({
    canonicalBytes, payloadPath, bundlePath, policy, trustedRoot, gh, cosignPath,
    search: rekorSearch, fetchEntry: rekorEntry, mode,
    /**
     * The tip was current at resolution. Acquisition, C17 verification, payload construction, the
     * isolation proof and the log query all happened since, every one of them against something
     * live. Anchoring a superseded commit is not undoable once Rekor accepts it, so the answer is
     * taken here - after the search, with nothing between this and the signature.
     */
    beforeSign: mode !== 'publish' ? undefined : () => {
      const tipNow = gh.branchTip('main');
      if (tipNow === sha) {
        say(`C19 deliver: main tip re-confirmed as ${sha.slice(0, 12)} with nothing left before sign-blob`);
        return undefined;
      }
      return `c19: main advanced to ${tipNow} while this publication was being prepared; ${sha} is `
        + 'no longer the tip and must not be anchored. Refused at the last reversible moment.';
    },
  });
  say(`C19 deliver: ${outcome.action}${outcome.why ? ` — ${outcome.why}` : ''}`);
  if (outcome.action === 'refuse') die(outcome.why);
  if (mode === 'dry-run') {
    say('C19 deliver: DRY RUN — zero OIDC requests, zero signing operations, zero Rekor writes');
    say('C19 deliver: dry-run PASS');
    return;
  }

  // ── 14 verify with BOTH verifiers, cosign offline at the OS boundary ─────
  const fin = verifyFinalBundle({
    bundlePath, payloadPath, policy, trustedRoot,
    trustedRootPath: join(LIB, 'c19-sigstore-trusted-root.json'),
    cosignPath, sourceSha: acquisition.authed.sourceSha,
    workflowDigest: built.payload.workflowDigest,
    runId: val('--signer-run'), runAttempt: val('--signer-attempt'),
    recovery: outcome.action === 'reuse', gh, offline: true,
  });
  if (fin.problems.length > 0) { for (const p of fin.problems) process.stderr.write(`  ${p}\n`); die('final verification failed'); }
  say(`C19 deliver: final verification PASS (cosign ${COSIGN_PIN.version_tag}, offline via ${fin.cosignMechanism})`);

  // ── 15 persist the offline-verifiable package ────────────────────────────
  const dir = persistDeliveryPackage({
    out, acquisition, payloadPath, bundlePath, libDir: LIB,
    metadata: buildDeliveryMetadata({ repo, acquisition, policy, built, outcome }),
  });
  say(`C19 deliver: delivery package at ${dir}`);
  say(`C19 deliver: publish PASS (${outcome.signings ?? 0} signing operation(s))`);
}

function acquireOrDie({ gh, finalizer, out, sourceRoot, expect }) {
  return acquire({
    gh, finalizerRunId: finalizer.runId, finalizerAttempt: finalizer.runAttempt,
    out, sourceRoot, token: process.env.GITHUB_TOKEN, expect,
  });
}
const invokedDirectly = (() => {
  const a = process.argv[1];
  if (typeof a !== 'string' || a === '') return false;
  try { return realpathSync(a) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (invokedDirectly) { await main(); }

export { main };
