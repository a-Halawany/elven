/**
 * C19 — ONE PINNED COSIGN, USED EVERYWHERE.
 *
 * The previous workflow installed cosign v2.4.1 in the publish job only, referred to it by an
 * environment variable that other steps did not set, and verified nothing with it. So the binary
 * that signed was not demonstrably the binary that verified, and `DELEGATED_TO_COSIGN` named
 * mandatory checks that no cosign invocation actually performed.
 *
 * Here there is one pin, one digest check before execution, and one resolved path that signing and
 * every verification step share. A verifier that is not the signer's own tool proves less than it
 * appears to, and a tool that is never invoked proves nothing at all.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COSIGN_PIN = JSON.parse(readFileSync(join(HERE, 'c19-cosign.json'), 'utf8'));

/** The asset key for a platform, or null when this gate pins nothing for it. */
export function assetKey(platform = process.platform, arch = process.arch) {
  const p = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
  const a = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'amd64' : null;
  if (p === null || a === null) return null;
  const key = `${p}-${a}`;
  return COSIGN_PIN.assets[key] === undefined ? null : key;
}

export const downloadUrl = (key) => `https://github.com/sigstore/cosign/releases/download/`
  + `${COSIGN_PIN.version_tag}/${COSIGN_PIN.assets[key].file}`;

/**
 * Verify a downloaded cosign against its pinned digest BEFORE it is ever executed.
 *
 * Checking after running it would be theatre: the binary has already done whatever it does.
 */
/**
 * ── THE ONE GUARD EVERY EXECUTION SITE MUST PASS ──
 *
 * `verifyBinary` RETURNS its findings; it does not throw. A caller that wrapped it in try/catch and
 * returned null unless it threw therefore discarded the digest check entirely, and spawned whatever
 * sat at the given path. An executable that merely exits 0 then produced a clean verification: no
 * digest authentication, and delivery standing granted on one verifier instead of two.
 *
 * This returns findings for the same reason - the package verifier reports findings, it does not
 * throw - and every site that is about to spawn cosign calls it and refuses on a nonempty result.
 * An unsupported or unpinned platform is a finding too, not a silently skipped check.
 */
export function authenticateCosign(cosignPath) {
  if (typeof cosignPath !== 'string' || cosignPath === '') {
    return ['c19-cosign: no cosign path was supplied, so the pinned binary cannot be authenticated '
      + 'and must not be executed'];
  }
  const key = assetKey();
  if (key === null) {
    return [`c19-cosign: no asset is pinned for ${process.platform}/${process.arch}, so no binary `
      + 'here can be authenticated against the pin; refusing to execute an unverifiable signing tool'];
  }
  try {
    return verifyBinary(cosignPath, key);
  } catch (e) {
    return [`c19-cosign: ${cosignPath} could not be read for authentication (${e.message})`];
  }
}

export function verifyBinary(path, key) {
  const expected = COSIGN_PIN.assets[key]?.sha256;
  if (expected === undefined) return [`c19-cosign: nothing is pinned for ${key}`];
  if (!existsSync(path)) return [`c19-cosign: ${path} does not exist`];
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== expected) {
    return [`c19-cosign: ${path} hashes to ${actual}, but ${COSIGN_PIN.version_tag} `
      + `${key} is pinned at ${expected}; refusing to execute an unverified signing tool`];
  }
  return [];
}

/** Install the pinned cosign, verifying it before making it executable. */
export function install(destPath, {
  key = assetKey(), fetch = defaultFetch,
} = {}) {
  if (key === null) throw new Error(`c19-cosign: no pinned asset for ${process.platform}/${process.arch}`);
  writeFileSync(destPath, fetch(downloadUrl(key)));
  const problems = verifyBinary(destPath, key);
  if (problems.length > 0) throw new Error(problems[0]);
  chmodSync(destPath, 0o755);
  return { path: destPath, key, version: COSIGN_PIN.version_tag };
}

const defaultFetch = (url) => {
  const r = spawnSync('curl', ['-fsSL', url], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`c19-cosign: download failed for ${url}`);
  return r.stdout;
};

/**
 * The verification argv. Returned rather than executed so the exact invocation is assertable, and
 * so the same command can be run inside the OS network sandbox for offline verification.
 *
 * Identity is passed EXACTLY — `--certificate-identity`, not a regexp variant — because an
 * identity policy that accepts a pattern accepts workflows this gate never authorised.
 */
export function verifyBlobArgv({
  cosignPath, bundlePath, payloadPath, certificateIdentity, oidcIssuer, trustedRootPath, offline = true,
}) {
  const argv = [
    cosignPath, 'verify-blob',
    '--bundle', bundlePath,
    '--certificate-identity', certificateIdentity,
    '--certificate-oidc-issuer', oidcIssuer,
  ];
  if (trustedRootPath !== undefined) argv.push('--trusted-root', trustedRootPath);
  // Offline verification must not consult the log over the network; the bundle carries its proof.
  if (offline) argv.push('--insecure-ignore-tlog=false', '--offline');
  argv.push(payloadPath);
  return argv;
}

/** The signing argv. One binary, one bundle format, stated explicitly rather than defaulted. */
export function signBlobArgv({ cosignPath, bundlePath, payloadPath }) {
  return [cosignPath, 'sign-blob', '--yes', '--new-bundle-format', '--bundle', bundlePath, payloadPath];
}
