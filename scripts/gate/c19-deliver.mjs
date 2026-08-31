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
} from './lib/c19-pipeline.mjs';
import { loadTrustMaterial } from './lib/c19-anchor.mjs';
import { assetKey, install as installCosign, COSIGN_PIN } from './lib/c19-cosign.mjs';
import { proveNetworkDenial, runWithoutNetwork } from './lib/c19-sandbox.mjs';
import { acquire } from './lib/c19-acquire.mjs';

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

/** Rekor reads. Publication is online by nature; offline verification never calls these. */
const rekorSearch = async (digestHex) => {
  const r = await fetch('https://rekor.sigstore.dev/api/v1/index/retrieve', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash: `sha256:${digestHex}` }),
  });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`rekor index query returned HTTP ${r.status}`);
  const uuids = await r.json();
  return Array.isArray(uuids) ? uuids : [];
};
const rekorEntry = async (uuid) => {
  const r = await fetch(`https://rekor.sigstore.dev/api/v1/log/entries/${encodeURIComponent(uuid)}`);
  if (!r.ok) throw new Error(`rekor entry fetch returned HTTP ${r.status}`);
  const body = await r.json();
  // The response is keyed by uuid. It must be the uuid we ASKED for: accepting whatever came back
  // would let a redirect or a shape change substitute a different record entirely.
  const [gotUuid, entry] = Object.entries(body)[0] ?? [];
  if (gotUuid !== uuid) {
    throw new Error(`rekor returned entry ${JSON.stringify(gotUuid)} for request ${JSON.stringify(uuid)}`);
  }
  return entry ?? null;
};

async function main() {
  const mode = argv[0];
  if (!PIPELINE_MODES.includes(mode)) {
    process.stderr.write(`usage: c19-deliver.mjs <${PIPELINE_MODES.join('|')}> [flags]\n`);
    process.exit(2);
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
    const problems = verifyDeliveryPackage({ dir, policy, trustedRoot, cosignPath: val('--cosign') });
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
    /**
     * The tip was current when we resolved. Everything since - listing runs, downloading and
     * verifying the evidence, building the payload - took time against a live API, and main can
     * move inside it. Anchoring a superseded commit is not undoable once Rekor accepts it, so the
     * check is repeated here, against the last reversible moment rather than the first.
     */
    const tipNow = gh.branchTip('main');
    if (tipNow !== sha) {
      die(`c19: main advanced to ${tipNow} while this publication was being prepared; ${sha} is no `
        + 'longer the tip and must not be anchored. Refusing before the irreversible step.');
    }
    say(`C19 deliver: main tip re-confirmed as ${sha.slice(0, 12)} immediately before signing`);

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
    metadata: {
      innerName: acquisition.innerName,
      certificateIdentity: policy.identity.subjectAlternativeName,
      oidcIssuer: policy.identity.issuer,
      publicationIdentity: built.identity,
      signings: outcome.signings ?? 0,
    },
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
