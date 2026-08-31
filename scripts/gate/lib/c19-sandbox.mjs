/**
 * C19 — OFFLINE ENFORCED AT THE OPERATING SYSTEM, NOT INSIDE NODE.
 *
 * The previous offline guard patched Node's own networking primitives. That proves something about
 * code running in THIS process and nothing whatever about a spawned `cosign`, which is precisely
 * the process whose offline behaviour matters most: it is the one that would silently reach Fulcio
 * or Rekor and then report success.
 *
 * The boundary is therefore the kernel's:
 *
 *   Linux   `unshare --net` — the child gets an empty network namespace with no route anywhere.
 *   macOS   `sandbox-exec` with `(deny network*)` — the child's sockets are refused by the sandbox.
 *
 * Both constrain descendants, which is the whole point. If neither is available, offline
 * verification REFUSES rather than running unconstrained and calling the result offline.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX_PROFILE = `(version 1)
(allow default)
(deny network*)
`;

/**
 * Which OS mechanism is available here, if any.
 *
 * The probe is FUNCTIONAL, not a `which`. On GitHub's Linux runners `unshare` is installed and
 * nevertheless fails to create a network namespace — the binary existing says nothing about
 * whether the kernel will permit the call. A mechanism that is present but non-functional is worse
 * than an absent one, because it reports enforcement it does not provide.
 */
export function networkDenialMechanism(platform = process.platform, probe = worksHere) {
  if (platform === 'linux') return probe('unshare', ['--net', '-r', 'true']) ? 'unshare' : null;
  if (platform === 'darwin') return probe('sandbox-exec', ['-p', '(version 1)(allow default)', 'true']) ? 'sandbox-exec' : null;
  return null;
}

/** Actually run the mechanism over a trivial command and see whether it succeeds. */
const worksHere = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15_000 });
  return r.error === undefined && r.status === 0;
};

/**
 * Build the argv that runs `command` with the network denied at the OS boundary.
 *
 * Returned rather than executed so a control can assert on the exact invocation without needing
 * the mechanism to be present on the machine running the control.
 */
export function denyNetworkArgv(command, {
  platform = process.platform, profilePath, probe = worksHere,
} = {}) {
  const mech = networkDenialMechanism(platform, probe);
  if (mech === 'unshare') {
    // `-r` maps the current user to root INSIDE the namespace so no privilege is required outside.
    return ['unshare', '--net', '-r', ...command];
  }
  if (mech === 'sandbox-exec') {
    if (profilePath === undefined) throw new Error('c19-sandbox: a profile path is required on darwin');
    return ['sandbox-exec', '-f', profilePath, ...command];
  }
  return null;
}

/**
 * Run `command` with the network denied at the OS boundary.
 *
 * `{ enforced: false }` is never returned silently — when no mechanism exists this raises, because
 * an unconstrained run reported as offline is exactly the false assurance this replaces.
 */
export function runWithoutNetwork(command, {
  cwd, env, platform = process.platform, probe = worksHere,
} = {}) {
  const mech = networkDenialMechanism(platform, probe);
  if (mech === null) {
    throw new Error('c19-sandbox: no OS-level network denial is available on this platform '
      + '(need `unshare` on Linux or `sandbox-exec` on macOS); refusing to run unconstrained and '
      + 'call the result offline');
  }
  let profilePath;
  if (mech === 'sandbox-exec') {
    profilePath = join(mkdtempSync(join(tmpdir(), 'c19-sb-')), 'deny-network.sb');
    writeFileSync(profilePath, SANDBOX_PROFILE);
  }
  const argv = denyNetworkArgv(command, { platform, profilePath, probe });
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  return {
    mechanism: mech, enforced: true,
    status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '',
  };
}

/** The profile text, exported so a control can assert what is actually denied. */
export const DARWIN_PROFILE = SANDBOX_PROFILE;
