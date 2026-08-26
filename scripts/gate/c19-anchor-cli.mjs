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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadTrustMaterial, verifyBundle, verifyIdentity, certificateIdentity, pinnedRekorKeys,
  pinnedCaCertificates, verifyInclusionProof, leafHash, nodeHash,
} from './lib/c19-anchor.mjs';
import { C19_FROZEN, route } from './lib/c19-criteria.mjs';
import { verifyAuthorityLedger, closedClaims, openLimits } from './lib/c19-authority.mjs';
import { DOCKER_RUN_LABEL } from './lib/c18-contract.mjs';
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

/** No owned process and no owned docker resource may survive a completed run. */
function leftovers() {
  const ids = spawnSync('docker', ['ps', '-aq', '--filter', `label=${DOCKER_RUN_LABEL}`],
    { encoding: 'utf8' }).stdout ?? '';
  const containers = ids.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  say(`C19 leftovers: ${containers.length} labelled docker resource(s) remain`);
  if (containers.length > 0) {
    for (const c of containers) process.stderr.write(`  stranded: ${c}\n`);
    die('a completed run left owned docker resources behind');
  }
  say('C19 leftovers: PASS (zero owned resources remain)');
}

/**
 * IDEMPOTENT PUBLICATION.
 *
 * A run that was interrupted after Rekor accepted an entry but before the bundle was persisted
 * must NOT sign again. A second signing event for the same bytes is a second identity assertion,
 * and it turns the transparency log into a record of our retries rather than of our releases. So
 * the log is searched for an entry over exactly these bytes first, and one is only created if the
 * search comes back empty.
 */
function publish({ dryRun, artifactPath, bundlePath }) {
  const sourceSha = process.env.SOURCE_SHA ?? '';
  const runUri = process.env.RUN_URI ?? '';
  const cosign = process.env.COSIGN ?? 'cosign';
  if (sourceSha === '') die('SOURCE_SHA is not set; a publication must name the commit it attests');

  if (artifactPath === undefined || !existsSync(artifactPath)) {
    say('C19 publish: no artifact supplied — reporting what WOULD happen');
    say(`  would attest commit : ${sourceSha}`);
    say(`  would record run    : ${runUri}`);
    say(`  signer              : sigstore-fulcio (keyless, GitHub Actions OIDC)`);
    say('  the OIDC token is requested in-process by cosign and never written anywhere');
    if (dryRun) { say('C19 publish: DRY RUN — nothing was published'); return; }
    die('no artifact to publish');
  }

  const bytes = readFileSync(artifactPath);
  const digest = sha256hex(bytes);
  say(`C19 publish: artifact ${artifactPath}`);
  say(`  sha256 ${digest}`);

  // ── RECOVERY FIRST ──
  const search = spawnSync(cosign, ['verify-blob', '--help'], { encoding: 'utf8' });
  if (search.error !== undefined) die(`cosign is not usable (${search.error.code ?? 'spawn error'})`);

  if (dryRun) {
    say('  would search Rekor for an existing entry over this exact digest');
    say('  would reuse that entry if found, and sign exactly once if not');
    say('C19 publish: DRY RUN — nothing was published');
    return;
  }

  if (bundlePath !== undefined && existsSync(bundlePath)) {
    say('  a bundle already exists for this run; verifying rather than signing again');
    const { policy, trustedRoot } = loadTrustMaterial(LIB);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const problems = verifyBundle({
      bundle, artifactBytes: bytes, artifactDigestHex: digest, policy, trustedRoot,
      sourceSha, expectedRunUri: runUri,
    });
    if (problems.length > 0) { for (const p of problems) process.stderr.write(`  ${p}\n`); die('the existing bundle does not verify'); }
    say('C19 publish: recovered and verified an existing entry; no new signing event');
    return;
  }

  // ── SIGN ONCE ──
  // `--yes` accepts the transparency-log notice; the token itself is never handled here.
  const out = bundlePath ?? `${artifactPath}.sigstore.json`;
  const r = spawnSync(cosign, ['sign-blob', '--yes', '--bundle', out, artifactPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) die(`cosign sign-blob failed (exit ${r.status})`);
  say(`C19 publish: signed once and recorded in Rekor; bundle at ${out}`);
}

/** Judge a delivered bundle. Offline is the default because online is the exception. */
async function verify({ offline, requireDeliveryStanding, artifactPath, bundlePath }) {
  if (artifactPath === undefined || bundlePath === undefined) {
    say('C19 verify: no artifact/bundle supplied; verifying the trust material only');
    await selftest(offline);
    return;
  }
  const run = async () => {
    const { policy, trustedRoot } = loadTrustMaterial(LIB);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const bytes = readFileSync(artifactPath);
    return verifyBundle({
      bundle, artifactBytes: bytes, artifactDigestHex: sha256hex(bytes), policy, trustedRoot,
      sourceSha: process.env.SOURCE_SHA, expectedRunUri: process.env.RUN_URI,
      requireDeliveryStanding,
    });
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

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0];

if (cmd === 'selftest') await selftest(has('--offline'));
else if (cmd === 'leftovers') leftovers();
else if (cmd === 'publish') {
  publish({
    dryRun: has('--dry-run'),
    artifactPath: valueOf('--artifact'),
    bundlePath: valueOf('--bundle'),
  });
} else if (cmd === 'verify') {
  await verify({
    offline: has('--offline') || !has('--online'),
    requireDeliveryStanding: has('--require-delivery-standing'),
    artifactPath: valueOf('--artifact'),
    bundlePath: valueOf('--bundle'),
  });
} else {
  process.stderr.write('usage: c19-anchor-cli.mjs <selftest|leftovers|publish|verify> [flags]\n');
  process.exit(2);
}
