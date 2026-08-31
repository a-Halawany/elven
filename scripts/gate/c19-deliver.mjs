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
  recoverOrSign, verifyFinalBundle, persistDeliveryPackage,
} from './lib/c19-pipeline.mjs';
import { loadTrustMaterial } from './lib/c19-anchor.mjs';
import { assetKey, install as installCosign, COSIGN_PIN } from './lib/c19-cosign.mjs';
import { acquire } from './lib/c19-acquire.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, 'lib');
const say = (s) => process.stdout.write(`${s}\n`);
const die = (s) => { process.stderr.write(`C19 deliver: ${s}\n`); process.exit(1); };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const argv = process.argv.slice(2);
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
  const [, entry] = Object.entries(await r.json())[0] ?? [];
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
    const cosignPath = val('--cosign') ?? die('--cosign is required');
    const r = verifyFinalBundle({
      bundlePath: join(dir, 'bundle.sigstore.json'),
      payloadPath: join(dir, 'payload.json'),
      trustedRootPath: join(dir, 'trusted-root.json'),
      policy, trustedRoot, cosignPath, offline: true, recovery: true,
    });
    say(`C19 deliver: offline verification via ${r.cosignMechanism}, ${r.problems.length} finding(s)`);
    for (const p of r.problems) process.stderr.write(`  ${p}\n`);
    if (r.problems.length > 0) die('offline verification failed');
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
  const { source, finalizer, problems: resolveProblems } = resolve({ gh, sha, invocation });
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

  // ── 10 the deterministic payload ─────────────────────────────────────────
  const sourceTree = spawnSync('git', ['rev-parse', `${acquisition.authed.sourceSha}^{tree}`],
    { encoding: 'utf8' }).stdout?.trim();
  if (!sourceTree) die('the source tree could not be resolved; a fetched history is required');
  const wfPath = join(HERE, '..', '..', '.github', 'workflows', 'c19-anchor.yml');
  const built = buildCanonicalPayload({
    authed: acquisition.authed, acquisition, sourceTree,
    workflowRef: policy.identity.workflowRef,
    // GitHub's workflow COMMIT, supplied by the workflow. Fulcio records this, not a YAML hash.
    workflowDigest: val('--workflow-sha') ?? process.env.WORKFLOW_SHA ?? acquisition.authed.sourceSha,
    workflowYamlDigest: existsSync(wfPath) ? sha256(readFileSync(wfPath)) : 'unavailable',
    sourceEvent: source.event,
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
